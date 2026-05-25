/*
  # Revoke PUBLIC execute on sensitive RPC functions

  1. Security Changes
    - The previous migration revoked from `anon` but the `PUBLIC` pseudo-role
      (which anon inherits from) still had EXECUTE grants
    - This migration revokes from PUBLIC and explicitly re-grants to authenticated only
    - Covers all write-capable RPCs, SECURITY DEFINER functions, and trigger functions

  2. Affected Functions
    - apply_repair_from_stock, apply_repair_completion (stock mutations)
    - worker_log_repair (SECURITY DEFINER, stock mutations)
    - is_email_suppressed (SECURITY DEFINER, email check)
    - get_default_depot, get_driver_activity (tenant data readers)
    - 5 trigger-backing functions (should never be called via REST)
*/

-- Write-capable RPCs
REVOKE EXECUTE ON FUNCTION public.apply_repair_from_stock(uuid, integer, integer, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_repair_from_stock(uuid, integer, integer, uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.apply_repair_completion(uuid, integer, integer, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_repair_completion(uuid, integer, integer, uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.worker_log_repair(uuid, uuid, uuid, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.worker_log_repair(uuid, uuid, uuid, text, integer, integer) TO authenticated;

-- SECURITY DEFINER utility
REVOKE EXECUTE ON FUNCTION public.is_email_suppressed(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_email_suppressed(text) TO authenticated;

-- Data readers
REVOKE EXECUTE ON FUNCTION public.get_default_depot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_default_depot(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_driver_activity(uuid, uuid, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_driver_activity(uuid, uuid, timestamptz, timestamptz) TO authenticated;

-- Trigger-backing functions (should not be callable via REST at all)
REVOKE EXECUTE ON FUNCTION public.auto_register_partner_from_delivery() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auto_set_delivery_flow_defaults() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delivery_notes_auto_status() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reject_own_company_as_contact() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trailer_loads_touch_updated_at() FROM PUBLIC;
