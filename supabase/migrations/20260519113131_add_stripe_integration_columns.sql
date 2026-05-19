/*
  # Add Stripe Integration Columns

  1. Modified Tables
    - `subscription_plans`: Added `stripe_price_id` for linking plans to Stripe Price objects
    - `company_subscriptions`: Added `payment_method` to track how the subscription was paid

  2. New Table
    - `subscription_checkout_sessions`: Tracks pending Stripe checkout sessions

  3. Important Notes
    - stripe_price_id is nullable (free plans won't have one)
    - payment_method defaults to 'free' for trials
    - checkout_sessions table allows tracking in-progress payments
*/

-- Add stripe_price_id to subscription_plans
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscription_plans' AND column_name = 'stripe_price_id'
  ) THEN
    ALTER TABLE subscription_plans ADD COLUMN stripe_price_id text DEFAULT NULL;
  END IF;
END $$;

-- Add payment_method to company_subscriptions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_subscriptions' AND column_name = 'payment_method'
  ) THEN
    ALTER TABLE company_subscriptions ADD COLUMN payment_method text DEFAULT 'free';
  END IF;
END $$;

-- Create checkout sessions table for tracking pending payments
CREATE TABLE IF NOT EXISTS subscription_checkout_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  plan_id uuid NOT NULL REFERENCES subscription_plans(id),
  stripe_session_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  is_upgrade boolean DEFAULT false,
  is_addon boolean DEFAULT false,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz DEFAULT NULL
);

ALTER TABLE subscription_checkout_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins can view own checkout sessions"
  ON subscription_checkout_sessions FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Company admins can insert checkout sessions"
  ON subscription_checkout_sessions FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Index for quick lookup by stripe session id
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_stripe_id
  ON subscription_checkout_sessions(stripe_session_id);

CREATE INDEX IF NOT EXISTS idx_checkout_sessions_company
  ON subscription_checkout_sessions(company_id);
