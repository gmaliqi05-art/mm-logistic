-- Remove the three admin subscription RPCs from the public PostgREST surface.
--
-- The Supabase advisor (lint 0029) flagged admin_activate / cancel / extend
-- _subscription as callable by `authenticated`. They had an internal
-- `private.get_user_role() = 'super_admin'` check that already rejected
-- non-super-admin callers, but every signed-in user could still hit the
-- /rest/v1/rpc/admin_* endpoint and trigger the role-check error — that's
-- both an information leak (function names + signatures probable) and a
-- wider attack surface than the use case needs.
--
-- The companion edge function `admin-subscription-action` now wraps the
-- three RPCs: it requires a super_admin JWT (via requireCaller) and then
-- invokes the RPC with the service role, which bypasses the EXECUTE grant.
-- That lets us drop EXECUTE for authenticated and close advisor 0029 for
-- these three functions completely.
--
-- Note: service_role is a Postgres superuser and ignores REVOKE, so the
-- edge-function path keeps working. company_admin / driver / depot_worker
-- callers attempting `supabase.rpc('admin_*', ...)` will now get a clean
-- 403 from PostgREST before any function code runs.

REVOKE EXECUTE ON FUNCTION public.admin_activate_subscription(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_cancel_subscription(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_extend_subscription(uuid, integer, text) FROM authenticated;
