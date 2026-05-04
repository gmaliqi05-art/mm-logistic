/*
  # E-invoicing, PEPPOL, DATEV and SAF-T metadata

  1. acc_invoices
    - `einvoice_format` text (xrechnung | zugferd | none) normalizes the existing e_invoice_format column.
    - `einvoice_xml_path` text - storage path of the generated XRechnung XML.
    - `einvoice_pdf_path` text - storage path of the generated ZUGFeRD PDF/A-3.
    - `einvoice_generated_at` timestamptz.
    - `einvoice_validation_status` text (pending | valid | invalid).
    - `einvoice_validation_errors` jsonb.

  2. companies & acc_contacts
    - `peppol_id` text, `peppol_scheme` text, `peppol_enabled` bool.
    - `datev_config` jsonb on companies (berater_nr, mandanten_nr, wj_beginn).
    - `saft_config` jsonb on companies (tax office, legal representative).
    - `datev_account_number` text on acc_contacts (for DATEV Debitor/Kreditor export).

  3. country_compliance_rules
    - Seed SAF-T entries for RO and PL so UI can branch on presence of the rule.

  4. Security
    - No policy changes. All columns are added to tables whose existing RLS already scopes
      access by company_id.
*/

-- acc_invoices einvoice columns
ALTER TABLE acc_invoices
  ADD COLUMN IF NOT EXISTS einvoice_format text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS einvoice_xml_path text,
  ADD COLUMN IF NOT EXISTS einvoice_pdf_path text,
  ADD COLUMN IF NOT EXISTS einvoice_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS einvoice_validation_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS einvoice_validation_errors jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'acc_invoices' AND column_name = 'einvoice_format'
      AND constraint_name = 'acc_invoices_einvoice_format_check'
  ) THEN
    BEGIN
      ALTER TABLE acc_invoices
        ADD CONSTRAINT acc_invoices_einvoice_format_check
        CHECK (einvoice_format IN ('none', 'xrechnung', 'zugferd'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_acc_invoices_einvoice_format
  ON acc_invoices (einvoice_format) WHERE einvoice_format <> 'none';

-- companies PEPPOL + DATEV + SAF-T config
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS peppol_id text,
  ADD COLUMN IF NOT EXISTS peppol_scheme text,
  ADD COLUMN IF NOT EXISTS peppol_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS datev_config jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS saft_config jsonb DEFAULT '{}'::jsonb;

-- acc_contacts PEPPOL + DATEV account number
ALTER TABLE acc_contacts
  ADD COLUMN IF NOT EXISTS peppol_id text,
  ADD COLUMN IF NOT EXISTS peppol_scheme text,
  ADD COLUMN IF NOT EXISTS datev_account_number text;

-- Seed country_compliance_rules for SAF-T if the table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'country_compliance_rules') THEN
    INSERT INTO country_compliance_rules (country_code, domain, rule_key, config)
    VALUES
      ('RO', 'invoicing', 'saft',
        jsonb_build_object('version', 'D.406', 'xsd_version', '2.4.8', 'mandatory_from', '2022-01-01')),
      ('PL', 'invoicing', 'saft',
        jsonb_build_object('version', 'JPK_V7M', 'xsd_version', '1-2E', 'mandatory_from', '2020-10-01'))
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
