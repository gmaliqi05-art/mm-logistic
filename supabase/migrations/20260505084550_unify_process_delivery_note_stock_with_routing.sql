/*
  # Unifikim i triggerit process_delivery_note_stock: routing + expanded conditions

  ## Permbledhje
  Rikthen routing-un "stock / sorting / repair" qe humbi pas migracionit 20260503135134,
  duke kombinuar logjiken e plote te kondicioneve dhe upsert-in me category_product_id.

  ## Ndryshime
  1. CRUD rewrite: `process_delivery_note_stock` tani kombinon:
     - mv_type = 'exit' per type='delivery', 'entry' per type='pickup'
     - routing sipas intended_action: 'stock' / 'sorting' / 'repair'
     - Delivery (exit) TE FORCUAR te shkoj GJITHMONE ne stock; intended_action=sorting/repair
       aplikohet VETEM nese type='pickup'
     - eff_condition i zgjeruar: good/damaged/repaired/sorting/ready_a/ready_b/ready_c
     - upsert me category_product_id (plus category_id + condition) si kombinim unik

  2. Ruan triggeri ekzistues (BEFORE UPDATE OF status ON delivery_notes).

  ## Siguria
  - SECURITY DEFINER, search_path='public'
*/

CREATE OR REPLACE FUNCTION public.process_delivery_note_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  item RECORD;
  existing_qty integer;
  existing_id uuid;
  mv_type text;
  performer_id uuid;
  route text;
  eff_condition text;
  new_batch_id uuid;
  new_repair_id uuid;
  worker_rec RECORD;
BEGIN
  IF NEW.status NOT IN ('delivered', 'confirmed') THEN
    RETURN NEW;
  END IF;

  IF NEW.stock_posted = true THEN
    RETURN NEW;
  END IF;

  IF NEW.assigned_depot_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.type = 'delivery' THEN
    mv_type := 'exit';
  ELSE
    mv_type := 'entry';
  END IF;

  performer_id := COALESCE(NEW.assigned_driver_id, NEW.created_by);

  FOR item IN
    SELECT id, category_id, category_product_id, quantity, condition, intended_action, notes
    FROM delivery_note_items
    WHERE delivery_note_id = NEW.id AND category_id IS NOT NULL AND quantity > 0
  LOOP
    -- DELIVERY (exit) ALWAYS forced to route=stock regardless of intended_action
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
          UPDATE stock
            SET quantity = GREATEST(0, existing_qty - item.quantity), updated_at = now()
            WHERE id = existing_id;
        END IF;
      END IF;

      INSERT INTO stock_movements (
        company_id, depot_id, category_id, category_product_id, movement_type, quantity,
        condition_before, condition_after, notes, performed_by
      ) VALUES (
        NEW.company_id, NEW.assigned_depot_id, item.category_id, item.category_product_id, mv_type, item.quantity,
        eff_condition, eff_condition,
        'Nga fletedergesa ' || NEW.note_number, performer_id
      );

    ELSIF route = 'sorting' THEN
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
          worker_rec.id,
          'delivery',
          'Paleta per klasifikim',
          'Fletmarrja ' || NEW.note_number || ' ka paleta per klasifikim.',
          jsonb_build_object('url', '/depot/sorting?batch=' || new_batch_id::text,
                             'note_number', NEW.note_number,
                             'batch_id', new_batch_id::text),
          new_batch_id,
          false,
          false
        );
      END LOOP;

    ELSIF route = 'repair' THEN
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
          worker_rec.id,
          'delivery',
          'Paleta te defektshme per riparim',
          'Fletmarrja ' || NEW.note_number || ' ka paleta te defektshme.',
          jsonb_build_object('url', '/depot/repairs',
                             'note_number', NEW.note_number,
                             'repair_id', new_repair_id::text),
          new_repair_id,
          false,
          false
        );
      END LOOP;
    END IF;
  END LOOP;

  NEW.stock_posted := true;
  RETURN NEW;
END;
$$;
