/*
  # Attribute stock movements to the depot registrant, and surface the driver

  In the company movements report ("Levizjet e kompanise") the PUNETORI (worker)
  column showed the **driver** (e.g. Genton) instead of the **depot worker who
  registered the stock** (e.g. Idi). Root cause: `process_delivery_note_stock`
  stamped each movement's `performed_by` with
  `COALESCE(assigned_driver_id, created_by)` — the driver first. The person who
  actually books the stock in the depot is whoever confirmed the note to stock
  (`stock_confirmed_by`), set by the depot worker in the review panel.

  Fix, three parts:

  1. Trigger: `performed_by := COALESCE(stock_confirmed_by, created_by)` — the
     registrant. Manual movements (no note / no confirmer) keep `created_by`,
     which is already correct. Function body otherwise verbatim.

  2. View `v_company_movements`: add `driver_id` + `driver_full_name`, resolved
     from the linked delivery note's `assigned_driver_id`, so the report can
     show a separate "Shoferi" (driver) column — which driver delivered / picked
     up the goods. Added for all three branches (movement / sorting / repair)
     via the source delivery note.

  3. Backfill: re-point historical `performed_by` on delivery-note-linked
     movements to that note's `stock_confirmed_by` where present. This is a
     metadata correction only — it never touches stock quantities.

  Applied to prod via MCP; recorded here.
*/

-- 1. Trigger: performer = the depot registrant, not the driver ---------------
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

  IF NEW.our_role = 'carrier' THEN
    NEW.stock_post_error := NULL;
    NEW.stock_posted := true;
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

  -- The mover of record is whoever registered the stock in the depot, not the
  -- driver who transported it. Falls back to the note creator for manual rows.
  performer_id := COALESCE(NEW.stock_confirmed_by, NEW.created_by);

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
        IF existing_id IS NOT NULL THEN
          UPDATE stock SET quantity = GREATEST(0, existing_qty - item.quantity), updated_at = now() WHERE id = existing_id;
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

-- 2. View: expose the driver alongside the registrant ------------------------
CREATE OR REPLACE VIEW public.v_company_movements AS
 SELECT sm.id::text AS source_id,
    'stock_movement'::text AS source_type,
    sm.movement_type,
    sm.company_id,
    sm.depot_id,
    sm.category_id,
    sm.category_product_id,
    sm.condition_after AS condition,
    CASE WHEN sm.movement_type = 'exit'::text THEN - COALESCE(sm.quantity, 0)
         ELSE COALESCE(sm.quantity, 0) END AS quantity_delta,
    dn.flow_role,
    sm.delivery_note_id,
    sm.created_at AS movement_date,
    sm.performed_by,
    pp.full_name AS performed_by_full_name,
    sm.source_partner,
    sm.source_contact_id,
    ac.name AS source_contact_name,
    dn.assigned_driver_id AS driver_id,
    drv.full_name AS driver_full_name
   FROM stock_movements sm
     LEFT JOIN delivery_notes dn ON dn.id = sm.delivery_note_id
     LEFT JOIN profiles_private pp ON pp.id = sm.performed_by
     LEFT JOIN acc_contacts ac ON ac.id = sm.source_contact_id
     LEFT JOIN profiles_private drv ON drv.id = dn.assigned_driver_id
UNION ALL
 SELECT psi.id::text AS source_id,
    'sorting'::text AS source_type,
    'entry'::text AS movement_type,
    psb.company_id,
    psb.depot_id,
    psb.category_id,
    psi.category_product_id,
    psi.condition,
    COALESCE(psi.quantity, 0) AS quantity_delta,
    NULL::text AS flow_role,
    psb.source_delivery_note_id AS delivery_note_id,
    COALESCE(psb.committed_at, psb.completed_at, psb.created_at) AS movement_date,
    COALESCE(psb.completed_by, psb.created_by) AS performed_by,
    COALESCE(pc1.full_name, pc2.full_name) AS performed_by_full_name,
    NULL::text AS source_partner,
    NULL::uuid AS source_contact_id,
    NULL::text AS source_contact_name,
    sdn.assigned_driver_id AS driver_id,
    sdrv.full_name AS driver_full_name
   FROM pallet_sorting_items psi
     JOIN pallet_sorting_batches psb ON psb.id = psi.batch_id
     LEFT JOIN profiles_private pc1 ON pc1.id = psb.completed_by
     LEFT JOIN profiles_private pc2 ON pc2.id = psb.created_by
     LEFT JOIN delivery_notes sdn ON sdn.id = psb.source_delivery_note_id
     LEFT JOIN profiles_private sdrv ON sdrv.id = sdn.assigned_driver_id
  WHERE psb.status = 'completed'::text
UNION ALL
 SELECT dr.id::text AS source_id,
    'repair'::text AS source_type,
    'repair'::text AS movement_type,
    dr.company_id,
    dr.depot_id,
    dr.category_id,
    dr.category_product_id,
    'repaired'::text AS condition,
    COALESCE(dr.quantity_repaired, 0) AS quantity_delta,
    NULL::text AS flow_role,
    dr.source_delivery_note_id AS delivery_note_id,
    COALESCE(dr.logged_at, dr.created_at) AS movement_date,
    dr.worker_id AS performed_by,
    pw.full_name AS performed_by_full_name,
    NULL::text AS source_partner,
    NULL::uuid AS source_contact_id,
    NULL::text AS source_contact_name,
    rdn.assigned_driver_id AS driver_id,
    rdrv.full_name AS driver_full_name
   FROM depot_repairs dr
     LEFT JOIN profiles_private pw ON pw.id = dr.worker_id
     LEFT JOIN delivery_notes rdn ON rdn.id = dr.source_delivery_note_id
     LEFT JOIN profiles_private rdrv ON rdrv.id = rdn.assigned_driver_id;

-- 3. Backfill historical performer to the registrant (metadata only) ---------
UPDATE stock_movements sm
SET performed_by = dn.stock_confirmed_by
FROM delivery_notes dn
WHERE dn.id = sm.delivery_note_id
  AND dn.stock_confirmed_by IS NOT NULL
  AND sm.performed_by IS DISTINCT FROM dn.stock_confirmed_by;
