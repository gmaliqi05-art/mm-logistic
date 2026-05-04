/*
  # Multi-Currency System

  1. New Tables
    - `exchange_rates` - daily EUR-base rates for supported currencies
  2. Modifications
    - Adds `exchange_rate_to_eur` numeric column to financial tables
      (`acc_transactions`, `acc_invoices`, `acc_purchases`, `acc_bank_statement_lines`)
  3. Security
    - `exchange_rates` is world-readable for authenticated users; only service role writes.
  4. Helpers
    - `get_rate_to_eur(currency, as_of)` returns latest rate on/before date
*/

CREATE TABLE IF NOT EXISTS exchange_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base_currency text NOT NULL DEFAULT 'EUR',
  quote_currency text NOT NULL,
  rate numeric(18,8) NOT NULL,
  valid_from date NOT NULL,
  source text NOT NULL DEFAULT 'ECB',
  created_at timestamptz DEFAULT now(),
  CONSTRAINT exchange_rates_unique UNIQUE (base_currency, quote_currency, valid_from)
);

CREATE INDEX IF NOT EXISTS idx_exchange_rates_lookup
  ON exchange_rates (quote_currency, valid_from DESC);

ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users read exchange rates"
  ON exchange_rates FOR SELECT TO authenticated
  USING (true);

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['acc_transactions','acc_invoices','acc_purchases','acc_bank_statement_lines']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = t AND column_name = 'exchange_rate_to_eur'
    ) THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN exchange_rate_to_eur numeric(18,8) DEFAULT 1', t);
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.get_rate_to_eur(p_currency text, p_as_of date)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN upper(p_currency) = 'EUR' THEN 1
    ELSE COALESCE(
      (SELECT 1 / rate
       FROM exchange_rates
       WHERE base_currency = 'EUR'
         AND quote_currency = upper(p_currency)
         AND valid_from <= p_as_of
       ORDER BY valid_from DESC
       LIMIT 1),
      1
    )
  END;
$$;

GRANT EXECUTE ON FUNCTION public.get_rate_to_eur(text, date) TO authenticated, service_role;

-- Seed minimal static rates so app is usable before first ECB pull
INSERT INTO exchange_rates (base_currency, quote_currency, rate, valid_from, source) VALUES
  ('EUR','USD', 1.08, CURRENT_DATE, 'seed'),
  ('EUR','CHF', 0.95, CURRENT_DATE, 'seed'),
  ('EUR','GBP', 0.85, CURRENT_DATE, 'seed'),
  ('EUR','ALL', 98.50, CURRENT_DATE, 'seed'),
  ('EUR','RSD', 117.00, CURRENT_DATE, 'seed'),
  ('EUR','BAM', 1.955, CURRENT_DATE, 'seed'),
  ('EUR','MKD', 61.50, CURRENT_DATE, 'seed'),
  ('EUR','RON', 4.97, CURRENT_DATE, 'seed'),
  ('EUR','BGN', 1.956, CURRENT_DATE, 'seed'),
  ('EUR','PLN', 4.30, CURRENT_DATE, 'seed')
ON CONFLICT (base_currency, quote_currency, valid_from) DO NOTHING;

-- Daily cron for ECB fetch (scheduled after publish time ~16:00 CET)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'fetch_ecb_rates_daily';

    PERFORM cron.schedule(
      'fetch_ecb_rates_daily',
      '0 16 * * 1-5',
      $cron$
      SELECT net.http_post(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1) || '/functions/v1/fetch-ecb-rates',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1),
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
      );
      $cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Vault may not contain secrets in this environment; skip cron setup silently.
  NULL;
END $$;
