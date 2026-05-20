-- ============================================================================
-- Daily cron jobs for compliance and overdue-invoice checks
-- ----------------------------------------------------------------------------
-- Background
--   Two edge functions already exist and do the right thing on demand:
--     - check-compliance-expirations: walks vehicle_inspections /
--       vehicle_insurance / vehicle_taxes / driver_licenses /
--       qualifications / medical, inserts notifications rows for
--       documents that are about to expire.
--     - check-overdue-invoices: walks acc_invoices past their due
--       date, flips status to 'overdue', sends reminder emails, and
--       (after the PR #7 change) inserts in-app notifications for
--       company_admins on the flip.
--
--   Neither was ever wired to a schedule, so they only ran when someone
--   manually invoked the function. That meant compliance warnings and
--   overdue flags only appeared when a developer poked the endpoint.
--
-- This migration wires both up via pg_cron (already in use for the
-- email-campaign scheduler — see 20260503203728). The HTTP call is made
-- via pg_net so the cron job returns immediately and does not hold a
-- transaction open for the duration of the edge function.
--
-- Reads connection info from public.email_cron_config (id=1), the same
-- row the email cron uses. If the row is absent or `enabled=false`, the
-- functions exit cleanly. So flipping the email cron switch off in the
-- super-admin UI also pauses these new jobs — single kill switch.
--
-- Schedule:
--   compliance check: every day at 06:30 UTC (08:30 Berlin in summer,
--     07:30 in winter). Early enough that a German company can see
--     the alerts before the operational day starts.
--   overdue invoices: every day at 06:35 UTC, 5 minutes later, so we
--     don't hit the project with two heavy edge invocations
--     simultaneously.
--
-- Idempotent: CREATE OR REPLACE for the functions, unschedule-before-
-- schedule pattern for the cron jobs.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.tick_check_compliance_expirations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, net
AS $$
DECLARE
  cfg RECORD;
  req_id bigint;
BEGIN
  SELECT * INTO cfg FROM public.email_cron_config WHERE id = 1;
  IF NOT FOUND OR cfg.enabled = false OR cfg.project_url = '' OR cfg.service_role_key = '' THEN
    RETURN;
  END IF;

  SELECT net.http_post(
    url := cfg.project_url || '/functions/v1/check-compliance-expirations',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || cfg.service_role_key,
      'apikey', cfg.service_role_key
    )
  ) INTO req_id;
END $$;

CREATE OR REPLACE FUNCTION public.tick_check_overdue_invoices()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, net
AS $$
DECLARE
  cfg RECORD;
  req_id bigint;
BEGIN
  SELECT * INTO cfg FROM public.email_cron_config WHERE id = 1;
  IF NOT FOUND OR cfg.enabled = false OR cfg.project_url = '' OR cfg.service_role_key = '' THEN
    RETURN;
  END IF;

  SELECT net.http_post(
    url := cfg.project_url || '/functions/v1/check-overdue-invoices',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || cfg.service_role_key,
      'apikey', cfg.service_role_key
    )
  ) INTO req_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.tick_check_compliance_expirations() FROM public;
REVOKE EXECUTE ON FUNCTION public.tick_check_overdue_invoices() FROM public;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Compliance expirations: 06:30 UTC daily
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'check-compliance-expirations';

    PERFORM cron.schedule(
      'check-compliance-expirations',
      '30 6 * * *',
      $cron$ SELECT public.tick_check_compliance_expirations(); $cron$
    );

    -- Overdue invoices: 06:35 UTC daily (5 minutes later to avoid concurrent edge invocations)
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'check-overdue-invoices';

    PERFORM cron.schedule(
      'check-overdue-invoices',
      '35 6 * * *',
      $cron$ SELECT public.tick_check_overdue_invoices(); $cron$
    );
  END IF;
END $$;
