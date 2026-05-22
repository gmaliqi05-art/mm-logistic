/*
  # Seed missing tax-authority rules + unique index

  Adds `accounting/authority` rules for countries that were missing from
  the initial seed (FR/NL/BE/IT/CH/HR/RS/BA/MK/ME plus Nordics and PT).
  Without these, the ComplianceHealthCard shows no export badges and the
  Financials page falls back to a generic label even when the chart of
  accounts and VAT rates are correctly seeded.

  Also adds a unique index on (country_code, domain, rule_key) so future
  seed migrations can use ON CONFLICT.
*/

INSERT INTO public.country_compliance_rules (country_code, domain, rule_key, config, description)
SELECT v.country_code, 'accounting', 'authority', v.config::jsonb, v.descr
FROM (VALUES
  ('FR', '{"name": "Direction Generale des Finances Publiques (DGFiP)", "exports": ["FEC", "CA3", "Factur-X"]}', 'French tax authority'),
  ('NL', '{"name": "Belastingdienst", "exports": ["BTW-aangifte", "XAF", "ICP"]}', 'Dutch tax authority'),
  ('BE', '{"name": "SPF Finances / FOD Financien", "exports": ["INTERVAT", "UBL Peppol"]}', 'Belgian tax authority'),
  ('IT', '{"name": "Agenzia delle Entrate", "exports": ["FatturaPA", "LIPE", "Esterometro"]}', 'Italian tax authority'),
  ('CH', '{"name": "Eidg. Steuerverwaltung (ESTV)", "exports": ["MWST-Abrechnung"]}', 'Swiss federal tax authority'),
  ('HR', '{"name": "Porezna uprava", "exports": ["e-Racun", "JOPPD"]}', 'Croatian tax authority'),
  ('RS', '{"name": "Poreska uprava Republike Srbije", "exports": ["SEF", "POPDV"]}', 'Serbian tax authority'),
  ('BA', '{"name": "Uprava za indirektno oporezivanje (UIO/ITA)", "exports": ["PDV obrazac"]}', 'BiH tax authority'),
  ('MK', '{"name": "UJP (Uprava za javni prihodi)", "exports": ["DDV-04"]}', 'North Macedonia tax authority'),
  ('ME', '{"name": "Uprava prihoda i carina", "exports": ["PDV-3", "IOSI"]}', 'Montenegro tax authority'),
  ('DK', '{"name": "Skattestyrelsen", "exports": ["SAF-T DK", "OIOUBL"]}', 'Danish tax authority'),
  ('SE', '{"name": "Skatteverket", "exports": ["SAF-T SE", "Svefaktura"]}', 'Swedish tax authority'),
  ('NO', '{"name": "Skatteetaten", "exports": ["SAF-T NO", "EHF"]}', 'Norwegian tax authority'),
  ('FI', '{"name": "Vero / Skatteforvaltningen", "exports": ["ALV-ilmoitus", "Finvoice"]}', 'Finnish tax authority'),
  ('PT', '{"name": "Autoridade Tributaria e Aduaneira (AT)", "exports": ["SAF-T PT", "e-Fatura"]}', 'Portuguese tax authority')
) AS v(country_code, config, descr)
WHERE NOT EXISTS (
  SELECT 1 FROM public.country_compliance_rules r
  WHERE r.country_code = v.country_code
    AND r.domain = 'accounting'
    AND r.rule_key = 'authority'
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ccr_country_domain_rule
  ON public.country_compliance_rules (country_code, domain, rule_key);
