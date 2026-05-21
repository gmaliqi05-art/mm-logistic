/*
  # Enrich stock_movements with contact link, notify admin, and surface
  the actor in v_company_movements

  Multi-part change to support the company's audit trail requirements:

  1. New column `stock_movements.source_contact_id uuid REFERENCES
     acc_contacts(id) ON DELETE SET NULL`. Lets the depoist tag a
     manual entry/exit to a real customer or supplier from
     acc_contacts; the existing free-text `source_partner` column
     stays as a fallback for ad-hoc cases.

  2. Rebuild `v_company_movements` to expose `performed_by`,
     `performed_by_full_name`, `source_partner`, and `source_contact_id`
     across all three subqueries (stock_movements / sorting / repair).
     Existing consumer queries that only request the original column
     list keep working — the new columns are additive.

  3. Trigger `trg_stock_movement_notify_admin` (AFTER INSERT on
     stock_movements) — for every entry / exit / adjust, insert one
     notification per active company_admin in the same company. The
     message includes movement type, quantity, product/category,
     depot, depoist who registered it, and the partner (contact or
     free-text). Push delivery is the existing fan-out trigger's job.

  4. Trigger `trg_stock_movement_emit_partner_flow_event` (AFTER
     INSERT on stock_movements WHEN source_contact_id IS NOT NULL) —
     mirrors the manual movement into `partner_flow_events` so it
     shows up on the partner ledger alongside delivery-note-driven
     events. Direction follows movement_type: entry -> 'in',
     exit -> 'out'.

  No data backfill — historical rows simply lack the new columns;
  reports show NULL for those.
*/

-- 1. Column ------------------------------------------------------------------

ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS source_contact_id uuid
    REFERENCES public.acc_contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_stock_movements_source_contact
  ON public.stock_movements(source_contact_id)
  WHERE source_contact_id IS NOT NULL;

-- 2. Recreate the view (additive only — existing column order preserved) ----

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
       COALESCE(dr.worker_id, dr.opened_by)        AS performed_by,
       COALESCE(pw.full_name, po.full_name)        AS performed_by_full_name,
       NULL::text,
       NULL::uuid,
       NULL::text
FROM depot_repairs dr
LEFT JOIN profiles pw ON pw.id = dr.worker_id
LEFT JOIN profiles po ON po.id = dr.opened_by;

-- 3. Notify-admin trigger ----------------------------------------------------

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
  -- We only notify for human-meaningful events. Internal sort/repair
  -- bookkeeping movements have their own dedicated notifications.
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
  v_depot := COALESCE(v_depot, '—');

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
  -- Don't let notification failures roll back the stock insert.
  RAISE NOTICE 'stock_movement_notify_admin skipped: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stock_movement_notify_admin ON public.stock_movements;
CREATE TRIGGER trg_stock_movement_notify_admin
AFTER INSERT ON public.stock_movements
FOR EACH ROW
EXECUTE FUNCTION public.stock_movement_notify_admin();

-- 4. Mirror manual movements into partner_flow_events ------------------------

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
  RAISE NOTICE 'partner_flow_event mirror skipped: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stock_movement_emit_partner_flow_event ON public.stock_movements;
CREATE TRIGGER trg_stock_movement_emit_partner_flow_event
AFTER INSERT ON public.stock_movements
FOR EACH ROW
WHEN (NEW.source_contact_id IS NOT NULL)
EXECUTE FUNCTION public.stock_movement_emit_partner_flow_event();
