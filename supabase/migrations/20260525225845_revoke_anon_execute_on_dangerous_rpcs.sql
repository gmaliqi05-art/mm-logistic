/*
  # Revoke anon EXECUTE on dangerous RPC functions

  1. Security Changes
    - Revoke EXECUTE from `anon` on write-capable functions:
      - `apply_repair_from_stock` (modifies stock)
      - `apply_repair_completion` (modifies stock)
      - `worker_log_repair` (modifies stock, SECURITY DEFINER)
      - `is_email_suppressed` (SECURITY DEFINER, exposes email suppression status)
    - Revoke EXECUTE from `anon` on data-reading functions:
      - `get_default_depot` (returns company-specific data)
      - `get_driver_activity` (returns driver tracking data)
    - Revoke EXECUTE from `anon` on trigger-only functions accidentally exposed:
      - `auto_register_partner_from_delivery`
      - `auto_set_delivery_flow_defaults`
      - `delivery_notes_auto_status`
      - `reject_own_company_as_contact`
      - `trailer_loads_touch_updated_at`

  2. Rationale
    - Anonymous (unauthenticated) users should NEVER be able to call
      functions that modify stock, read tenant-specific data, or invoke
      SECURITY DEFINER functions
    - These functions all check auth.uid() internally, but defense-in-depth
      requires revoking the EXECUTE privilege at the role level too
    - Trigger functions should not be callable via REST API by any user
*/

-- Write-capable RPCs: revoke anon
REVOKE EXECUTE ON FUNCTION public.apply_repair_from_stock(uuid, integer, integer, uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.apply_repair_completion(uuid, integer, integer, uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.worker_log_repair(uuid, uuid, uuid, text, integer, integer) FROM anon;

-- SECURITY DEFINER utility: revoke anon
REVOKE EXECUTE ON FUNCTION public.is_email_suppressed(text) FROM anon;

-- Data-reading RPCs: revoke anon
REVOKE EXECUTE ON FUNCTION public.get_default_depot(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_driver_activity(uuid, uuid, timestamptz, timestamptz) FROM anon;

-- Trigger-backing functions accidentally exposed to anon
REVOKE EXECUTE ON FUNCTION public.auto_register_partner_from_delivery() FROM anon;
REVOKE EXECUTE ON FUNCTION public.auto_set_delivery_flow_defaults() FROM anon;
REVOKE EXECUTE ON FUNCTION public.delivery_notes_auto_status() FROM anon;
REVOKE EXECUTE ON FUNCTION public.reject_own_company_as_contact() FROM anon;
REVOKE EXECUTE ON FUNCTION public.trailer_loads_touch_updated_at() FROM anon;
