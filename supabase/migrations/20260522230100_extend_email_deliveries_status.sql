/*
  Extend email_deliveries.status to cover the lifecycle events the
  resend-webhook function reports (bounced / complained / delivered /
  opened / clicked) plus the "suppressed" status used by send-email
  when every recipient is on the suppression list.
*/

ALTER TABLE public.email_deliveries
  DROP CONSTRAINT IF EXISTS email_deliveries_status_check;

ALTER TABLE public.email_deliveries
  ADD CONSTRAINT email_deliveries_status_check
  CHECK (status IN (
    'queued', 'sent', 'failed', 'skipped',
    'suppressed', 'delivered', 'bounced', 'complained',
    'opened', 'clicked'
  ));
