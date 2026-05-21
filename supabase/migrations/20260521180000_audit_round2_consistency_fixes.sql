/*
  # Post-audit consistency fixes (round 2)

  Audit surfaced four DB-side bugs and a missing backfill. This
  migration addresses them all in one shot.

  1. Backfill journal entries for any non-draft, non-cancelled
     invoice that lacks an `acc_journal_entries` row referencing it.
     PR #17 added the trigger but never replayed for rows whose state
     was already `sent` / `paid` / `partial` / `overdue` before the
     trigger existed. Result on prod: only 2 of the 7 finance-relevant
     invoices had a JE. Same backfill for purchases.

  2. `apply_repair_completion` used `v_damaged_row.category_product_id`
     when writing the "Reparim i raportuar" decrement to
     `stock_movements`. That value is the product of whichever
     damaged-stock row happens to sort first by `updated_at` — not the
     repair case's actual product. Use `v_repair.category_product_id`
     instead so the audit trail attributes the decrement correctly.

  3. `v_company_movements` repair branch sets
     `performed_by = COALESCE(dr.worker_id, dr.opened_by)`, which falls
     back to the sorter when no reparature has been credited yet.
     Movements tab then displays the sorter as "Punetori" of a repair
     that hasn't actually happened. Use `dr.worker_id` only — leave the
     "Punetori" column blank until a reparature is credited.

  4. The two stock_movements triggers (`stock_movement_notify_admin`,
     `stock_movement_emit_partner_flow_event`) wrap their bodies in
     `EXCEPTION WHEN OTHERS THEN ... RETURN NEW`, swallowing every
     failure mode silently. Rewrite to surface the failure via
     `RAISE WARNING` (visible in logs) instead of `RAISE NOTICE`,
     and let the trigger NOT roll back the parent insert (the original
     intent) — but at least make the error loud in observability.
*/

-- 1. Backfill missing invoice + purchase journal entries ---------------------

DO $$
DECLARE v_id uuid;
BEGIN
  FOR v_id IN
    SELECT i.id FROM acc_invoices i
    WHERE i.status IN ('sent','paid','partial','overdue')
      AND NOT EXISTS (
        SELECT 1 FROM acc_journal_entries je
        WHERE je.reference_type = 'acc_invoice' AND je.reference_id = i.id
      )
    ORDER BY i.invoice_date NULLS LAST, i.created_at
  LOOP
    PERFORM acc_post_invoice_to_journal(v_id);
  END LOOP;

  FOR v_id IN
    SELECT p.id FROM acc_purchases p
    WHERE p.status IN ('received','paid','partial','overdue')
      AND COALESCE(p.total, 0) > 0
      AND NOT EXISTS (
        SELECT 1 FROM acc_journal_entries je
        WHERE je.reference_type = 'acc_purchase' AND je.reference_id = p.id
      )
    ORDER BY p.purchase_date NULLS LAST, p.created_at
  LOOP
    PERFORM acc_post_purchase_to_journal(v_id);
  END LOOP;
END $$;

-- 2. Fix apply_repair_completion product reference ---------------------------

CREATE OR REPLACE FUNCTION public.apply_repair_completion(
  p_repair_id uuid,
  p_repaired_qty integer,
  p_scrapped_qty integer,
  p_target_category_product_id uuid,
  p_worker_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_repair       record;
  v_total        integer;
  v_damaged_row  record;
  v_good_id      uuid;
  v_actor        uuid := auth.uid();
  v_credit       uuid;
BEGIN
  SELECT * INTO v_repair FROM depot_repairs WHERE id = p_repair_id;
  IF v_repair IS NULL THEN
    RAISE EXCEPTION 'Repair not found';
  END IF;

  v_total := coalesce(p_repaired_qty, 0) + coalesce(p_scrapped_qty, 0);
  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Asnje sasi per te raportuar';
  END IF;
  IF coalesce(v_repair.quantity_repaired, 0) + coalesce(v_repair.quantity_scrapped, 0) + v_total
       > coalesce(v_repair.quantity_in, 0) THEN
    RAISE EXCEPTION 'Sasia tejkalon totalin e pritur ne reparature';
  END IF;

  v_credit := COALESCE(p_worker_id, v_repair.worker_id, v_actor);

  SELECT * INTO v_damaged_row FROM stock
  WHERE company_id = v_repair.company_id
    AND depot_id   = v_repair.depot_id
    AND category_id = v_repair.category_id
    AND condition  = 'damaged'
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 1;

  IF v_damaged_row.id IS NOT NULL AND v_damaged_row.quantity >= v_total THEN
    UPDATE stock
    SET    quantity = quantity - v_total, updated_at = now()
    WHERE id = v_damaged_row.id;
    INSERT INTO stock_movements (company_id, depot_id, category_id, category_product_id, movement_type, quantity, condition_before, condition_after, notes, performed_by)
    VALUES (
      v_repair.company_id, v_repair.depot_id, v_repair.category_id,
      -- Attribute the decrement to the repair case's product, not to
      -- whichever damaged-stock row happened to sort first.
      v_repair.category_product_id,
      'repair', v_total, 'damaged', 'good', 'Reparim i raportuar', v_actor
    );
  END IF;

  IF coalesce(p_repaired_qty, 0) > 0 AND p_target_category_product_id IS NOT NULL THEN
    SELECT id INTO v_good_id FROM stock
    WHERE company_id = v_repair.company_id
      AND depot_id   = v_repair.depot_id
      AND category_id = v_repair.category_id
      AND category_product_id = p_target_category_product_id
      AND condition  = 'good'
    LIMIT 1;
    IF v_good_id IS NULL THEN
      INSERT INTO stock (company_id, depot_id, category_id, category_product_id, condition, quantity, updated_at, created_at)
      VALUES (v_repair.company_id, v_repair.depot_id, v_repair.category_id, p_target_category_product_id, 'good', p_repaired_qty, now(), now());
    ELSE
      UPDATE stock SET quantity = quantity + p_repaired_qty, updated_at = now()
      WHERE id = v_good_id;
    END IF;
    INSERT INTO stock_movements (company_id, depot_id, category_id, category_product_id, movement_type, quantity, condition_before, condition_after, notes, performed_by)
    VALUES (v_repair.company_id, v_repair.depot_id, v_repair.category_id, p_target_category_product_id, 'repair', p_repaired_qty, 'damaged', 'good', 'Palet te reparuara -> stok (te mira)', v_actor);
  END IF;

  IF coalesce(p_scrapped_qty, 0) > 0 THEN
    INSERT INTO stock_movements (company_id, depot_id, category_id, category_product_id, movement_type, quantity, condition_before, condition_after, notes, performed_by)
    VALUES (v_repair.company_id, v_repair.depot_id, v_repair.category_id, p_target_category_product_id, 'scrap', p_scrapped_qty, 'damaged', 'damaged', 'Hedhur si scrap gjate raportimit te riparimit', v_actor);
  END IF;

  UPDATE depot_repairs
  SET    quantity_repaired = coalesce(quantity_repaired, 0) + coalesce(p_repaired_qty, 0),
         quantity_scrapped = coalesce(quantity_scrapped, 0) + coalesce(p_scrapped_qty, 0),
         worker_id         = v_credit
  WHERE id = p_repair_id;
END;
$$;

-- 3. v_company_movements: don't attribute opener as repair performer ---------

DROP VIEW IF EXISTS public.v_company_movements;

CREATE VIEW public.v_company_movements
WITH (security_invoker = true)
AS
SELECT sm.id::text AS source_id,
       'stock_movement'::text AS source_type,
       sm.movement_type,
       sm.company_id,
       sm.depot_id,
       sm.category_id,
       sm.category_product_id,
       sm.condition_after AS condition,
       CASE WHEN sm.movement_type = 'exit' THEN - COALESCE(sm.quantity, 0)
            ELSE COALESCE(sm.quantity, 0) END AS quantity_delta,
       dn.flow_role,
       sm.delivery_note_id,
       sm.created_at AS movement_date,
       sm.performed_by,
       pp.full_name AS performed_by_full_name,
       sm.source_partner,
       sm.source_contact_id,
       ac.name AS source_contact_name
FROM stock_movements sm
LEFT JOIN delivery_notes dn ON dn.id = sm.delivery_note_id
LEFT JOIN profiles pp       ON pp.id = sm.performed_by
LEFT JOIN acc_contacts ac   ON ac.id = sm.source_contact_id
UNION ALL
SELECT psi.id::text,
       'sorting'::text,
       'entry'::text,
       psb.company_id,
       psb.depot_id,
       psb.category_id,
       psi.category_product_id,
       psi.condition,
       COALESCE(psi.quantity, 0),
       NULL::text,
       psb.source_delivery_note_id,
       COALESCE(psb.committed_at, psb.completed_at, psb.created_at),
       COALESCE(psb.completed_by, psb.created_by) AS performed_by,
       COALESCE(pc1.full_name, pc2.full_name)     AS performed_by_full_name,
       NULL::text AS source_partner,
       NULL::uuid AS source_contact_id,
       NULL::text AS source_contact_name
FROM pallet_sorting_items psi
JOIN pallet_sorting_batches psb ON psb.id = psi.batch_id
LEFT JOIN profiles pc1 ON pc1.id = psb.completed_by
LEFT JOIN profiles pc2 ON pc2.id = psb.created_by
WHERE psb.status = 'completed'
UNION ALL
SELECT dr.id::text,
       'repair'::text,
       'repair'::text,
       dr.company_id,
       dr.depot_id,
       dr.category_id,
       dr.category_product_id,
       'repaired'::text,
       COALESCE(dr.quantity_repaired, 0),
       NULL::text,
       dr.source_delivery_note_id,
       COALESCE(dr.logged_at, dr.created_at),
       -- worker_id only — don't fall back to opened_by. The opener
       -- (sorter) didn't perform the repair; until a reparature is
       -- credited, the row simply has no actor.
       dr.worker_id AS performed_by,
       pw.full_name AS performed_by_full_name,
       NULL::text,
       NULL::uuid,
       NULL::text
FROM depot_repairs dr
LEFT JOIN profiles pw ON pw.id = dr.worker_id;

-- 4. Stop swallowing trigger errors silently ---------------------------------

CREATE OR REPLACE FUNCTION public.stock_movement_notify_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type_label text;
  v_product    text;
  v_depot      text;
  v_who        text;
  v_partner    text;
  v_qty        text;
BEGIN
  IF NEW.movement_type NOT IN ('entry', 'exit', 'adjust', 'transfer_in', 'transfer_out') THEN
    RETURN NEW;
  END IF;

  v_type_label := CASE NEW.movement_type
    WHEN 'entry'        THEN 'Hyrje stoku'
    WHEN 'exit'         THEN 'Dalje stoku'
    WHEN 'adjust'       THEN 'Rregullim stoku'
    WHEN 'transfer_in'  THEN 'Transfer hyrje'
    WHEN 'transfer_out' THEN 'Transfer dalje'
    ELSE 'Levizje stoku'
  END;

  SELECT name INTO v_product FROM category_products WHERE id = NEW.category_product_id;
  IF v_product IS NULL THEN
    SELECT name INTO v_product FROM product_categories WHERE id = NEW.category_id;
  END IF;
  v_product := COALESCE(v_product, 'produkt');

  SELECT name INTO v_depot FROM depots WHERE id = NEW.depot_id;
  v_depot := COALESCE(v_depot, '-');

  SELECT full_name INTO v_who FROM profiles WHERE id = NEW.performed_by;
  v_who := COALESCE(v_who, 'Punetor');

  IF NEW.source_contact_id IS NOT NULL THEN
    SELECT name INTO v_partner FROM acc_contacts WHERE id = NEW.source_contact_id;
  END IF;
  v_partner := COALESCE(v_partner, NEW.source_partner, '');

  v_qty := COALESCE(NEW.quantity, 0)::text;

  INSERT INTO notifications (user_id, title, message, type, reference_id, data)
  SELECT p.id,
         v_type_label || ': ' || v_qty || ' ' || v_product,
         v_who || ' regjistroi ' || lower(v_type_label) || ' '
           || v_qty || ' ' || v_product || ' ne depo ' || v_depot
           || CASE WHEN v_partner <> '' THEN ' (' || v_partner || ')' ELSE '' END,
         'stock',
         NEW.id,
         jsonb_build_object(
           'movement_type', NEW.movement_type,
           'quantity', NEW.quantity,
           'depot_id', NEW.depot_id,
           'category_product_id', NEW.category_product_id,
           'performed_by', NEW.performed_by,
           'source_contact_id', NEW.source_contact_id,
           'url', '/company/stock'
         )
  FROM profiles p
  WHERE p.company_id = NEW.company_id
    AND p.role = 'company_admin'
    AND p.is_active = true;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Don't roll back the parent stock_movements insert — admin notify
  -- is a side effect, not a precondition. But surface the failure so
  -- it lands in observability instead of disappearing.
  RAISE WARNING 'stock_movement_notify_admin failed for movement %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.stock_movement_emit_partner_flow_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_direction text;
BEGIN
  IF NEW.source_contact_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.movement_type NOT IN ('entry', 'exit') THEN
    RETURN NEW;
  END IF;

  v_direction := CASE NEW.movement_type WHEN 'entry' THEN 'in' WHEN 'exit' THEN 'out' END;

  INSERT INTO partner_flow_events (
    company_id, partner_contact_id, direction, role_of_partner,
    category_id, category_product_id, quantity,
    event_date, notes, created_at
  ) VALUES (
    NEW.company_id, NEW.source_contact_id, v_direction,
    CASE NEW.movement_type WHEN 'entry' THEN 'sender' WHEN 'exit' THEN 'receiver' END,
    NEW.category_id, NEW.category_product_id, COALESCE(NEW.quantity, 0),
    NEW.created_at::date,
    'Manual ' || NEW.movement_type || ' stock_movement #' || NEW.id::text,
    now()
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'stock_movement_emit_partner_flow_event failed for movement %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;
