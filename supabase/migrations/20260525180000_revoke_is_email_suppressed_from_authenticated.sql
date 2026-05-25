-- ============================================================================
-- Revoke is_email_suppressed(text) from authenticated
-- ----------------------------------------------------------------------------
-- Supabase advisor flagged public.is_email_suppressed as callable by
-- the `authenticated` role via /rest/v1/rpc/is_email_suppressed.
-- Investigation:
--   - The send-email edge function queries the email_suppression table
--     DIRECTLY through the service-role admin client (index.ts:528-537),
--     not via this RPC.
--   - No frontend or edge function calls is_email_suppressed.
--   - Migration 20260523080000 granted it to `authenticated` defensively
--     after the anon revoke, but in practice that was dead surface area.
--
-- Leaving the RPC callable by any logged-in user lets them enumerate
-- the global suppression list (hard bounces, complaints, unsubscribes)
-- one address at a time. That is both a privacy leak and a low-cost
-- recon for spam-targeting.
--
-- Lock it down to service_role only. The actual suppression check
-- continues to work because send-email already uses service_role.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.is_email_suppressed(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.is_email_suppressed(text) TO service_role;

COMMENT ON FUNCTION public.is_email_suppressed IS
  'Internal helper. Returns true if an email address sits on the global '
  'suppression list. Restricted to service_role — send-email and other '
  'mail edge functions are the only legitimate callers. Direct authenticated '
  'access removed to prevent address-enumeration of bounced/complaint emails.';
