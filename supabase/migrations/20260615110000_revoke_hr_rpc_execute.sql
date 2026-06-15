/*
  # Revoke REST-exposable EXECUTE on HR SECURITY DEFINER helpers

  ## Why
  The Supabase security advisor flagged both functions added in the HR
  audit (MH3 + MH4) as `anon_security_definer_function_executable` and
  `authenticated_security_definer_function_executable`. By default a
  function defined in the `public` schema is callable through PostgREST
  at `/rest/v1/rpc/<name>` by both the `anon` and `authenticated`
  roles. Combined with `SECURITY DEFINER` that means an unauthenticated
  user or any signed-in user could invoke them, which we never want:

    * public.hr_notify_overtime()
        Trigger function only. Direct invocation would fail at runtime
        because NEW is NULL, but it should not be callable at all
        through REST — that is an attack surface and a noisy 500 in
        the logs.

    * public.hr_run_annual_leave_rollover(smallint)
        Inserts rows into employee_leave_balances + hr_notifications
        for every tenant. The pg_cron job runs it as the cron
        superuser; nobody else has any reason to call it directly via
        REST. Leaving it open would let any signed-in user pollute
        every tenant's balance/notification tables with a single POST.

  Both functions remain callable from inside SQL (triggers, cron jobs,
  admin tools using the service_role key). We only revoke the two
  PostgREST-exposed roles + PUBLIC.

  Pre-existing similar exposures (`report_stock_damage`,
  `worker_log_repair`, `epal_*`) are unchanged — they predate this
  branch and addressing them belongs to its own review pass.
*/

REVOKE EXECUTE ON FUNCTION public.hr_notify_overtime()              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.hr_run_annual_leave_rollover(smallint) FROM PUBLIC, anon, authenticated;
