/*
  # Security-advisor fix: profiles_sync_pii_columns should not be RPC-callable

  `profiles_sync_pii_columns()` is a trigger function (trigger
  `profiles_sync_pii_columns_trg` on profiles) that is SECURITY DEFINER, but it
  still carried the implicit PUBLIC EXECUTE grant, so PostgREST exposed it at
  `/rest/v1/rpc/profiles_sync_pii_columns` to anon and authenticated
  (advisor: anon/authenticated_security_definer_function_executable).

  Trigger functions run as part of the table operation and do not depend on
  the caller's EXECUTE grant, so revoking it does not affect the trigger.

  Applied to prod via MCP; recorded here to keep git in sync. Verified after:
  anon/authenticated EXECUTE = false, trigger still present.

  Note: the two `epal_*` functions the advisor also flagged already carry
  `SET search_path = public, pg_temp` and are SECURITY INVOKER (stale advisor
  cache — no change needed), and report_stock_damage / worker_log_repair are
  intentional depot-worker RPCs with internal role gating.
*/

REVOKE ALL ON FUNCTION public.profiles_sync_pii_columns() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.profiles_sync_pii_columns() FROM anon;
REVOKE ALL ON FUNCTION public.profiles_sync_pii_columns() FROM authenticated;
