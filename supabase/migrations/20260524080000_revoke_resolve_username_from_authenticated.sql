/*
  # Revoke resolve_username_to_email from authenticated

  Post-audit hardening. The previous migration
  (20260523080000_revoke_anon_from_security_definer_rpcs.sql) revoked
  anon access but left `GRANT EXECUTE TO authenticated`. That meant
  any logged-in driver / depot worker could call the RPC directly and
  enumerate usernames across all tenants — bypassing the IP rate-limit
  that the resolve-username edge function applies.

  Login flow already uses the edge function (LoginPage.tsx), which
  proxies via service-role. So removing the `authenticated` grant
  closes the enumeration vector without breaking login.

  Only `service_role` retains EXECUTE — that's the role the edge
  function uses after its rate-limit check.
*/

REVOKE EXECUTE ON FUNCTION public.resolve_username_to_email(text) FROM authenticated;

COMMENT ON FUNCTION public.resolve_username_to_email IS
  'Username → email lookup for login. Restricted to service_role only — '
  'called by the resolve-username edge function after IP rate-limiting. '
  'Direct authenticated access was removed to prevent cross-tenant enumeration.';
