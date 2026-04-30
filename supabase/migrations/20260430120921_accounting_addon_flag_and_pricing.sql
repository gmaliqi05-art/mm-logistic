/*
  # Accounting add-on flag and discounted pricing

  1. Changes to companies
    - accounting_enabled boolean default false
    - accounting_enabled_at timestamptz nullable

  2. Changes to subscription_plans
    - is_addon boolean default false
    - price_addon_monthly numeric(10,2) default 0 — price when bundled
      on top of an existing logistics plan (intended to be roughly half of
      price_monthly for the accounting add-on)

  3. Security
    - No new tables. Existing RLS on companies and subscription_plans is
      preserved; new columns inherit current policies.

  4. Notes
    - This migration only introduces the flag and pricing scaffolding.
      Nothing is enabled automatically; super admins or payment webhooks
      must set accounting_enabled = true once a company purchases the
      add-on.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name='companies' AND column_name='accounting_enabled') THEN
    ALTER TABLE companies
      ADD COLUMN accounting_enabled boolean NOT NULL DEFAULT false,
      ADD COLUMN accounting_enabled_at timestamptz;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name='subscription_plans' AND column_name='is_addon') THEN
    ALTER TABLE subscription_plans
      ADD COLUMN is_addon boolean NOT NULL DEFAULT false,
      ADD COLUMN price_addon_monthly numeric(10,2) NOT NULL DEFAULT 0;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_companies_accounting_enabled
  ON companies (accounting_enabled)
  WHERE accounting_enabled = true;
