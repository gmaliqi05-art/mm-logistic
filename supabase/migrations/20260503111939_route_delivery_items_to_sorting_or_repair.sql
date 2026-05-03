/*
  # Router i ri per fletedergesat: Stok / Sortim / Riparim

  ## Permbledhje
  Ky migration zevendeson trigger-in ekzistues `process_delivery_note_stock`
  me logjike ridrejtimi (routing): cdo rresht i fletes drejtohet ne nje nga tri
  destinacionet sipas `intended_action`:
    1. `stock`   -> sjellja ekzistuese (hyn ne `stock` + `stock_movements`)
    2. `sorting` -> krijohet batch ne `pallet_sorting_batches`
    3. `repair`  -> krijohet rresh ne `depot_repairs`

  Vetem fletedergesat me `type='pickup'` (fletmarrje hyrese) kane sortim dhe
  riparim. Fletedergesat `delivery` (dalje) perdorin ende daljen nga stoku.

  ## Njoftimet
  - `sorting`: krijohet njoftim per cdo `depot_worker` te depos perkatese
    per secilin batch te ri.
  - `repair`:  krijohet njoftim per cdo `depot_worker` te depos perkatese.

  ## Siguria
  - SECURITY DEFINER me search_path 'public'
  - Nuk prek stokun per rreshtat qe shkojne ne sortim/riparim
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
    route := COALESCE(item.intended_action, 'stock');

    IF mv_type = 'exit' OR route = 'stock' THEN
      -- ROUTE: STOK (sjellja aktuale)
      SELECT id, quantity INTO existing_id, existing_qty
      FROM stock
      WHERE company_id = NEW.company_id
        AND depot_id = NEW.assigned_depot_id
        AND category_id = item.category_id
        AND condition = COALESCE(item.condition, 'good')
        AND (
          (item.category_product_id IS NULL AND category_product_id IS NULL)
          OR category_product_id = item.category_product_id
        )
      LIMIT 1;

      IF mv_type = 'entry' THEN
        IF existing_id IS NOT NULL THEN
          UPDATE stock
            SET quantity = existing_qty + item.quantity, updated_at = now()
            WHERE id = existing_id;
        ELSE
          INSERT INTO stock (company_id, depot_id, category_id, category_product_id, quantity, condition)
          VALUES (NEW.company_id, NEW.assigned_depot_id, item.category_id, item.category_product_id, item.quantity,
                  COALESCE(item.condition, 'good'));
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
        COALESCE(item.condition, 'good'), COALESCE(item.condition, 'good'),
        'Nga fletedergesa ' || NEW.note_number, performer_id
      );

    ELSIF route = 'sorting' THEN
      -- ROUTE: SORTIM (klasifikim)
      INSERT INTO pallet_sorting_batches (
        company_id, depot_id, category_id, total_received, status,
        notes, created_by, source_delivery_note_id, source_item_id, reference_number_snapshot
      ) VALUES (
        NEW.company_id, NEW.assigned_depot_id, item.category_id, item.quantity, 'in_progress',
        COALESCE(item.notes, ''), performer_id, NEW.id, item.id, COALESCE(NEW.reference_number, NEW.note_number)
      ) RETURNING id INTO new_batch_id;

      -- Njoftim per depo_worker-et e depos
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
      -- ROUTE: RIPARIM
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
