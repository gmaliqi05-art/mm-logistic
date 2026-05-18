/*
  # Schedule overdue invoice check cron

  1. Changes
    - Creates a pg_cron job that runs every 6 hours
    - Calls the check-overdue-invoices edge function via pg_net
    - Sends payment reminders on due date, +7 days, +14 days

  2. Purpose
    - Automatic payment reminders without manual intervention
    - Three escalation levels: due day, 7 days late, 14 days late
*/

SELECT cron.schedule(
  'check-overdue-invoices',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/check-overdue-invoices',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
