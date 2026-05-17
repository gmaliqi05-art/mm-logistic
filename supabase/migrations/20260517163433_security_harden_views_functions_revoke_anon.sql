/*
  # Security hardening: Views, Functions, and EXECUTE revocation

  1. Views - Set security_invoker = true (7 views)
    - v_homepage_public_stats, v_depot_sorting_outcomes, v_depot_stock_value
    - v_depot_daily_flow, v_company_movements, v_company_stock_breakdown
    - v_depot_repair_productivity

  2. Functions - Fix mutable search_path (8 functions)
    - public: auto_set_delivery_flow_defaults, normalize_company_label,
      is_own_company_name, reject_own_company_as_contact,
      auto_register_partner_from_delivery, trailer_loads_touch_updated_at
    - private: norm_company_label, strip_own_from_partner

  3. Revoke EXECUTE from anon on SECURITY DEFINER functions
    - Trigger functions not callable via RPC
    - RPC functions restricted to authenticated only
    - get_homepage_stats kept accessible to anon (public stats page)

  4. Important notes
    - Views use security_invoker so RLS applies to the querying user
    - search_path set to explicit schema to prevent path injection
*/

-- ============================================================
-- 1. Fix views: set security_invoker = on
-- ============================================================

ALTER VIEW public.v_homepage_public_stats SET (security_invoker = on);
ALTER VIEW public.v_depot_sorting_outcomes SET (security_invoker = on);
ALTER VIEW public.v_depot_stock_value SET (security_invoker = on);
ALTER VIEW public.v_depot_daily_flow SET (security_invoker = on);
ALTER VIEW public.v_company_movements SET (security_invoker = on);
ALTER VIEW public.v_company_stock_breakdown SET (security_invoker = on);
ALTER VIEW public.v_depot_repair_productivity SET (security_invoker = on);

-- ============================================================
-- 2. Fix mutable search_path on functions
-- ============================================================

ALTER FUNCTION public.auto_set_delivery_flow_defaults() SET search_path = public;
ALTER FUNCTION public.normalize_company_label(p_text text) SET search_path = public;
ALTER FUNCTION public.is_own_company_name(p_company_id uuid, p_candidate_name text, p_candidate_vat text) SET search_path = public;
ALTER FUNCTION public.reject_own_company_as_contact() SET search_path = public;
ALTER FUNCTION public.auto_register_partner_from_delivery() SET search_path = public;
ALTER FUNCTION private.norm_company_label(txt text) SET search_path = private, public;
ALTER FUNCTION private.strip_own_from_partner(raw_name text, own_name text, own_vat text) SET search_path = private, public;
ALTER FUNCTION public.trailer_loads_touch_updated_at() SET search_path = public;

-- ============================================================
-- 3. Revoke EXECUTE from anon on SECURITY DEFINER functions
-- ============================================================

-- Trigger functions (should never be callable as RPC)
REVOKE EXECUTE ON FUNCTION public.create_supplier_purchase_draft() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.derive_pallet_quantities_from_items() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.emit_partner_flow_events() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.notify_company_on_repair_sent_to_stock() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.notify_on_traffic_alert() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.trailer_load_items_refresh_flag() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.trigger_accounting_sync_for_due_companies() FROM anon, public;

-- RPC functions: revoke from anon and public role, grant to authenticated only
REVOKE EXECUTE ON FUNCTION public.apply_repair_completion(uuid, integer, integer, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.auto_register_counterparty(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.claim_trailer_load(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.create_invoice_from_delivery_note(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.create_invoice_with_stock_deduction(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.driver_complete_quick_draft(uuid, text, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.match_counterparty_company(text, text, text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.match_supplier_invoice_candidates(uuid, uuid, text, date, numeric, integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.reassign_trailer_load(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.remove_delivery_note_item(uuid) FROM anon, public;

-- Explicitly grant to authenticated for RPC functions
GRANT EXECUTE ON FUNCTION public.apply_repair_completion(uuid, integer, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_register_counterparty(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_trailer_load(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_invoice_from_delivery_note(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_invoice_with_stock_deduction(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.driver_complete_quick_draft(uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_counterparty_company(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_supplier_invoice_candidates(uuid, uuid, text, date, numeric, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reassign_trailer_load(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_delivery_note_item(uuid) TO authenticated;

-- get_homepage_stats: accessible to anon (public homepage) but not via public role
REVOKE EXECUTE ON FUNCTION public.get_homepage_stats() FROM public;
GRANT EXECUTE ON FUNCTION public.get_homepage_stats() TO anon, authenticated;
