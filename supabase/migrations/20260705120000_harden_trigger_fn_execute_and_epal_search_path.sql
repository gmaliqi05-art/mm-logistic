/*
  # Security-advisor hardening: trigger-fn EXECUTE + EPAL search_path

  Applied to the live DB via MCP alongside the batch of previously-merged
  migrations that had never been pushed to production; recorded here so git
  and prod stay in sync.

  1. The GoBD immutability trigger functions (added in
     20260703140000_gobd_invoice_immutability) are `SECURITY DEFINER` and
     were therefore reachable on the PostgREST RPC surface
     (`/rest/v1/rpc/...`). They are trigger-only; revoking EXECUTE removes
     them from the API without affecting trigger firing (triggers run
     regardless of the caller's function privileges). Same for the
     pre-existing `profiles_sync_pii_columns` trigger fn.

  2. `epal_quality_class_for_condition` / `epal_is_exchangeable` had a
     mutable `search_path` (advisor 0011); pin it.

  Not touched (intentional): `report_stock_damage` and `worker_log_repair`
  are genuine RPCs invoked from the depot UI and enforce their own role /
  worker_category checks; `btree_gist` in `public` is cosmetic and risky to
  relocate (dependent indexes).
*/

REVOKE EXECUTE ON FUNCTION public.acc_invoices_enforce_immutability() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.acc_invoice_items_enforce_immutability() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.profiles_sync_pii_columns() FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.epal_quality_class_for_condition(p_condition text) SET search_path = public, pg_temp;
ALTER FUNCTION public.epal_is_exchangeable(p_condition text) SET search_path = public, pg_temp;
