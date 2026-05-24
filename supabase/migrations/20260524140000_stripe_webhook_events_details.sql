/*
  # Stripe webhook audit details

  Backend audit B4: stripe-webhook drives subscription create/upgrade/
  cancel via service-role INSERT/UPDATE. No attribution to which
  Stripe event drove the change. The `audit_logs` table requires
  user_id NOT NULL so system events can't be recorded there without
  a schema change with broader blast radius.

  Cleaner: extend the `stripe_webhook_events` table (added in PR-B1
  for idempotency) with an optional `details jsonb` column that the
  handler populates with company_id, plan, old/new status, etc.
  after successfully processing the event.
*/

ALTER TABLE public.stripe_webhook_events
  ADD COLUMN IF NOT EXISTS details jsonb;

COMMENT ON COLUMN public.stripe_webhook_events.details IS
  'Audit details captured after the event was processed: which '
  'company_id was affected, the old/new subscription status, '
  'amount paid, etc. NULL during the initial idempotency insert; '
  'filled in by the handler once the event has been processed.';
