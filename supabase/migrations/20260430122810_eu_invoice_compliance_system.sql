/*
  # EU-compliant invoice management system

  1. New tables
    - eu_countries: 27 EU member states with standard VAT, currency and
      VAT-prefix metadata used by validation and regime detection.
    - eu_vat_rates: per-country rates (standard/reduced/super_reduced/zero)
      so the UI dropdown stays in sync with current law and future changes.
    - acc_invoice_templates: company-owned templates (layout, primary
      color, footer text, default notes, default payment terms).
    - acc_invoice_sequences: monotonic invoice numbering per company and
      document type, required by EU Directive 2006/112/EC Art. 226.

  2. Changes to acc_invoices
    - reverse_charge, intra_community_supply, seller_vat_number,
      buyer_vat_number, place_of_supply, delivery_date,
      payment_terms_days, payment_reference, language_code,
      exchange_rate, base_currency_total, e_invoice_format, pdf_url,
      sent_at, email_recipients (text[]), template_id.

  3. Changes to acc_invoice_items
    - product_code, unit_code (UN/ECE Rec 20), vat_category
      (S/Z/E/AE/K/G/O), discount_amount.

  4. Security
    - RLS enabled on every new table.
    - eu_countries and eu_vat_rates: public lookup, readable by any
      authenticated user; write restricted to super_admin via the
      service role.
    - acc_invoice_templates and acc_invoice_sequences: company-scoped
      using auth.uid() -> profiles.company_id, matching existing
      accounting table policies.

  5. Seed data
    - All 27 EU countries with current (2026) standard VAT rates and
      VAT-prefix codes.
    - Standard VAT rates seeded into eu_vat_rates with valid_from set
      to 2024-01-01 as a baseline; rates can be superseded later.
*/

CREATE TABLE IF NOT EXISTS eu_countries (
  code text PRIMARY KEY,
  name text NOT NULL,
  vat_prefix text NOT NULL,
  standard_vat numeric(5,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'EUR',
  language text NOT NULL DEFAULT 'en',
  is_eu_member boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE eu_countries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read eu_countries"
  ON eu_countries FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS eu_vat_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text NOT NULL REFERENCES eu_countries(code) ON DELETE CASCADE,
  rate_type text NOT NULL,
  rate numeric(5,2) NOT NULL,
  label text DEFAULT '',
  valid_from date NOT NULL DEFAULT '2024-01-01',
  valid_to date,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT eu_vat_rates_type_check CHECK (rate_type IN ('standard','reduced','super_reduced','zero','parking'))
);

CREATE INDEX IF NOT EXISTS idx_eu_vat_rates_country ON eu_vat_rates (country_code);

ALTER TABLE eu_vat_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read eu_vat_rates"
  ON eu_vat_rates FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS acc_invoice_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Default',
  layout text NOT NULL DEFAULT 'modern',
  primary_color text NOT NULL DEFAULT '#0f766e',
  font_family text NOT NULL DEFAULT 'Inter',
  show_logo boolean NOT NULL DEFAULT true,
  show_bank_details boolean NOT NULL DEFAULT true,
  legal_footer_text text NOT NULL DEFAULT '',
  default_payment_terms int NOT NULL DEFAULT 14,
  default_notes text NOT NULL DEFAULT '',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT acc_invoice_templates_layout_check CHECK (layout IN ('modern','classic','minimal'))
);

CREATE INDEX IF NOT EXISTS idx_acc_invoice_templates_company ON acc_invoice_templates (company_id);

ALTER TABLE acc_invoice_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company users read own templates"
  ON acc_invoice_templates FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Company users insert own templates"
  ON acc_invoice_templates FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Company users update own templates"
  ON acc_invoice_templates FOR UPDATE TO authenticated
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Company users delete own templates"
  ON acc_invoice_templates FOR DELETE TO authenticated
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE TABLE IF NOT EXISTS acc_invoice_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  doc_type text NOT NULL DEFAULT 'invoice',
  prefix text NOT NULL DEFAULT 'INV-',
  year int NOT NULL DEFAULT extract(year from now())::int,
  current_number int NOT NULL DEFAULT 0,
  format_mask text NOT NULL DEFAULT '{prefix}{year}-{number:0000}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (company_id, doc_type, year)
);

ALTER TABLE acc_invoice_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company users read own sequences"
  ON acc_invoice_sequences FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Company users insert own sequences"
  ON acc_invoice_sequences FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Company users update own sequences"
  ON acc_invoice_sequences FOR UPDATE TO authenticated
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- Extend acc_invoices
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='acc_invoices' AND column_name='reverse_charge') THEN
    ALTER TABLE acc_invoices
      ADD COLUMN reverse_charge boolean NOT NULL DEFAULT false,
      ADD COLUMN intra_community_supply boolean NOT NULL DEFAULT false,
      ADD COLUMN seller_vat_number text DEFAULT '',
      ADD COLUMN buyer_vat_number text DEFAULT '',
      ADD COLUMN place_of_supply text DEFAULT '',
      ADD COLUMN delivery_date date,
      ADD COLUMN payment_terms_days int NOT NULL DEFAULT 14,
      ADD COLUMN payment_reference text DEFAULT '',
      ADD COLUMN language_code text NOT NULL DEFAULT 'en',
      ADD COLUMN exchange_rate numeric(12,6) NOT NULL DEFAULT 1,
      ADD COLUMN base_currency_total numeric(14,2) NOT NULL DEFAULT 0,
      ADD COLUMN e_invoice_format text DEFAULT '',
      ADD COLUMN pdf_url text DEFAULT '',
      ADD COLUMN sent_at timestamptz,
      ADD COLUMN email_recipients text[] DEFAULT '{}',
      ADD COLUMN template_id uuid REFERENCES acc_invoice_templates(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Extend acc_invoice_items
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='acc_invoice_items' AND column_name='unit_code') THEN
    ALTER TABLE acc_invoice_items
      ADD COLUMN product_code text DEFAULT '',
      ADD COLUMN unit_code text DEFAULT 'H87',
      ADD COLUMN vat_category text DEFAULT 'S',
      ADD COLUMN discount_amount numeric(12,2) NOT NULL DEFAULT 0;
  END IF;
END $$;

-- Seed eu_countries
INSERT INTO eu_countries (code, name, vat_prefix, standard_vat, currency, language) VALUES
  ('AT','Austria','ATU',20,'EUR','de'),
  ('BE','Belgium','BE',21,'EUR','fr'),
  ('BG','Bulgaria','BG',20,'BGN','en'),
  ('HR','Croatia','HR',25,'EUR','en'),
  ('CY','Cyprus','CY',19,'EUR','en'),
  ('CZ','Czech Republic','CZ',21,'CZK','en'),
  ('DK','Denmark','DK',25,'DKK','en'),
  ('EE','Estonia','EE',22,'EUR','en'),
  ('FI','Finland','FI',25.5,'EUR','en'),
  ('FR','France','FR',20,'EUR','fr'),
  ('DE','Germany','DE',19,'EUR','de'),
  ('GR','Greece','EL',24,'EUR','en'),
  ('HU','Hungary','HU',27,'HUF','en'),
  ('IE','Ireland','IE',23,'EUR','en'),
  ('IT','Italy','IT',22,'EUR','en'),
  ('LV','Latvia','LV',21,'EUR','en'),
  ('LT','Lithuania','LT',21,'EUR','en'),
  ('LU','Luxembourg','LU',17,'EUR','fr'),
  ('MT','Malta','MT',18,'EUR','en'),
  ('NL','Netherlands','NL',21,'EUR','en'),
  ('PL','Poland','PL',23,'PLN','en'),
  ('PT','Portugal','PT',23,'EUR','en'),
  ('RO','Romania','RO',19,'RON','en'),
  ('SK','Slovakia','SK',23,'EUR','en'),
  ('SI','Slovenia','SI',22,'EUR','en'),
  ('ES','Spain','ES',21,'EUR','en'),
  ('SE','Sweden','SE',25,'SEK','en')
ON CONFLICT (code) DO NOTHING;

-- Seed vat rates (standard per country)
INSERT INTO eu_vat_rates (country_code, rate_type, rate, label)
SELECT code, 'standard', standard_vat, 'Standard' FROM eu_countries
ON CONFLICT DO NOTHING;

-- Common reduced rates for major economies
INSERT INTO eu_vat_rates (country_code, rate_type, rate, label) VALUES
  ('DE','reduced',7,'Ermaessigt'),
  ('DE','zero',0,'Keine Steuer'),
  ('FR','reduced',10,'Taux intermediaire'),
  ('FR','reduced',5.5,'Taux reduit'),
  ('FR','super_reduced',2.1,'Taux particulier'),
  ('IT','reduced',10,'Ridotta'),
  ('IT','reduced',5,'Ridotta'),
  ('IT','super_reduced',4,'Super ridotta'),
  ('ES','reduced',10,'Reducido'),
  ('ES','super_reduced',4,'Superreducido'),
  ('NL','reduced',9,'Laag tarief'),
  ('BE','reduced',12,'Reduit'),
  ('BE','reduced',6,'Reduit'),
  ('AT','reduced',13,'Ermaessigt'),
  ('AT','reduced',10,'Ermaessigt'),
  ('PL','reduced',8,'Obnizona'),
  ('PL','reduced',5,'Obnizona'),
  ('SE','reduced',12,'Lag'),
  ('SE','reduced',6,'Lag'),
  ('IE','reduced',13.5,'Reduced'),
  ('IE','reduced',9,'Reduced'),
  ('PT','reduced',13,'Intermedia'),
  ('PT','reduced',6,'Reduzida')
ON CONFLICT DO NOTHING;
