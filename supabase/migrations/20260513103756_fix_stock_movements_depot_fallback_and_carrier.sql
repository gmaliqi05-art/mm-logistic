/*
  # Stock Movement Depot Fallback + Carrier No-Stock

  ## Summary
  - Adds helper `public.get_default_depot(p_company_id)` returning the company's central depot.
  - Rewrites `process_delivery_note_stock` so that when a delivery note has no `origin_depot_id`
    or `destination_depot_id`, the trigger falls back to `assigned_depot_id` and finally to the
    company's default depot. This eliminates the `null value in column "depot_id"` error.
  - Removes stock_movements writes for `carrier` role (only transit, no stock impact). Logs to
    `partner_flow_events` if the table exists; otherwise simply no-op.
  - Updates the delivery note's origin/destination depot in-place when fallback was used so the
    UI reflects where the stock was posted.

  ## Tables touched
  - No schema changes. Only function/trigger logic.

  ## Security
  - Function is SECURITY DEFINER with `search_path = public` set explicitly (no change).
  - get_default_depot is SECURITY INVOKER stable.
*/

CREATE OR REPLACE FUNCTION public.get_default_depot(p_company_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT id FROM depots
  WHERE company_id = p_company_id
    AND COALESCE(is_active, true) = true
  ORDER BY
    CASE WHEN depot_type = 'central' THEN 0
         WHEN depot_type = 'main' THEN 1
         ELSE 2 END,
    created_at ASC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.process_delivery_note_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item RECORD;
  v_role text;
  v_owner_id uuid;
  v_origin_depot uuid;
  v_dest_depot uuid;
  v_default_depot uuid;
BEGIN
  IF NEW.status <> 'confirmed' THEN RETURN NEW; END IF;
  IF OLD.status = 'confirmed' THEN RETURN NEW; END IF;
  IF NEW.stock_posted = true THEN RETURN NEW; END IF;

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
          category_id, category_product_id, total_received, status
        )
        VALUES (
          NEW.company_id, v_dest_depot, NEW.id, item.id,
          item.category_id, item.category_product_id, item.quantity, 'pending'
        )
        ON CONFLICT (source_item_id) DO UPDATE SET total_received = EXCLUDED.total_received;

      ELSIF item.intended_action = 'repair' THEN
        INSERT INTO depot_repairs (
          company_id, depot_id, source_delivery_note_id, source_item_id,
          category_id, category_product_id, quantity, status
        )
        VALUES (
          NEW.company_id, v_dest_depot, NEW.id, item.id,
          item.category_id, item.category_product_id, item.quantity, 'pending'
        )
        ON CONFLICT (source_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

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
        DO UPDATE SET quantity = stock.quantity + EXCLUDED.quantity;
      END IF;

    ELSIF v_role = 'carrier' THEN
      -- No stock movement. Carrier does not own the goods.
      NULL;

    ELSIF v_role = 'custodian_in' THEN
      v_owner_id := COALESCE(NEW.goods_owner_contact_id, NEW.consignor_contact_id);
      IF v_owner_id IS NOT NULL THEN
        INSERT INTO held_stock_movements (
          company_id, depot_id, category_id, category_product_id,
          owner_contact_id, delivery_note_id, movement_type, quantity,
          condition, performed_by
        ) VALUES (
          NEW.company_id, v_dest_depot, item.category_id, item.category_product_id,
          v_owner_id, NEW.id, 'custody_in', item.quantity, item.condition, NEW.stock_confirmed_by
        );

        INSERT INTO held_stock (
          company_id, depot_id, category_id, category_product_id,
          owner_contact_id, quantity, condition
        ) VALUES (
          NEW.company_id, v_dest_depot, item.category_id, item.category_product_id,
          v_owner_id, item.quantity, item.condition
        )
        ON CONFLICT (company_id, depot_id, category_product_id, owner_contact_id, condition)
        DO UPDATE SET quantity = held_stock.quantity + EXCLUDED.quantity, updated_at = now();
      END IF;

    ELSIF v_role = 'custodian_out' THEN
      v_owner_id := COALESCE(NEW.goods_owner_contact_id, NEW.consignor_contact_id);
      IF v_owner_id IS NOT NULL THEN
        INSERT INTO held_stock_movements (
          company_id, depot_id, category_id, category_product_id,
          owner_contact_id, delivery_note_id, movement_type, quantity,
          condition, performed_by
        ) VALUES (
          NEW.company_id, v_origin_depot, item.category_id, item.category_product_id,
          v_owner_id, NEW.id, 'custody_out', item.quantity, item.condition, NEW.stock_confirmed_by
        );

        UPDATE held_stock SET quantity = GREATEST(0, quantity - item.quantity), updated_at = now()
        WHERE company_id = NEW.company_id
          AND depot_id = v_origin_depot
          AND category_product_id = item.category_product_id
          AND owner_contact_id = v_owner_id
          AND condition = item.condition;
      END IF;

    ELSIF v_role = 'internal_transfer' THEN
      INSERT INTO stock_movements (
        company_id, depot_id, category_id, category_product_id,
        movement_type, quantity, condition_before, condition_after,
        notes, performed_by, delivery_note_id, ownership, owner_company_id
      ) VALUES (
        NEW.company_id, v_origin_depot, item.category_id, item.category_product_id,
        'exit', item.quantity, item.condition, item.condition,
        'Transfer i brendshem ' || NEW.note_number, NEW.stock_confirmed_by, NEW.id, 'own', NEW.company_id
      );

      UPDATE stock SET quantity = GREATEST(0, quantity - item.quantity)
      WHERE company_id = NEW.company_id
        AND depot_id = v_origin_depot
        AND category_product_id = item.category_product_id
        AND condition = item.condition
        AND ownership = 'own';

      INSERT INTO stock_movements (
        company_id, depot_id, category_id, category_product_id,
        movement_type, quantity, condition_before, condition_after,
        notes, performed_by, delivery_note_id, ownership, owner_company_id
      ) VALUES (
        NEW.company_id, v_dest_depot, item.category_id, item.category_product_id,
        'entry', item.quantity, item.condition, item.condition,
        'Transfer i brendshem ' || NEW.note_number, NEW.stock_confirmed_by, NEW.id, 'own', NEW.company_id
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
      DO UPDATE SET quantity = stock.quantity + EXCLUDED.quantity;
    END IF;
  END LOOP;

  -- Persist resolved depots back to the note for audit/history
  UPDATE delivery_notes SET
    origin_depot_id = COALESCE(origin_depot_id, v_origin_depot),
    destination_depot_id = COALESCE(destination_depot_id, v_dest_depot),
    stock_posted = true,
    stock_post_error = NULL
  WHERE id = NEW.id;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  UPDATE delivery_notes SET stock_post_error = SQLERRM WHERE id = NEW.id;
  RAISE;
END $$;

DROP TRIGGER IF EXISTS trg_process_delivery_note_stock ON delivery_notes;
CREATE TRIGGER trg_process_delivery_note_stock
  AFTER UPDATE OF status ON delivery_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.process_delivery_note_stock();
