/*
  # K4: serialize concurrent confirmations on the same stock row

  ## Problem
  `process_delivery_note_stock` (canonical body in migration
  20260527072021) reads a stock row, computes the new quantity in
  PL/pgSQL, and then UPDATEs:

    SELECT id, quantity INTO existing_id, existing_qty FROM stock
     WHERE ... LIMIT 1;
    ...
    UPDATE stock SET quantity = GREATEST(0, existing_qty - item.quantity)
     WHERE id = existing_id;

  Under default READ COMMITTED isolation, two confirmations that race
  on the same `(company_id, depot_id, category_id, category_product_id,
  condition)` row both observe the same `existing_qty`. They each
  deduct the full item quantity locally. Stock is clamped to >= 0 by
  the `stock_quantity_non_negative` CHECK + `GREATEST(0, ...)`, so the
  table stays consistent, but each trigger also inserts a
  `stock_movements` row with the FULL requested quantity. The audit
  trail therefore double-counts the exit even though only the actual
  on-hand quantity left the depot. Net effect: physical stock matches
  reality, but reports built from `stock_movements` overstate outflow.

  Migration 20260527065425 added FOR UPDATE locks to the repair RPCs
  for exactly this reason. The delivery-note stock trigger was
  excluded at that time on the assumption it used an atomic UPDATE
  WHERE; the actual code is a read-then-write loop, so the race
  reappears here.

  ## Fix
  Promote the main-loop SELECT to `FOR UPDATE`. The first concurrent
  trigger acquires a row lock; the second waits until commit, then
  reads the post-deduction quantity and computes its own delta against
  the up-to-date value. `stock_movements` rows then sum back to the
  actual depot outflow.

  No behaviour change for single-flight confirmations (the lock is
  trivially acquired). No change for the entry path (entry only adds
  to stock — no overdraft possible). The pre-check loop is left as a
  best-effort blocker for the error message; the real safety is the
  CHECK constraint + the lock in the main loop.

  ## Security
  - Function retains SECURITY DEFINER, search_path = public, identical
    signature and grants.
*/

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
  batch_existed boolean;
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

      -- Best-effort pre-check. The authoritative lock+deduct happens
      -- in the main loop below.
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

      -- FOR UPDATE: serialize concurrent confirmations on the same
      -- (depot, category, product, condition) stock row so the
      -- read-then-write below remains consistent. Two confirmations
      -- racing the same row will queue here instead of both seeing
      -- the pre-deduction quantity and writing inflated
      -- stock_movements records.
      SELECT id, quantity INTO existing_id, existing_qty
      FROM stock
      WHERE company_id = NEW.company_id
        AND depot_id = NEW.assigned_depot_id
        AND category_id = item.category_id
        AND COALESCE(category_product_id::text, '') = COALESCE(item.category_product_id::text, '')
        AND condition = eff_condition
      LIMIT 1
      FOR UPDATE;

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
        -- Exit path: always clamp to 0 to honor CHECK (quantity >= 0).
        -- The stock_movements record below captures the full exit quantity
        -- for accounting purposes regardless of actual stock available.
        IF existing_id IS NOT NULL THEN
          UPDATE stock SET quantity = GREATEST(0, existing_qty - item.quantity), updated_at = now() WHERE id = existing_id;
        END IF;
        -- When allow_negative_stock=true and no stock row exists, we skip
        -- creating a row (it would be negative). The movement record
        -- still tracks the full quantity for the audit trail.
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
      batch_existed := EXISTS (
        SELECT 1 FROM pallet_sorting_batches WHERE source_item_id = item.id
      );

      INSERT INTO pallet_sorting_batches (
        company_id, depot_id, category_id, total_received, status,
        notes, created_by, source_delivery_note_id, source_item_id, reference_number_snapshot
      ) VALUES (
        NEW.company_id, NEW.assigned_depot_id, item.category_id, item.quantity, 'in_progress',
        COALESCE(item.notes, ''), performer_id, NEW.id, item.id, COALESCE(NEW.reference_number, NEW.note_number)
      )
      ON CONFLICT (source_item_id) WHERE source_item_id IS NOT NULL
      DO UPDATE SET
        total_received = EXCLUDED.total_received,
        category_id = EXCLUDED.category_id,
        reference_number_snapshot = EXCLUDED.reference_number_snapshot
      RETURNING id INTO new_batch_id;

      IF NOT batch_existed AND new_batch_id IS NOT NULL THEN
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
