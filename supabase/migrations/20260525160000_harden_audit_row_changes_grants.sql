-- ============================================================================
-- Harden audit_row_changes() grants: lock REST API exposure
-- ----------------------------------------------------------------------------
-- The previous migration (20260525150000) did:
--   REVOKE EXECUTE ON FUNCTION public.audit_row_changes() FROM public;
-- but Supabase's database linter still flagged the function as callable
-- via /rest/v1/rpc/audit_row_changes by both `anon` and `authenticated`.
-- CREATE OR REPLACE FUNCTION re-grants the default EXECUTE to PUBLIC,
-- and `REVOKE ... FROM public` is not always sufficient to clear the
-- per-role grants that PostgREST honours.
--
-- This migration revokes EXECUTE explicitly from anon + authenticated.
-- audit_row_changes() is a TRIGGER function — it is never called via
-- RPC; only the trigger context (postgres / service_role) should be
-- able to invoke it.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.audit_row_changes() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.audit_row_changes() IS
  'Internal trigger function — invoked only by AFTER INSERT/UPDATE/DELETE '
  'triggers on profiles, companies, stock and related tables. Not callable '
  'via REST API (EXECUTE revoked from anon/authenticated).';
