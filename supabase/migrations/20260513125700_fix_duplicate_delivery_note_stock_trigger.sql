/*
  # Fix duplicate process_delivery_note_stock trigger

  The function `process_delivery_note_stock()` was registered twice on
  `delivery_notes`:

    - `trg_delivery_note_stock` BEFORE UPDATE OF status
    - `trg_process_delivery_note_stock` AFTER UPDATE OF status

  The function performs an internal `UPDATE delivery_notes` to persist
  resolved depot ids and `stock_posted = true`. When invoked in the BEFORE
  phase this internal update collides with the still-in-flight outer UPDATE
  and Postgres aborts with "tuple to be updated was already modified by an
  operation triggered by the current command".

  Fix: drop the duplicate BEFORE trigger so the function runs exactly once,
  AFTER the row update, where the internal UPDATE is safe.

  Also harden the function with an early no-op guard if `stock_posted` is
  already true (defensive — the AFTER trigger predicate already covers
  re-entry, but this protects against any future trigger registration).
*/

DROP TRIGGER IF EXISTS trg_delivery_note_stock ON public.delivery_notes;

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
END $function$;
