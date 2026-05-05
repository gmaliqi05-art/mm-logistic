/*
  # Hardening i regjistrimit ne stok nga delivery_notes

  ## Pershkrimi
  Shton kolonen `stock_post_error` ne `delivery_notes` dhe rishkruan funksionin
  `process_delivery_note_stock` qe te raportoje gabimet ne vend qe te deshtoj
  ne heshtje. Kjo parandalon situatat ku nje dergese kalon ne `confirmed`
  pa regjistruar asgje ne stok (psh. pa `assigned_depot_id` ose pa items).

  ## Ndryshime
  1. Kolone e re `stock_post_error text` ne `delivery_notes` — ruan arsyen
     e deshtimit te regjistrimit ne stok (nese ka).
  2. Rishkrim i `process_delivery_note_stock`:
     - Nese `assigned_depot_id IS NULL` → `stock_post_error = 'Nuk eshte caktuar depo'`,
       `stock_posted = false`. NUK ndalon ndryshimin e statusit (frontend e kap gabimin).
     - Nese nuk gjendet asnje item i vlefshem → `stock_post_error = 'Nuk ka artikuj te vlefshem'`.
     - Nese te gjitha rrjedhat perfundojne me sukses → `stock_post_error = NULL`,
       `stock_posted = true`.
  3. Pastron error-in e meparshem kur rregullohen items dhe status ri-vendoset.

  ## Siguria
  - SECURITY DEFINER, search_path = 'public'
  - Pa ndryshim politikash RLS
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'delivery_notes'
      AND column_name = 'stock_post_error'
  ) THEN
    ALTER TABLE public.delivery_notes ADD COLUMN stock_post_error text;
  END IF;
END $$;

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
  processed_count integer := 0;
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

  IF processed_count = 0 THEN
    NEW.stock_post_error := 'Nuk ka artikuj te vlefshem per regjistrim (kategori + sasi)';
    NEW.stock_posted := false;
    RETURN NEW;
  END IF;

  NEW.stock_post_error := NULL;
  NEW.stock_posted := true;
  RETURN NEW;
END;
$$;
