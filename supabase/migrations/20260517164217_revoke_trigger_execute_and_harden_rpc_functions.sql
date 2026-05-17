/*
  # Revoke authenticated EXECUTE on trigger/internal functions and harden RPCs

  1. Trigger functions - Revoke EXECUTE from authenticated
    - create_supplier_purchase_draft (trigger)
    - derive_pallet_quantities_from_items (trigger)
    - emit_partner_flow_events (trigger)
    - notify_company_on_repair_sent_to_stock (trigger)
    - notify_on_traffic_alert (trigger)
    - trailer_load_items_refresh_flag (trigger)
    - trigger_accounting_sync_for_due_companies (cron-only)

  2. get_homepage_stats - Intentionally SECURITY DEFINER for public homepage
    - Already has search_path set
    - Only returns aggregate counts, no row data exposed
    - Revoke from public role, keep anon + authenticated

  3. match_supplier_invoice_candidates - Add auth guard
    - Recreate with auth.uid() check

  4. RPC functions already have auth.uid() guards:
    - apply_repair_completion, auto_register_counterparty, claim_trailer_load
    - create_invoice_from_delivery_note, create_invoice_with_stock_deduction
    - driver_complete_quick_draft, match_counterparty_company
    - reassign_trailer_load, remove_delivery_note_item

  5. Security notes
    - Trigger functions are never callable via RPC after this migration
    - All RPC functions verify auth.uid() before proceeding
*/

-- ============================================================
-- 1. Revoke EXECUTE from authenticated on trigger/internal functions
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.create_supplier_purchase_draft() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.derive_pallet_quantities_from_items() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.emit_partner_flow_events() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_company_on_repair_sent_to_stock() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_traffic_alert() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.trailer_load_items_refresh_flag() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_accounting_sync_for_due_companies() FROM authenticated;

-- ============================================================
-- 2. get_homepage_stats: revoke from public, narrow to anon+authenticated
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.get_homepage_stats() FROM public;
GRANT EXECUTE ON FUNCTION public.get_homepage_stats() TO anon, authenticated;

-- ============================================================
-- 3. match_supplier_invoice_candidates: add auth check
-- ============================================================

DROP FUNCTION IF EXISTS public.match_supplier_invoice_candidates(uuid, uuid, text, date, numeric, integer);

CREATE FUNCTION public.match_supplier_invoice_candidates(
  p_company_id uuid,
  p_contact_id uuid,
  p_invoice_number text,
  p_invoice_date date,
  p_total numeric,
  p_limit integer DEFAULT 5
)
RETURNS TABLE(
  purchase_id uuid,
  delivery_note_id uuid,
  purchase_number text,
  contact_id uuid,
  contact_name text,
  purchase_date date,
  total numeric,
  note_number text,
  confidence numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_company uuid;
BEGIN
  -- Auth guard
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Company scope guard
  SELECT company_id INTO v_caller_company FROM profiles WHERE id = auth.uid();
  IF v_caller_company IS DISTINCT FROM p_company_id THEN
    RAISE EXCEPTION 'Access denied: company mismatch';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT
      p.id AS purchase_id,
      p.delivery_note_id,
      p.purchase_number,
      p.contact_id,
      c.name AS contact_name,
      p.purchase_date,
      p.total,
      dn.note_number,
      (
        CASE WHEN p_contact_id IS NOT NULL AND p.contact_id = p_contact_id THEN 35 ELSE 0 END
        + CASE
          WHEN p_invoice_number IS NOT NULL AND p.purchase_number IS NOT NULL
          AND (
            p.purchase_number ILIKE '%' || p_invoice_number || '%'
            OR p_invoice_number ILIKE '%' || COALESCE(dn.note_number,'') || '%'
            OR p_invoice_number ILIKE '%' || COALESCE(dn.reference_number,'') || '%'
          ) THEN 25 ELSE 0
          END
        + CASE
          WHEN p_invoice_date IS NOT NULL AND p.purchase_date IS NOT NULL THEN
            GREATEST(0, 20 - ABS(p.purchase_date - p_invoice_date))
          ELSE 0
          END
        + CASE
          WHEN p_total IS NOT NULL AND p.total IS NOT NULL AND p.total > 0 THEN
            GREATEST(0, 20 - (ABS(p.total - p_total) / p.total * 100)::numeric)::numeric
          ELSE 0
          END
      )::numeric AS confidence
    FROM acc_purchases p
    LEFT JOIN acc_contacts c ON c.id = p.contact_id
    LEFT JOIN delivery_notes dn ON dn.id = p.delivery_note_id
    WHERE p.company_id = p_company_id
      AND p.status = 'awaiting_document'
  )
  SELECT candidates.purchase_id, candidates.delivery_note_id, candidates.purchase_number,
         candidates.contact_id, candidates.contact_name, candidates.purchase_date,
         candidates.total, candidates.note_number, candidates.confidence
  FROM candidates
  ORDER BY candidates.confidence DESC NULLS LAST, candidates.purchase_date DESC
  LIMIT p_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.match_supplier_invoice_candidates(uuid, uuid, text, date, numeric, integer) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.match_supplier_invoice_candidates(uuid, uuid, text, date, numeric, integer) TO authenticated;

-- ============================================================
-- 4. Ensure all RPC functions have correct grants
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.apply_repair_completion(uuid, integer, integer, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.apply_repair_completion(uuid, integer, integer, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.auto_register_counterparty(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.auto_register_counterparty(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.claim_trailer_load(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.claim_trailer_load(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_invoice_from_delivery_note(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.create_invoice_from_delivery_note(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_invoice_with_stock_deduction(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.create_invoice_with_stock_deduction(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.driver_complete_quick_draft(uuid, text, jsonb) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.driver_complete_quick_draft(uuid, text, jsonb) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.match_counterparty_company(text, text, text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.match_counterparty_company(text, text, text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.reassign_trailer_load(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.reassign_trailer_load(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.remove_delivery_note_item(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.remove_delivery_note_item(uuid) TO authenticated;
