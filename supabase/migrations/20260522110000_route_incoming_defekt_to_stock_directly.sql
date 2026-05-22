/*
  # Phase 2C.C: route incoming defekt directly to stock with NULL product

  After 20260522100000 (NULL product_id on pallet_sorting_items) and
  20260522100100 (data migration), the storage model is:
    - damaged pallets live in `stock` with category_product_id = NULL
    - sorting-pending lives implicitly in `pallet_sorting_batches`
    - repaired pallets live in `stock` with their specific product

  This migration aligns the incoming flow:

  1. `process_delivery_note_stock` trigger: when a consignee receipt
     item has intended_action='repair', insert it into stock at
     (company, depot, category, NULL, damaged) and add a stock_movements
     entry. No new depot_repairs row is created — the work item now
     lives in stock itself, and the audit trail is the stock_movements
     row with delivery_note_id.

  2. `v_depot_stock_value` view: drop the depot_repairs UNION. The
     pending depot_repairs rows were backfilled into stock by
     20260521200844, so unioning them again was double-counting.

  3. Clean up stale "pending" depot_repairs (worker_id IS NULL with
     remaining qty > 0): mark them as accounted by setting
     quantity_scrapped = remaining so the per-worker stats and the
     dashboard's "pending repair cases" tile reflect reality. A note
     "migrated to stock" is appended.
*/

-- 1) Drop the depot_repairs UNION from the stock-value view. stock is
--    now the single source of truth for damaged inventory.
CREATE OR REPLACE VIEW public.v_depot_stock_value AS
SELECT
  s.company_id,
  s.depot_id,
  d.name                                       AS depot_name,
  s.category_id,
  pc.name                                      AS category_name,
  s.category_product_id,
  cp.name                                      AS product_name,
  COALESCE(cp.base_price, 0)::numeric(12,2)    AS unit_price,
  COALESCE(cp.currency, 'EUR')                 AS currency,
  s.condition,
  SUM(s.quantity)::int                         AS quantity,
  (SUM(s.quantity) * COALESCE(cp.base_price, 0))::numeric(14,2) AS line_value
FROM public.stock s
LEFT JOIN public.depots d ON d.id = s.depot_id
LEFT JOIN public.product_categories pc ON pc.id = s.category_id
LEFT JOIN public.category_products cp ON cp.id = s.category_product_id
GROUP BY s.company_id, s.depot_id, d.name, s.category_id, pc.name,
         s.category_product_id, cp.name, cp.base_price, cp.currency, s.condition;

-- 2) Reset existing stale pending depot_repairs. These were already
--    backfilled into stock by 20260521200844 (which appended
--    "[migrated to stock]" to notes) but never cleared the pending
--    counters, so the dashboard's "pending repair cases" tile and any
--    "pending depot_repairs" filter was double-counting against stock.
UPDATE public.depot_repairs
SET quantity_scrapped = quantity_in - COALESCE(quantity_repaired, 0)
WHERE worker_id IS NULL
  AND (quantity_in - COALESCE(quantity_repaired, 0) - COALESCE(quantity_scrapped, 0)) > 0
  AND COALESCE(notes, '') LIKE '%[migrated to stock]%';

-- 3) Replace process_delivery_note_stock so incoming repair items go
--    straight to stock (NULL product) instead of opening a depot_repairs
--    case. Everything else is preserved verbatim from the current
--    function definition (sorting branch, consignor exits, transfers,
--    custody).
CREATE OR REPLACE FUNCTION public.process_delivery_note_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  item RECORD;
  v_role text;
  v_origin_depot uuid;
  v_dest_depot uuid;
  v_default_depot uuid;
  v_held_stock_exists boolean;
  v_existing_id uuid;
BEGIN
  IF NEW.status <> 'confirmed' THEN RETURN NEW; END IF;
  IF OLD.status = 'confirmed' THEN RETURN NEW; END IF;
  IF COALESCE(NEW.stock_posted, false) = true THEN RETURN NEW; END IF;

  v_role := COALESCE(NEW.our_role,
    CASE NEW.type
      WHEN 'delivery' THEN 'consignor'
      WHEN 'pickup' THEN 'consignee'
      ELSE NULL
    END
  );

  IF v_role IS NULL THEN
    UPDATE delivery_notes SET stock_post_error = 'our_role is null and type is unknown' WHERE id = NEW.id;
    RETURN NEW;
  END IF;

  v_default_depot := public.get_default_depot(NEW.company_id);
  v_origin_depot := COALESCE(NEW.origin_depot_id, NEW.assigned_depot_id, v_default_depot);
  v_dest_depot   := COALESCE(NEW.destination_depot_id, NEW.assigned_depot_id, v_default_depot);

  IF v_role IN ('consignor','internal_transfer','custodian_out') AND v_origin_depot IS NULL THEN
    UPDATE delivery_notes SET stock_post_error = 'Asnje depo origjine e caktuar dhe nuk ka depo qendrore te kompanise' WHERE id = NEW.id;
    RETURN NEW;
  END IF;
  IF v_role IN ('consignee','internal_transfer','custodian_in') AND v_dest_depot IS NULL THEN
    UPDATE delivery_notes SET stock_post_error = 'Asnje depo destinacioni e caktuar dhe nuk ka depo qendrore te kompanise' WHERE id = NEW.id;
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'held_stock'
  ) INTO v_held_stock_exists;

  FOR item IN
    SELECT id, category_id, category_product_id, quantity, condition, intended_action
    FROM delivery_note_items
    WHERE delivery_note_id = NEW.id
  LOOP
    IF v_role = 'consignor' THEN
      INSERT INTO stock_movements (
        company_id, depot_id, category_id, category_product_id,
        movement_type, quantity, condition_before, condition_after,
        notes, performed_by, delivery_note_id, ownership, owner_company_id
      ) VALUES (
        NEW.company_id, v_origin_depot, item.category_id, item.category_product_id,
        'exit', item.quantity, item.condition, item.condition,
        'Auto: Dorezim ' || NEW.note_number, NEW.stock_confirmed_by, NEW.id, 'own', NEW.company_id
      );

      UPDATE stock SET quantity = GREATEST(0, quantity - item.quantity)
      WHERE company_id = NEW.company_id
        AND depot_id = v_origin_depot
        AND category_product_id = item.category_product_id
        AND condition = item.condition
        AND ownership = 'own';

    ELSIF v_role = 'consignee' THEN
      IF item.intended_action = 'sorting' THEN
        INSERT INTO pallet_sorting_batches (
          company_id, depot_id, source_delivery_note_id, source_item_id,
          category_id, total_received, status, created_by, reference_number_snapshot
        )
        VALUES (
          NEW.company_id, v_dest_depot, NEW.id, item.id,
          item.category_id, item.quantity, 'pending',
          COALESCE(NEW.stock_confirmed_by, NEW.assigned_driver_id, NEW.created_by),
          COALESCE(NEW.reference_number, NEW.note_number)
        )
        ON CONFLICT (source_item_id) WHERE source_item_id IS NOT NULL
        DO UPDATE SET total_received = EXCLUDED.total_received,
                      reference_number_snapshot = EXCLUDED.reference_number_snapshot;

      ELSIF item.intended_action = 'repair' THEN
        -- New model: defekt incoming lands in stock at the category
        -- level (NULL product_id). The damaged pile is the work queue
        -- for the reparature workers — no separate depot_repairs case.
        SELECT id INTO v_existing_id
        FROM stock
        WHERE company_id = NEW.company_id
          AND depot_id = v_dest_depot
          AND category_id = item.category_id
          AND category_product_id IS NULL
          AND condition = 'damaged'
          AND ownership = 'own'
        LIMIT 1;

        IF v_existing_id IS NOT NULL THEN
          UPDATE stock
          SET quantity = quantity + item.quantity,
              updated_at = now()
          WHERE id = v_existing_id;
        ELSE
          INSERT INTO stock (
            company_id, depot_id, category_id, category_product_id,
            quantity, condition, ownership, owner_company_id
          ) VALUES (
            NEW.company_id, v_dest_depot, item.category_id, NULL,
            item.quantity, 'damaged', 'own', NEW.company_id
          );
        END IF;

        INSERT INTO stock_movements (
          company_id, depot_id, category_id, category_product_id,
          movement_type, quantity, condition_before, condition_after,
          notes, performed_by, delivery_note_id, ownership, owner_company_id
        ) VALUES (
          NEW.company_id, v_dest_depot, item.category_id, NULL,
          'repair_in', item.quantity, COALESCE(item.condition, 'damaged'), 'damaged',
          'Auto: Marrje per riparim ' || NEW.note_number,
          NEW.stock_confirmed_by, NEW.id, 'own', NEW.company_id
        );

      ELSE
        INSERT INTO stock_movements (
          company_id, depot_id, category_id, category_product_id,
          movement_type, quantity, condition_before, condition_after,
          notes, performed_by, delivery_note_id, ownership, owner_company_id
        ) VALUES (
          NEW.company_id, v_dest_depot, item.category_id, item.category_product_id,
          'entry', item.quantity, item.condition, item.condition,
          'Auto: Marrje ' || NEW.note_number, NEW.stock_confirmed_by, NEW.id, 'own', NEW.company_id
        );

        INSERT INTO stock (
          company_id, depot_id, category_id, category_product_id,
          quantity, condition, ownership, owner_company_id
        )
        VALUES (
          NEW.company_id, v_dest_depot, item.category_id, item.category_product_id,
          item.quantity, item.condition, 'own', NEW.company_id
        )
        ON CONFLICT (company_id, depot_id, category_product_id, condition)
        WHERE category_product_id IS NOT NULL
        DO UPDATE SET quantity = stock.quantity + EXCLUDED.quantity;
      END IF;

    ELSIF v_role = 'carrier' THEN
      NULL;

    ELSIF v_role = 'internal_transfer' THEN
      UPDATE stock SET quantity = GREATEST(0, quantity - item.quantity)
      WHERE company_id = NEW.company_id
        AND depot_id = v_origin_depot
        AND category_product_id = item.category_product_id
        AND condition = item.condition
        AND ownership = 'own';

      INSERT INTO stock (
        company_id, depot_id, category_id, category_product_id,
        quantity, condition, ownership, owner_company_id
      )
      VALUES (
        NEW.company_id, v_dest_depot, item.category_id, item.category_product_id,
        item.quantity, item.condition, 'own', NEW.company_id
      )
      ON CONFLICT (company_id, depot_id, category_product_id, condition)
      WHERE category_product_id IS NOT NULL
      DO UPDATE SET quantity = stock.quantity + EXCLUDED.quantity;

    ELSIF v_role = 'custodian_in' THEN
      IF v_held_stock_exists THEN
        BEGIN
          EXECUTE format(
            'INSERT INTO held_stock (company_id, depot_id, category_id, category_product_id, quantity, condition, owner_company_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (company_id, depot_id, category_product_id, condition, owner_company_id)
             WHERE category_product_id IS NOT NULL
             DO UPDATE SET quantity = held_stock.quantity + EXCLUDED.quantity'
          ) USING NEW.company_id, v_dest_depot, item.category_id, item.category_product_id,
                  item.quantity, item.condition, NEW.goods_owner_id;
        EXCEPTION WHEN undefined_table THEN
          RAISE NOTICE 'held_stock table not found, skipping custody entry';
        END;
      END IF;

    ELSIF v_role = 'custodian_out' THEN
      IF v_held_stock_exists THEN
        BEGIN
          EXECUTE format(
            'UPDATE held_stock SET quantity = GREATEST(0, quantity - $1)
             WHERE company_id = $2 AND depot_id = $3 AND category_product_id = $4
             AND condition = $5 AND owner_company_id = $6'
          ) USING item.quantity, NEW.company_id, v_origin_depot, item.category_product_id,
                  item.condition, NEW.goods_owner_id;
        EXCEPTION WHEN undefined_table THEN
          RAISE NOTICE 'held_stock table not found, skipping custody exit';
        END;
      END IF;
    END IF;
  END LOOP;

  UPDATE delivery_notes SET stock_posted = true, stock_post_error = NULL WHERE id = NEW.id;
  RETURN NEW;
END;
$$;
