/*
  # Post-audit security hardening

  Three follow-ups surfaced by the end-to-end depot verification:

  1. `apply_repair_completion` had two overloads in pg_proc — the original
     4-param signature plus the new 5-param signature added in
     20260521130000. Drop the 4-param overload so callers can't bypass the
     reparature-attribution requirement by omitting the new param.

  2. The three reporting views rewritten in 20260521120000
     (`v_depot_repair_productivity`, `v_depot_sorting_outcomes`,
     `v_depot_daily_flow`) were created as SECURITY DEFINER by default,
     which bypasses RLS on the underlying tables. Recreate them with
     `security_invoker = true` so RLS is enforced against the *caller*,
     not the view owner.
*/

DROP FUNCTION IF EXISTS public.apply_repair_completion(uuid, integer, integer, uuid);

ALTER VIEW public.v_depot_repair_productivity SET (security_invoker = true);
ALTER VIEW public.v_depot_sorting_outcomes    SET (security_invoker = true);
ALTER VIEW public.v_depot_daily_flow          SET (security_invoker = true);
