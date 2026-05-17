/*
  # Schedule homepage stats cache refresh

  1. Changes
    - Add pg_cron job to refresh homepage_stats_cache every 5 minutes
    - Ensures public homepage shows reasonably fresh statistics

  2. Notes
    - The private.refresh_homepage_stats_cache() function is SECURITY DEFINER
    - Only callable by service_role/superuser (used by cron)
    - Not exposed to anon or authenticated via PostgREST
*/

SELECT cron.schedule(
  'refresh-homepage-stats',
  '*/5 * * * *',
  $$SELECT private.refresh_homepage_stats_cache()$$
);
