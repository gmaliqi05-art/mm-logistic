/*
  # Reduce accounting sync cron frequency from every minute to every 5 minutes

  1. Changes
    - Reschedule trigger_accounting_sync_for_due_companies from every-minute
      to every-5-minutes schedule
    - Accounting sync does not require sub-minute precision; 5-minute intervals
      reduce unnecessary database load while still providing timely syncs

  2. Security
    - No permission changes
*/

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'trigger_accounting_sync_for_due_companies'),
  schedule := '*/5 * * * *'
);
