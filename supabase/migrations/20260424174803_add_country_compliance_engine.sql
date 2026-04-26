/*
  # Country-driven compliance engine

  1. Changes
    - `companies.country_id` uuid referencing `countries(id)` (nullable, non-destructive)
    - New table `country_compliance_rules` with JSONB config keyed by (country_code, domain, rule_key)

  2. Domains
    - `accounting`  — chart of accounts, fiscal year, reporting standard
    - `tax`         — VAT rates, tax authority identifiers
    - `invoicing`   — mandatory fields, ID regex, currency
    - `logistics`   — driver limits, CMR/licensing requirements

  3. Security
    - RLS enabled
    - Rules readable by any authenticated user (reference data)
    - Only service_role can mutate
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='companies' AND column_name='country_id'
  ) THEN
    ALTER TABLE companies
      ADD COLUMN country_id uuid REFERENCES countries(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS companies_country_id_idx ON companies(country_id);
  END IF;
END $$;

UPDATE companies c
SET country_id = co.id
FROM countries co
WHERE c.country_id IS NULL
  AND c.country IS NOT NULL
  AND (upper(co.code) = upper(c.country) OR lower(co.name) = lower(c.country));

CREATE TABLE IF NOT EXISTS country_compliance_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text NOT NULL,
  domain text NOT NULL,
  rule_key text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text NOT NULL DEFAULT '',
  valid_from date NOT NULL DEFAULT CURRENT_DATE,
  valid_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS compliance_rules_uk
  ON country_compliance_rules (upper(country_code), domain, rule_key, valid_from);
CREATE INDEX IF NOT EXISTS compliance_rules_country_domain_idx
  ON country_compliance_rules (upper(country_code), domain);

ALTER TABLE country_compliance_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Compliance rules readable" ON country_compliance_rules;
CREATE POLICY "Compliance rules readable"
  ON country_compliance_rules FOR SELECT
  TO authenticated
  USING (true);

INSERT INTO country_compliance_rules (country_code, domain, rule_key, config, description) VALUES
  ('DE','accounting','chart_of_accounts','{"code":"SKR03","name":"SKR03","fallback":"SKR04"}','Standard German chart of accounts'),
  ('DE','accounting','fiscal_year','{"start_month":1,"standard":"HGB"}','Calendar fiscal year, HGB reporting'),
  ('DE','tax','vat_standard','{"rate":19}','Regelsteuersatz'),
  ('DE','tax','vat_reduced','{"rate":7}','Ermäßigter Steuersatz'),
  ('DE','tax','vat_id_regex','{"pattern":"^DE[0-9]{9}$","label":"USt-IdNr."}','German VAT ID format'),
  ('DE','tax','authority','{"name":"Finanzamt","exports":["DATEV","ELSTER","XRechnung"]}','Filing authority'),
  ('DE','invoicing','mandatory_fields','{"fields":["invoice_number","invoice_date","vat_number","tax_number","buyer_name","buyer_address","line_items","net","vat","total"],"law":"§14 UStG"}','Mandatory invoice fields'),
  ('DE','invoicing','currency','{"code":"EUR","symbol":"€"}','Default currency'),
  ('DE','logistics','driver_hours','{"daily_max":9,"weekly_max":56,"biweekly_max":90,"rest_daily_min":11,"law":"Fahrpersonalgesetz / VO (EG) 561/2006"}','Driving time limits'),
  ('DE','logistics','freight_license','{"required_above_tons":3.5,"law":"§3 GüKG"}','Cargo transport license'),
  ('DE','logistics','cmr_required','{"international":true,"domestic":false}','CMR for cross-border'),

  ('AT','accounting','chart_of_accounts','{"code":"EKR","name":"Einheitskontenrahmen"}','Austrian standard chart'),
  ('AT','tax','vat_standard','{"rate":20}','Normalsteuersatz'),
  ('AT','tax','vat_reduced','{"rate":10}','Ermäßigter Steuersatz'),
  ('AT','tax','vat_id_regex','{"pattern":"^ATU[0-9]{8}$","label":"UID-Nr."}','Austrian VAT ID'),
  ('AT','tax','authority','{"name":"Finanzamt Österreich","exports":["FinanzOnline"]}','Filing authority'),
  ('AT','invoicing','currency','{"code":"EUR","symbol":"€"}','Default currency'),
  ('AT','logistics','driver_hours','{"daily_max":9,"weekly_max":56,"biweekly_max":90,"rest_daily_min":11,"law":"AZG + VO (EG) 561/2006"}','Driving time limits'),

  ('CH','accounting','chart_of_accounts','{"code":"KMU","name":"Swiss KMU Kontenplan"}','Swiss SME chart'),
  ('CH','tax','vat_standard','{"rate":8.1}','MWST Normalsatz'),
  ('CH','tax','vat_reduced','{"rate":2.6}','MWST Reduzierter Satz'),
  ('CH','tax','vat_id_regex','{"pattern":"^CHE-[0-9]{3}\\.[0-9]{3}\\.[0-9]{3}$","label":"MWST-Nr."}','Swiss VAT ID'),
  ('CH','invoicing','currency','{"code":"CHF","symbol":"CHF"}','Default currency'),
  ('CH','logistics','driver_hours','{"daily_max":9,"weekly_max":48,"rest_daily_min":11,"law":"ARV1"}','Swiss driver limits'),

  ('AL','accounting','chart_of_accounts','{"code":"PKR","name":"Plani Kombetar i Llogarive"}','Albanian national chart'),
  ('AL','tax','vat_standard','{"rate":20}','TVSH standarde'),
  ('AL','tax','vat_reduced','{"rate":6}','TVSH e reduktuar (turizem)'),
  ('AL','tax','vat_id_regex','{"pattern":"^[JKLMNO][0-9]{8}[A-Z]$","label":"NIPT"}','Albanian NIPT'),
  ('AL','tax','authority','{"name":"Drejtoria e Pergjithshme e Tatimeve","exports":["e-Fatura"]}','Filing authority'),
  ('AL','invoicing','mandatory_fields','{"fields":["invoice_number","invoice_date","nipt","nuis_seller","buyer_name","buyer_nipt","line_items","net","vat","total"],"law":"Ligji 87/2019"}','Fushat e detyrueshme per fature'),
  ('AL','invoicing','currency','{"code":"ALL","symbol":"L"}','Default currency'),
  ('AL','logistics','driver_hours','{"daily_max":9,"weekly_max":56,"rest_daily_min":11,"law":"Ligji 8308/1998"}','Oret e shoferit'),

  ('XK','accounting','chart_of_accounts','{"code":"KOSCOA","name":"Plani i Llogarive i Kosoves"}','Kosovo chart'),
  ('XK','tax','vat_standard','{"rate":18}','TVSH standarde'),
  ('XK','tax','vat_reduced','{"rate":8}','TVSH e reduktuar'),
  ('XK','tax','vat_id_regex','{"pattern":"^[0-9]{9}$","label":"Numri Fiskal"}','Numri fiskal'),
  ('XK','tax','authority','{"name":"Administrata Tatimore e Kosoves","exports":["ATK-XML"]}','Filing authority'),
  ('XK','invoicing','currency','{"code":"EUR","symbol":"€"}','Default currency'),
  ('XK','logistics','driver_hours','{"daily_max":9,"weekly_max":56,"rest_daily_min":11,"law":"Ligji 2004/1"}','Oret e shoferit'),

  ('FR','tax','vat_standard','{"rate":20}','TVA standard'),
  ('FR','tax','vat_id_regex','{"pattern":"^FR[0-9A-Z]{2}[0-9]{9}$","label":"TVA intracommunautaire"}','French VAT ID'),
  ('FR','invoicing','currency','{"code":"EUR","symbol":"€"}','Default currency'),

  ('IT','tax','vat_standard','{"rate":22}','IVA ordinaria'),
  ('IT','tax','vat_id_regex','{"pattern":"^IT[0-9]{11}$","label":"Partita IVA"}','Italian VAT ID'),
  ('IT','invoicing','currency','{"code":"EUR","symbol":"€"}','Default currency'),

  ('NL','tax','vat_standard','{"rate":21}','BTW hoog'),
  ('NL','tax','vat_id_regex','{"pattern":"^NL[0-9]{9}B[0-9]{2}$","label":"BTW-nummer"}','Dutch VAT ID'),
  ('NL','invoicing','currency','{"code":"EUR","symbol":"€"}','Default currency'),

  ('BE','tax','vat_standard','{"rate":21}','BTW/TVA standaard'),
  ('BE','tax','vat_id_regex','{"pattern":"^BE0[0-9]{9}$","label":"BTW-nummer"}','Belgian VAT ID'),
  ('BE','invoicing','currency','{"code":"EUR","symbol":"€"}','Default currency'),

  ('MK','tax','vat_standard','{"rate":18}','DDV standardna'),
  ('MK','invoicing','currency','{"code":"MKD","symbol":"ден"}','Default currency'),

  ('RS','tax','vat_standard','{"rate":20}','PDV osnovna'),
  ('RS','invoicing','currency','{"code":"RSD","symbol":"дин"}','Default currency'),

  ('HR','tax','vat_standard','{"rate":25}','PDV opca'),
  ('HR','invoicing','currency','{"code":"EUR","symbol":"€"}','Default currency')
ON CONFLICT (upper(country_code), domain, rule_key, valid_from) DO NOTHING;
