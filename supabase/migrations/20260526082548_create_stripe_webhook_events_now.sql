/*
  # Create stripe_webhook_events table (re-apply)

  The original migration 20260524090000 exists as a file but the table
  was never created in the database, causing the stripe-webhook edge
  function to fail with a 500 on every Stripe event.

  1. New Tables
    - `stripe_webhook_events`
      - `event_id` (text, primary key) - Stripe event ID for idempotency
      - `event_type` (text) - e.g. checkout.session.completed
      - `processed_at` (timestamptz)
      - `details` (jsonb) - audit details after processing

  2. Security
    - RLS enabled, no public policies (service_role only)
*/

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  details jsonb
);

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_type_time
  ON public.stripe_webhook_events (event_type, processed_at DESC);
