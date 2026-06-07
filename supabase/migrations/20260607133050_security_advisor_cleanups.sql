-- Security review cleanups based on Supabase advisors (2026-06-07).
--
-- These are tightening fixes that close residual lints without changing
-- runtime behaviour. Verified via has_function_privilege before/after.

-- 1. The three admin_* SECURITY DEFINER RPCs (PR #153) had REVOKE FROM PUBLIC
--    + GRANT TO authenticated, but Supabase's default ACL re-granted EXECUTE
--    to the `anon` role anyway. The functions still enforce super_admin
--    inside the body, so anon calls always fail with insufficient_privilege
--    — but exposing the RPC at all over `/rest/v1/rpc/...` to anon is wider
--    than needed. Revoke explicitly from anon for defence-in-depth.
REVOKE EXECUTE ON FUNCTION public.admin_activate_subscription(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_cancel_subscription(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_extend_subscription(uuid, integer, text) FROM anon;

-- 2. normalize_trial_email has a mutable search_path (advisor 0011). Pin it
--    so a future `pg_temp` shadow can't redirect callers. Also revoke from
--    PUBLIC (which transitively granted anon) — it's a tidy internal helper
--    used by register-company, no need to expose it.
ALTER FUNCTION public.normalize_trial_email(text) SET search_path = public, pg_temp;
REVOKE EXECUTE ON FUNCTION public.normalize_trial_email(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.normalize_trial_email(text) FROM anon;

-- 3. prior_trials has RLS enabled but no policies (advisor 0008). With RLS
--    on and no policies the default is deny-all, which IS the intent
--    (service role only). Add an explicit no-op policy that selects only
--    when the caller is a Postgres superuser — effectively unreachable for
--    anon/authenticated, so behaviour is identical, but the advisor stops
--    flagging the table. The actual access path (service role used by
--    register-company) bypasses RLS entirely.
CREATE POLICY "prior_trials_service_role_only"
  ON public.prior_trials
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

COMMENT ON POLICY "prior_trials_service_role_only" ON public.prior_trials IS
  'Explicit deny-all for anon/authenticated to suppress advisor 0008. Real reads/writes are done by service role (register-company), which bypasses RLS.';
