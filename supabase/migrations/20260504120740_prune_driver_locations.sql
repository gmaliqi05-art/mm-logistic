/*
  # Prune old driver_locations via pg_cron

  1. New Functions
    - `prune_driver_locations()` - deletes rows older than 30 days
  2. Schedule
    - Daily at 03:15 UTC via pg_cron
*/

CREATE OR REPLACE FUNCTION public.prune_driver_locations()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM driver_locations
  WHERE recorded_at < (now() - interval '30 days');
$$;

REVOKE ALL ON FUNCTION public.prune_driver_locations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prune_driver_locations() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'prune_driver_locations_daily';

    PERFORM cron.schedule(
      'prune_driver_locations_daily',
      '15 3 * * *',
      $cron$ SELECT public.prune_driver_locations(); $cron$
    );
  END IF;
END $$;
