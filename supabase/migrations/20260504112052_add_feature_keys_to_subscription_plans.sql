/*
  # Add programmatic feature keys to subscription_plans

  1. Changes
    - Adds `feature_keys` (jsonb, default '[]') to subscription_plans. This stores
      machine-readable feature slugs such as "audit_log", "export_pdf", "stock_alerts"
      that the SubscriptionContext uses to gate UI capabilities.
    - The existing `features` (text[]/jsonb of display strings) is kept for marketing
      copy in the plan picker.

  2. Seed
    - Populates feature_keys for the three logistics plans (free_trial, standard,
      premium) using the same sets that were previously hard-coded in
      src/contexts/SubscriptionContext.tsx.

  3. Notes
    - Accounting plans keep an empty feature_keys array; their gating runs through
      product-type checks rather than per-feature flags.
*/

ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS feature_keys jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE subscription_plans
SET feature_keys = '["basic_reports"]'::jsonb
WHERE name = 'free_trial';

UPDATE subscription_plans
SET feature_keys = '["documents_signing","basic_reports","categories","export_pdf"]'::jsonb
WHERE name = 'standard';

UPDATE subscription_plans
SET feature_keys = '["documents_signing","basic_reports","categories","advanced_reports","export_pdf","export_excel","audit_log","bulk_operations","stock_alerts","data_export"]'::jsonb
WHERE name = 'premium';
