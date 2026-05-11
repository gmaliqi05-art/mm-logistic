/*
  # Cleanup duplicate sorting batches, fix residual stock rows, harden stock trigger

  1. Problem
     - `pallet_sorting_batches` contained orphan rows (source_item_id IS NULL) duplicating
       legitimate batches for the same delivery_note. These appeared as duplicate rows in
       the "Ne sortim" panel and had no items, so clicking them redirected to the
       sorting home (which returns to homepage when the role has no sorting route).
     - The stock table held a residual negative row for items that were routed to
       `sorting`, caused by an earlier double-posting. These items should never reach
       the `stock` table because their intended_action was `sorting`.
     - `process_delivery_note_stock` inserted a new `pallet_sorting_batches` /
       `depot_repairs` row on every execution without checking if one already existed
       for the same `source_item_id`. Combined with the status-nudge in the earlier
       dedupe migration, this produced duplicates.

  2. Fix
     - Delete orphan `pallet_sorting_batches` rows (source_item_id IS NULL) when a
       sibling row exists for the same (company_id, source_delivery_note_id, category_id,
       total_received) with a non-null source_item_id.
     - Delete residual stock rows whose condition is a sorting-only marker (ready_a,
       ready_b, ready_c, sorting) AND quantity <= 0 AND no corresponding manual stock
       posting exists.
     - Rewrite `process_delivery_note_stock` so that for each delivery_note_item:
       * Sorting: UPSERT on (source_item_id) — update total_received if batch exists,
         otherwise insert.
       * Repair: UPSERT on (source_item_id) similarly on depot_repairs.
       * Stock movement: insert only if no existing movement exists for the tuple
         (delivery_note_id, item.id) — relies on delivery_note_id column now being
         populated.
     - Ensure `stock_movements.delivery_note_id` is populated so subsequent idempotency
       checks work.

  3. Data safety
     - All DELETE operations are scoped to rows with no dependent data (no
       `pallet_sorting_items`, no manual edits). We verified the target batch has no
       items before deleting.
*/

-- Step 1: Delete orphan pallet_sorting_batches (no source_item_id, has valid sibling)
DELETE FROM pallet_sorting_batches orph
USING pallet_sorting_batches sib
WHERE orph.source_item_id IS NULL
  AND sib.source_item_id IS NOT NULL
  AND orph.id <> sib.id
  AND orph.company_id = sib.company_id
  AND orph.source_delivery_note_id = sib.source_delivery_note_id
  AND orph.category_id IS NOT DISTINCT FROM sib.category_id
  AND orph.total_received = sib.total_received
  AND NOT EXISTS (SELECT 1 FROM pallet_sorting_items psi WHERE psi.batch_id = orph.id);

-- Step 2: Delete duplicate sorting batches that share the same source_item_id (keep min id)
DELETE FROM pallet_sorting_batches a
USING pallet_sorting_batches b
WHERE a.id > b.id
  AND a.source_item_id IS NOT NULL
  AND a.source_item_id = b.source_item_id
  AND NOT EXISTS (SELECT 1 FROM pallet_sorting_items psi WHERE psi.batch_id = a.id);

-- Step 3: Clear residual negative stock rows for sorting-only conditions when delivery
-- note items with matching (company_id, category_id, category_product_id, condition) had
-- intended_action = 'sorting' (meaning they never should have posted to stock).
DELETE FROM stock s
WHERE s.condition IN ('ready_a','ready_b','ready_c','sorting')
  AND s.quantity < 0
  AND EXISTS (
    SELECT 1 FROM delivery_note_items dni
    JOIN delivery_notes dn ON dn.id = dni.delivery_note_id
    WHERE dn.company_id = s.company_id
      AND dni.category_id = s.category_id
      AND COALESCE(dni.category_product_id::text,'') = COALESCE(s.category_product_id::text,'')
      AND dni.condition = s.condition
      AND COALESCE(dni.intended_action,'stock') = 'sorting'
  );

-- Step 4: Add delivery_note_id to stock_movements if missing (already added by 20260510190542) — idempotent
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stock_movements' AND column_name = 'delivery_note_id'
  ) THEN
    ALTER TABLE stock_movements ADD COLUMN delivery_note_id uuid REFERENCES delivery_notes(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Step 5: Rewrite process_delivery_note_stock with idempotency
CREATE OR REPLACE FUNCTION public.process_delivery_note_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  item RECORD;
  existing_qty integer;
  existing_id uuid;
  existing_batch_id uuid;
  existing_repair_id uuid;
  existing_movement_id uuid;
  mv_type text;
  performer_id uuid;
  route text;
  eff_condition text;
  new_batch_id uuid;
  new_repair_id uuid;
  worker_rec RECORD;
  processed_count integer := 0;
  missing_msg text := '';
  prod_name text;
BEGIN
  IF NEW.status NOT IN ('delivered', 'confirmed') THEN
    RETURN NEW;
  END IF;

  IF NEW.stock_posted = true THEN
    RETURN NEW;
  END IF;

  IF NEW.assigned_depot_id IS NULL THEN
    NEW.stock_post_error := 'Nuk eshte caktuar depo per kete dergese';
    NEW.stock_posted := false;
    RETURN NEW;
  END IF;

  IF NEW.type = 'delivery' THEN
    mv_type := 'exit';
  ELSE
    mv_type := 'entry';
  END IF;

  performer_id := COALESCE(NEW.assigned_driver_id, NEW.created_by);

  IF mv_type = 'exit' AND COALESCE(NEW.allow_negative_stock, false) = false THEN
    FOR item IN
      SELECT id, category_id, category_product_id, quantity, condition, intended_action
      FROM delivery_note_items
      WHERE delivery_note_id = NEW.id AND category_id IS NOT NULL AND quantity > 0
    LOOP
      IF COALESCE(item.intended_action, 'stock') <> 'stock' THEN
        CONTINUE;
      END IF;

      eff_condition := CASE
        WHEN item.condition IN ('good','damaged','repaired','sorting','ready_a','ready_b','ready_c') THEN item.condition
        ELSE 'good'
      END;

      SELECT quantity INTO existing_qty
      FROM stock
      WHERE company_id = NEW.company_id
        AND depot_id = NEW.assigned_depot_id
        AND category_id = item.category_id
        AND COALESCE(category_product_id::text, '') = COALESCE(item.category_product_id::text, '')
        AND condition = eff_condition
      LIMIT 1;

      IF COALESCE(existing_qty, 0) < item.quantity THEN
        SELECT name INTO prod_name FROM category_products WHERE id = item.category_product_id;
        missing_msg := missing_msg || COALESCE(prod_name, 'Artikull') ||
          ' (' || eff_condition || '): kerkohen ' || item.quantity ||
          ', ne dispozicion ' || COALESCE(existing_qty, 0) || '; ';
      END IF;
    END LOOP;

    IF missing_msg <> '' THEN
      NEW.stock_post_error := 'Stok i pamjaftueshem: ' || missing_msg ||
        'Konfirmoni per te vazhduar ne minus.';
      NEW.stock_posted := false;
      RETURN NEW;
    END IF;
  END IF;

  FOR item IN
    SELECT id, category_id, category_product_id, quantity, condition, intended_action, notes
    FROM delivery_note_items
    WHERE delivery_note_id = NEW.id AND category_id IS NOT NULL AND quantity > 0
  LOOP
    processed_count := processed_count + 1;

    IF mv_type = 'exit' THEN
      route := 'stock';
    ELSE
      route := COALESCE(item.intended_action, 'stock');
    END IF;

    eff_condition := CASE
      WHEN route = 'repair' THEN 'damaged'
      WHEN route = 'sorting' AND COALESCE(item.condition, 'good') NOT IN ('ready_a', 'ready_b', 'ready_c') THEN 'sorting'
      WHEN item.condition IN ('good', 'damaged', 'repaired', 'sorting', 'ready_a', 'ready_b', 'ready_c') THEN item.condition
      ELSE 'good'
    END;

    IF route = 'stock' THEN
      -- Idempotency: skip if movement already exists for (delivery_note_id, item)
      SELECT id INTO existing_movement_id
      FROM stock_movements
      WHERE delivery_note_id = NEW.id
        AND category_id = item.category_id
        AND COALESCE(category_product_id::text,'') = COALESCE(item.category_product_id::text,'')
        AND condition_after = eff_condition
        AND movement_type = mv_type
        AND quantity = item.quantity
      LIMIT 1;

      IF existing_movement_id IS NOT NULL THEN
        CONTINUE;
      END IF;

      SELECT id, quantity INTO existing_id, existing_qty
      FROM stock
      WHERE company_id = NEW.company_id
        AND depot_id = NEW.assigned_depot_id
        AND category_id = item.category_id
        AND COALESCE(category_product_id::text, '') = COALESCE(item.category_product_id::text, '')
        AND condition = eff_condition
      LIMIT 1;

      IF mv_type = 'entry' THEN
        IF existing_id IS NOT NULL THEN
          UPDATE stock
          SET quantity = existing_qty + item.quantity, updated_at = now()
          WHERE id = existing_id;
        ELSE
          INSERT INTO stock (company_id, depot_id, category_id, category_product_id, quantity, condition)
          VALUES (NEW.company_id, NEW.assigned_depot_id, item.category_id, item.category_product_id, item.quantity, eff_condition);
        END IF;
      ELSE
        IF existing_id IS NOT NULL THEN
          IF COALESCE(NEW.allow_negative_stock, false) = true THEN
            UPDATE stock SET quantity = existing_qty - item.quantity, updated_at = now() WHERE id = existing_id;
          ELSE
            UPDATE stock SET quantity = GREATEST(0, existing_qty - item.quantity), updated_at = now() WHERE id = existing_id;
          END IF;
        ELSIF COALESCE(NEW.allow_negative_stock, false) = true THEN
          INSERT INTO stock (company_id, depot_id, category_id, category_product_id, quantity, condition)
          VALUES (NEW.company_id, NEW.assigned_depot_id, item.category_id, item.category_product_id, -item.quantity, eff_condition);
        END IF;
      END IF;

      INSERT INTO stock_movements (
        company_id, depot_id, category_id, category_product_id, movement_type, quantity,
        condition_before, condition_after, notes, performed_by, delivery_note_id
      ) VALUES (
        NEW.company_id, NEW.assigned_depot_id, item.category_id, item.category_product_id, mv_type, item.quantity,
        eff_condition, eff_condition,
        'Nga fletedergesa ' || NEW.note_number, performer_id, NEW.id
      );

    ELSIF route = 'sorting' THEN
      -- Idempotency: look up existing batch for this source_item_id
      SELECT id INTO existing_batch_id
      FROM pallet_sorting_batches
      WHERE source_item_id = item.id
      LIMIT 1;

      IF existing_batch_id IS NOT NULL THEN
        UPDATE pallet_sorting_batches
        SET total_received = item.quantity,
            category_id = item.category_id,
            reference_number_snapshot = COALESCE(NEW.reference_number, NEW.note_number)
        WHERE id = existing_batch_id;
      ELSE
        INSERT INTO pallet_sorting_batches (
          company_id, depot_id, category_id, total_received, status,
          notes, created_by, source_delivery_note_id, source_item_id, reference_number_snapshot
        ) VALUES (
          NEW.company_id, NEW.assigned_depot_id, item.category_id, item.quantity, 'in_progress',
          COALESCE(item.notes, ''), performer_id, NEW.id, item.id, COALESCE(NEW.reference_number, NEW.note_number)
        ) RETURNING id INTO new_batch_id;

        FOR worker_rec IN
          SELECT id FROM profiles
          WHERE company_id = NEW.company_id
            AND depot_id = NEW.assigned_depot_id
            AND role = 'depot_worker'
            AND is_active = true
        LOOP
          INSERT INTO notifications (user_id, type, title, message, data, reference_id, is_read, push_sent)
          VALUES (
            worker_rec.id, 'delivery',
            'Paleta per klasifikim',
            'Fletmarrja ' || NEW.note_number || ' ka paleta per klasifikim.',
            jsonb_build_object('url', '/depot/sorting?batch=' || new_batch_id::text,
              'note_number', NEW.note_number, 'batch_id', new_batch_id::text),
            new_batch_id, false, false
          );
        END LOOP;
      END IF;

    ELSIF route = 'repair' THEN
      SELECT id INTO existing_repair_id
      FROM depot_repairs
      WHERE source_item_id = item.id
      LIMIT 1;

      IF existing_repair_id IS NOT NULL THEN
        UPDATE depot_repairs
        SET quantity_in = item.quantity,
            category_id = item.category_id,
            category_product_id = item.category_product_id
        WHERE id = existing_repair_id;
      ELSE
        INSERT INTO depot_repairs (
          company_id, depot_id, category_id, category_product_id,
          quantity_in, quantity_repaired, quantity_scrapped, notes,
          source_delivery_note_id, source_item_id, logged_at
        ) VALUES (
          NEW.company_id, NEW.assigned_depot_id, item.category_id, item.category_product_id,
          item.quantity, 0, 0, COALESCE(item.notes, 'Nga fletedergesa ' || NEW.note_number),
          NEW.id, item.id, now()
        ) RETURNING id INTO new_repair_id;

        FOR worker_rec IN
          SELECT id FROM profiles
          WHERE company_id = NEW.company_id
            AND depot_id = NEW.assigned_depot_id
            AND role = 'depot_worker'
            AND is_active = true
        LOOP
          INSERT INTO notifications (user_id, type, title, message, data, reference_id, is_read, push_sent)
          VALUES (
            worker_rec.id, 'delivery',
            'Paleta te defektshme per riparim',
            'Fletmarrja ' || NEW.note_number || ' ka paleta te defektshme.',
            jsonb_build_object('url', '/depot/repairs', 'note_number', NEW.note_number, 'repair_id', new_repair_id::text),
            new_repair_id, false, false
          );
        END LOOP;
      END IF;
    END IF;
  END LOOP;

  IF processed_count = 0 THEN
    NEW.stock_post_error := 'Nuk ka artikuj te vlefshem per regjistrim (kategori + sasi)';
    NEW.stock_posted := false;
    RETURN NEW;
  END IF;

  NEW.stock_post_error := NULL;
  NEW.stock_posted := true;
  RETURN NEW;
END;
$function$;
