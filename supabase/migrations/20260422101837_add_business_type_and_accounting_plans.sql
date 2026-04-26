/*
  # Add business type and accounting-only subscription plans

  1. Changes
    - Add `business_type` to `companies` (logistics/accounting/both)
    - Add `product_type` to `subscription_plans` (logistics/accounting)
    - Seed 3 accounting-only plans tailored for German SMEs
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'business_type'
  ) THEN
    ALTER TABLE companies ADD COLUMN business_type text NOT NULL DEFAULT 'logistics'
      CHECK (business_type IN ('logistics', 'accounting', 'both'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscription_plans' AND column_name = 'product_type'
  ) THEN
    ALTER TABLE subscription_plans ADD COLUMN product_type text NOT NULL DEFAULT 'logistics'
      CHECK (product_type IN ('logistics', 'accounting'));
  END IF;
END $$;

INSERT INTO subscription_plans (name, display_name, description, price_monthly, max_drivers, max_depots, features, trial_days, is_active, sort_order, product_type)
VALUES
  (
    'acc_free_trial',
    'Kontabilitet - Prove Falas',
    'Provoni dashboardin e kontabilitetit per 14 dite pa pagese',
    0, 0, 0,
    '["Fatura te pakufizuara (prova)","Deri ne 20 kontakte","Deri ne 50 produkte","Eksport PDF","Mbeshtetje baze"]'::jsonb,
    14, true, 10, 'accounting'
  ),
  (
    'acc_standard',
    'Kontabilitet - Standard',
    'Per bizneset e vogla dhe freelancer ne Gjermani',
    29, 0, 0,
    '["Fatura te pakufizuara","Kontakte te pakufizuar","Produkte te pakufizuar","Eksport PDF / Excel","XRechnung & ZUGFeRD","Eksport DATEV","Raport TVSH (UStVA)","Mbeshtetje email"]'::jsonb,
    0, true, 11, 'accounting'
  ),
  (
    'acc_premium',
    'Kontabilitet - Premium',
    'Per SME gjermane me kerkesa te avancuara',
    59, 0, 0,
    '["Gjithqka ne Standard","Bankkonto te shumefishta","Mahnwesen automatike","Raporte te avancuara","Shumeperdorues","Audit log GoBD","API DATEV Online","Mbeshtetje prioritare"]'::jsonb,
    0, true, 12, 'accounting'
  )
ON CONFLICT (name) DO NOTHING;
