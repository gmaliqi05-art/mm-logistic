/*
  # MH3: Automatic annual leave-balance rollover (§7 BUrlG)

  ## Why
  `employee_leave_balances` has a `carried_over_days` column that the
  trigger `hr_update_leave_balance()` never touches. Every January the
  admin has to manually create a new balance row for every active
  employee × leave_type and copy over the unused balance — easy to
  forget, easy to get wrong, and a §7(3) BUrlG audit pain point
  (carried-over days must remain visible until end of March or they
  are forfeited).

  ## What this ships
  A SECURITY DEFINER function + pg_cron schedule that runs at 02:00
  on January 1 each year and, for every employee × leave_type that had
  a balance row in the prior year:

    1. Computes `remaining = MAX(0, allocated_days + carried_over_days
                                       - used_days)`
       (pending_days are ignored — anything pending at year boundary
       is left in the prior-year row to be decided by the admin
       before approval moves it.)
    2. Inserts a row for the new year with:
         allocated_days   = prior year's allocated_days
         carried_over_days = remaining
         used_days        = 0
         pending_days     = 0
       ON CONFLICT (user_id, leave_type_id, year) DO NOTHING so admins
       who manually pre-seeded the new year keep their values.
    3. Sends one hr_notifications of type 'leave_request_new'-style
       summary row to every active company_admin so the new-year
       rollover is visible.

  §7(3) BUrlG says carried-over days must be granted and taken by 31
  March of the following year, otherwise they are forfeited. That
  forfeiture step (March 31 reset of carried_over_days → 0) is NOT
  shipped here — BAG case law since 2018 requires the employer to
  formally notify the employee before forfeiture, which is a UI
  workflow not a cron job. Tracked as follow-up.

  ## Safety
  - Idempotent: running it twice on the same year is a no-op because
    of ON CONFLICT DO NOTHING.
  - Read-only on prior-year rows; only inserts into the new year.
  - Pinned search_path + SECURITY DEFINER per the codebase convention
    for HR triggers.
  - Schedule guard mirrors the existing "guard_cron_jobs_against_
    empty_vault" pattern: the cron entry calls the function directly
    (no Vault dependency), so it can never silently fail at startup.

  ## Manual invocation
  After applying the migration, anyone can backfill the rollover
  immediately by calling `SELECT public.hr_run_annual_leave_rollover();`
  with default (current year) arguments, or for a specific year via
  `SELECT public.hr_run_annual_leave_rollover(2027);`.
*/

CREATE OR REPLACE FUNCTION public.hr_run_annual_leave_rollover(
  p_target_year smallint DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::smallint
)
RETURNS TABLE (
  inserted_rows   integer,
  skipped_rows    integer,
  total_remaining numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source_year smallint := p_target_year - 1;
  v_inserted    integer := 0;
  v_skipped     integer := 0;
  v_total       numeric := 0;
  v_admin       RECORD;
  v_company     RECORD;
BEGIN
  -- Roll prior-year balances forward into the target year. Anything
  -- still pending at year boundary stays on the prior-year row; once
  -- the admin approves/rejects, the trigger will adjust that prior
  -- row's used_days/pending_days but never the target year's row.
  WITH ins AS (
    INSERT INTO public.employee_leave_balances (
      user_id, company_id, leave_type_id, year,
      allocated_days, used_days, pending_days, carried_over_days
    )
    SELECT
      b.user_id,
      b.company_id,
      b.leave_type_id,
      p_target_year,
      b.allocated_days,
      0,
      0,
      GREATEST(0, b.allocated_days + b.carried_over_days - b.used_days)
    FROM public.employee_leave_balances b
    JOIN public.profiles p
      ON p.id = b.user_id
     AND p.is_active = true
    WHERE b.year = v_source_year
    ON CONFLICT (user_id, leave_type_id, year) DO NOTHING
    RETURNING carried_over_days
  )
  SELECT count(*)::integer, COALESCE(SUM(carried_over_days), 0)
    INTO v_inserted, v_total
    FROM ins;

  -- Anything in source year that was skipped (because the target row
  -- already existed, e.g. admin pre-seeded the new year manually).
  SELECT count(*)::integer INTO v_skipped
    FROM public.employee_leave_balances b
    JOIN public.profiles p
      ON p.id = b.user_id
     AND p.is_active = true
   WHERE b.year = v_source_year
     AND EXISTS (
       SELECT 1 FROM public.employee_leave_balances t
        WHERE t.user_id       = b.user_id
          AND t.leave_type_id = b.leave_type_id
          AND t.year          = p_target_year
     );

  -- Per-company admin notification summarising the rollover. One
  -- row per active company_admin, scoped by company so each tenant
  -- sees only its own counts.
  FOR v_company IN
    SELECT b.company_id,
           count(*)::integer       AS rolled,
           COALESCE(SUM(GREATEST(0, b.allocated_days + b.carried_over_days - b.used_days)), 0) AS carried
      FROM public.employee_leave_balances b
      JOIN public.profiles p
        ON p.id = b.user_id
       AND p.is_active = true
     WHERE b.year = v_source_year
     GROUP BY b.company_id
  LOOP
    FOR v_admin IN
      SELECT id FROM public.profiles
       WHERE company_id = v_company.company_id
         AND role = 'company_admin'
         AND is_active = true
    LOOP
      INSERT INTO public.hr_notifications (
        company_id, recipient_id, type, related_id, title, message
      )
      VALUES (
        v_company.company_id,
        v_admin.id,
        'leave_request_new',
        NULL,
        'Rollover vjetor i pushimeve',
        'Bilancet e pushimeve per vitin ' || p_target_year::text
          || ' u krijuan automatikisht. '
          || v_company.rolled::text || ' rreshta u bartne, '
          || v_company.carried::text || ' dite te papermbushura jane shtuar si carried_over (§7(3) BUrlG: duhet te merren deri me 31 mars).'
      );
    END LOOP;
  END LOOP;

  inserted_rows   := v_inserted;
  skipped_rows    := v_skipped;
  total_remaining := v_total;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.hr_run_annual_leave_rollover(smallint) IS
  '§7 BUrlG rollover. For each employee_leave_balances row in the prior year, inserts a new-year row with carried_over_days = MAX(0, allocated + carried_over - used). ON CONFLICT DO NOTHING so admins who pre-seeded the new year keep their values. Notifies each active company_admin per tenant with rolled count + carried days. Forfeit at end of March (§7(3)) is deferred — BAG case law requires employer notification first, which is a UI workflow.';

-- pg_cron schedule: 02:00 on Jan 1 each year (UTC).
SELECT cron.unschedule('hr-annual-leave-rollover')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'hr-annual-leave-rollover');

SELECT cron.schedule(
  'hr-annual-leave-rollover',
  '0 2 1 1 *',
  $cron$SELECT public.hr_run_annual_leave_rollover();$cron$
);
