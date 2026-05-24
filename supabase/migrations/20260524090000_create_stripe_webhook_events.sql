/*
  # Stripe webhook idempotency

  Adds `stripe_webhook_events(event_id PK, event_type, processed_at)`.
  The Stripe webhook handler will INSERT ... ON CONFLICT DO NOTHING
  on every event. If no row is returned, the event is a duplicate
  (Stripe retries on 5xx/timeouts and also occasionally re-delivers
  events at-most-once-ish) and the handler short-circuits with a 200,
  preventing double-charged subscriptions and duplicate
  payment_transactions rows.

  Service role only — webhook function uses service-role bearer.
*/

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- No SELECT/INSERT/UPDATE/DELETE policies for public roles. The
-- webhook function uses service_role which bypasses RLS.
COMMENT ON TABLE public.stripe_webhook_events IS
  'Idempotency log for Stripe webhook events. The webhook function '
  'INSERTs each event.id once; duplicates short-circuit to a 200 '
  'response without re-processing.';

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_type_time
  ON public.stripe_webhook_events (event_type, processed_at DESC);
