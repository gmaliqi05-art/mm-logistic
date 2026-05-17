/*
  # Fix process_delivery_note_stock to pass created_by to sorting batches

  1. Problem
    - When routing items to sorting, the trigger doesn't supply `created_by`
    - While we've made it nullable, best practice is to populate when possible

  2. Solution
    - Update the INSERT to include `created_by` from NEW.stock_confirmed_by
      (the person who confirmed the delivery note)
*/

CREATE OR REPLACE FUNCTION public.process_delivery_note_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  item RECORD;
  v_role text;
  v_owner_id uuid;
  v_origin_depot uuid;
  v_dest_depot uuid;
  v_default_depot uuid;
  v_held_stock_exists boolean;
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
        INSERT INTO depot_repairs (
          company_id, depot_id, source_delivery_note_id, source_item_id,
          category_id, category_product_id, quantity_in
        )
        VALUES (
          NEW.company_id, v_dest_depot, NEW.id, item.id,
          item.category_id, item.category_product_id, item.quantity
        )
        ON CONFLICT (source_item_id) WHERE source_item_id IS NOT NULL
        DO UPDATE SET quantity_in = EXCLUDED.quantity_in;

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
$function$;
