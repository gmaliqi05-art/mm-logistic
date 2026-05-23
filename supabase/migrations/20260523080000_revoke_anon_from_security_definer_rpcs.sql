/*
  # Tighten EXECUTE grants on SECURITY DEFINER RPCs

  The Supabase advisor flagged three SECURITY DEFINER functions as
  callable by the anon role. Each one already has a hard
  `IF auth.uid() IS NULL THEN RAISE` guard at the top, so an anonymous
  caller cannot actually mutate anything — but exposure via PostgREST
  is bad defense-in-depth and lets an attacker enumerate behaviour.

  1. resolve_username_to_email — was the genuine concern. Anon needed
     to call it for the username login flow (depot workers, drivers).
     We now route that flow through the new resolve-username edge
     function which rate-limits 10 req/min/IP. The DB function stays
     SECURITY DEFINER but is now callable only by service_role and
     authenticated.

  2. worker_log_repair — anon was never useful; the function bails
     immediately if auth.uid() is null. Defense-in-depth revoke.

  3. is_email_suppressed — same, anon never had a legitimate use.

  report_stock_damage is intentionally left as SECURITY DEFINER with
  EXECUTE granted to authenticated only (already correct).
*/

REVOKE EXECUTE ON FUNCTION public.resolve_username_to_email(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.resolve_username_to_email(text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.worker_log_repair(uuid, uuid, uuid, text, integer, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.worker_log_repair(uuid, uuid, uuid, text, integer, integer) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.is_email_suppressed(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_email_suppressed(text) TO authenticated, service_role;

COMMENT ON FUNCTION public.resolve_username_to_email IS
  'Username -> synthetic email lookup. Callable only by authenticated or service_role. Anon clients must hit the resolve-username edge function, which rate-limits per IP.';
