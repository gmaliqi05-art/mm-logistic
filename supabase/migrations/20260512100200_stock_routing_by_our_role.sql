/*
  # Stock Routing by Our Role (CMR Convention)

  ## Purpose
  Rewrite process_delivery_note_stock so it respects our_role:

  - 'consignor'         -> stock OUT (own stock decreases)
  - 'consignee'         -> stock IN  (own stock increases)
  - 'carrier'           -> NO stock movement (we just transport)
  - 'custodian_in'      -> held_stock IN (we hold for owner, own stock untouched)
  - 'custodian_out'     -> held_stock OUT
  - 'internal_transfer' -> stock OUT from origin_depot + IN to destination_depot

  This replaces the previous logic that used `type` ('delivery'|'pickup') only.

  ## Routing for consignee items
  When we receive goods, items can be routed to:
  - sorting (if item.intended_action = 'sorting')
  - repair (if item.intended_action = 'repair')
  - stock directly (default)
*/

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
BEGIN
  -- Only fire on transition to confirmed
  IF NEW.status <> 'confirmed' THEN RETURN NEW; END IF;
  IF OLD.status = 'confirmed' THEN RETURN NEW; END IF;
  IF NEW.stock_posted = true THEN RETURN NEW; END IF;

  -- Determine our role (fall back to type for legacy data)
  v_role := COALESCE(NEW.our_role,
    CASE NEW.type
      WHEN 'delivery' THEN 'consignor'
      WHEN 'pickup' THEN 'consignee'
      ELSE NULL
    END
  );

  IF v_role IS NULL THEN
    UPDATE delivery_notes SET
      stock_post_error = 'our_role is null and type is unknown'
    WHERE id = NEW.id;
    RETURN NEW;
  END IF;

  -- Iterate items
  FOR item IN
    SELECT id, category_id, category_product_id, quantity, condition, intended_action
    FROM delivery_note_items
    WHERE delivery_note_id = NEW.id
  LOOP

    -- ROUTE 1: We are CONSIGNOR (selling/sending our goods)
    IF v_role = 'consignor' THEN
      INSERT INTO stock_movements (
        company_id, depot_id, category_id, category_product_id,
        movement_type, quantity, condition_before, condition_after,
        notes, performed_by, delivery_note_id, ownership, owner_company_id
      ) VALUES (
        NEW.company_id, NEW.origin_depot_id, item.category_id, item.category_product_id,
        'exit', item.quantity, item.condition, item.condition,
        'Auto: Dorezim ' || NEW.note_number, NEW.confirmed_by, NEW.id, 'own', NEW.company_id
      );

      UPDATE stock SET
        quantity = GREATEST(0, quantity - item.quantity)
      WHERE company_id = NEW.company_id
        AND depot_id = NEW.origin_depot_id
        AND category_product_id = item.category_product_id
        AND condition = item.condition
        AND ownership = 'own';

    -- ROUTE 2: We are CONSIGNEE (buying/receiving for us)
    ELSIF v_role = 'consignee' THEN
      -- Check intended_action for sorting/repair routing
      IF item.intended_action = 'sorting' THEN
        INSERT INTO pallet_sorting_batches (
          company_id, depot_id, source_delivery_note_id, source_item_id,
          category_id, category_product_id, total_received, status
        )
        VALUES (
          NEW.company_id, NEW.destination_depot_id, NEW.id, item.id,
          item.category_id, item.category_product_id, item.quantity, 'pending'
        )
        ON CONFLICT (source_item_id) DO UPDATE SET total_received = EXCLUDED.total_received;

      ELSIF item.intended_action = 'repair' THEN
        INSERT INTO depot_repairs (
          company_id, depot_id, source_delivery_note_id, source_item_id,
          category_id, category_product_id, quantity, status
        )
        VALUES (
          NEW.company_id, NEW.destination_depot_id, NEW.id, item.id,
          item.category_id, item.category_product_id, item.quantity, 'pending'
        )
        ON CONFLICT (source_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

      ELSE
        -- Direct to stock
        INSERT INTO stock_movements (
          company_id, depot_id, category_id, category_product_id,
          movement_type, quantity, condition_before, condition_after,
          notes, performed_by, delivery_note_id, ownership, owner_company_id
        ) VALUES (
          NEW.company_id, NEW.destination_depot_id, item.category_id, item.category_product_id,
          'entry', item.quantity, item.condition, item.condition,
          'Auto: Marrje ' || NEW.note_number, NEW.confirmed_by, NEW.id, 'own', NEW.company_id
        );

        INSERT INTO stock (
          company_id, depot_id, category_id, category_product_id,
          quantity, condition, ownership, owner_company_id
        )
        VALUES (
          NEW.company_id, NEW.destination_depot_id, item.category_id, item.category_product_id,
          item.quantity, item.condition, 'own', NEW.company_id
        )
        ON CONFLICT (company_id, depot_id, category_product_id, condition)
        DO UPDATE SET quantity = stock.quantity + EXCLUDED.quantity;
      END IF;

    -- ROUTE 3: We are CARRIER (just transporting, no stock impact)
    ELSIF v_role = 'carrier' THEN
      -- Log informational movement but do not change stock
      INSERT INTO stock_movements (
        company_id, depot_id, category_id, category_product_id,
        movement_type, quantity, condition_before, condition_after,
        notes, performed_by, delivery_note_id, ownership, owner_company_id
      ) VALUES (
        NEW.company_id, NULL, item.category_id, item.category_product_id,
        'carrier_pass', item.quantity, item.condition, item.condition,
        'Transport per: ' || COALESCE(NEW.consignor_name, ''),
        NEW.confirmed_by, NEW.id, 'transit', NEW.goods_owner_company_id
      );
      -- No stock UPDATE

    -- ROUTE 4: We are CUSTODIAN_IN (receiving goods for partner)
    ELSIF v_role = 'custodian_in' THEN
      v_owner_id := NEW.goods_owner_contact_id;
      IF v_owner_id IS NULL THEN
        v_owner_id := NEW.consignor_contact_id;
      END IF;

      IF v_owner_id IS NOT NULL THEN
        INSERT INTO held_stock_movements (
          company_id, depot_id, category_id, category_product_id,
          owner_contact_id, delivery_note_id, movement_type, quantity,
          condition, performed_by
        ) VALUES (
          NEW.company_id, NEW.destination_depot_id, item.category_id, item.category_product_id,
          v_owner_id, NEW.id, 'custody_in', item.quantity, item.condition, NEW.confirmed_by
        );

        INSERT INTO held_stock (
          company_id, depot_id, category_id, category_product_id,
          owner_contact_id, quantity, condition
        ) VALUES (
          NEW.company_id, NEW.destination_depot_id, item.category_id, item.category_product_id,
          v_owner_id, item.quantity, item.condition
        )
        ON CONFLICT (company_id, depot_id, category_product_id, owner_contact_id, condition)
        DO UPDATE SET
          quantity = held_stock.quantity + EXCLUDED.quantity,
          updated_at = now();
      END IF;

    -- ROUTE 5: We are CUSTODIAN_OUT (releasing partner's goods)
    ELSIF v_role = 'custodian_out' THEN
      v_owner_id := NEW.goods_owner_contact_id;
      IF v_owner_id IS NULL THEN
        v_owner_id := NEW.consignor_contact_id;
      END IF;

      IF v_owner_id IS NOT NULL THEN
        INSERT INTO held_stock_movements (
          company_id, depot_id, category_id, category_product_id,
          owner_contact_id, delivery_note_id, movement_type, quantity,
          condition, performed_by
        ) VALUES (
          NEW.company_id, NEW.origin_depot_id, item.category_id, item.category_product_id,
          v_owner_id, NEW.id, 'custody_out', item.quantity, item.condition, NEW.confirmed_by
        );

        UPDATE held_stock SET
          quantity = GREATEST(0, quantity - item.quantity),
          updated_at = now()
        WHERE company_id = NEW.company_id
          AND depot_id = NEW.origin_depot_id
          AND category_product_id = item.category_product_id
          AND owner_contact_id = v_owner_id
          AND condition = item.condition;
      END IF;

    -- ROUTE 6: Internal transfer (depot A -> depot B, both ours)
    ELSIF v_role = 'internal_transfer' THEN
      -- Exit from origin
      INSERT INTO stock_movements (
        company_id, depot_id, category_id, category_product_id,
        movement_type, quantity, condition_before, condition_after,
        notes, performed_by, delivery_note_id, ownership, owner_company_id
      ) VALUES (
        NEW.company_id, NEW.origin_depot_id, item.category_id, item.category_product_id,
        'exit', item.quantity, item.condition, item.condition,
        'Transfer i brendshem ' || NEW.note_number, NEW.confirmed_by, NEW.id, 'own', NEW.company_id
      );

      UPDATE stock SET quantity = GREATEST(0, quantity - item.quantity)
      WHERE company_id = NEW.company_id
        AND depot_id = NEW.origin_depot_id
        AND category_product_id = item.category_product_id
        AND condition = item.condition
        AND ownership = 'own';

      -- Entry to destination
      INSERT INTO stock_movements (
        company_id, depot_id, category_id, category_product_id,
        movement_type, quantity, condition_before, condition_after,
        notes, performed_by, delivery_note_id, ownership, owner_company_id
      ) VALUES (
        NEW.company_id, NEW.destination_depot_id, item.category_id, item.category_product_id,
        'entry', item.quantity, item.condition, item.condition,
        'Transfer i brendshem ' || NEW.note_number, NEW.confirmed_by, NEW.id, 'own', NEW.company_id
      );

      INSERT INTO stock (
        company_id, depot_id, category_id, category_product_id,
        quantity, condition, ownership, owner_company_id
      )
      VALUES (
        NEW.company_id, NEW.destination_depot_id, item.category_id, item.category_product_id,
        item.quantity, item.condition, 'own', NEW.company_id
      )
      ON CONFLICT (company_id, depot_id, category_product_id, condition)
      DO UPDATE SET quantity = stock.quantity + EXCLUDED.quantity;
    END IF;

  END LOOP;

  -- Mark as posted
  UPDATE delivery_notes SET
    stock_posted = true,
    stock_post_error = NULL
  WHERE id = NEW.id;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  UPDATE delivery_notes SET
    stock_post_error = SQLERRM
  WHERE id = NEW.id;
  RAISE;
END $$;

-- Recreate the trigger (replaces existing)
DROP TRIGGER IF EXISTS trg_process_delivery_note_stock ON delivery_notes;
CREATE TRIGGER trg_process_delivery_note_stock
  AFTER UPDATE OF status ON delivery_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.process_delivery_note_stock();
