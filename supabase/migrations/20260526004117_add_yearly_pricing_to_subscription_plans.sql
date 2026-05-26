/*
  # Add yearly pricing to subscription plans

  1. Modified Tables
    - `subscription_plans`
      - `price_yearly` (numeric(10,2), nullable) - yearly subscription price
      - `stripe_price_id_yearly` (text, nullable) - Stripe price ID for yearly billing

  2. Data Updates
    - Backfill yearly prices for paid plans (monthly x 10 = 2 months free)
    - Free/trial plans keep NULL yearly price

  3. Notes
    - NULL price_yearly means yearly billing is not available for that plan
    - Admins can configure yearly prices from the super admin panel
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscription_plans' AND column_name = 'price_yearly'
  ) THEN
    ALTER TABLE subscription_plans ADD COLUMN price_yearly numeric(10,2) DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscription_plans' AND column_name = 'stripe_price_id_yearly'
  ) THEN
    ALTER TABLE subscription_plans ADD COLUMN stripe_price_id_yearly text DEFAULT NULL;
  END IF;
END $$;

UPDATE subscription_plans
SET price_yearly = price_monthly * 10
WHERE price_monthly > 0 AND trial_days = 0 AND price_yearly IS NULL;
