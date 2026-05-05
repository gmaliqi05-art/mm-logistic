/*
  # Country-aware expansion v3 (fixed ON CONFLICT for compliance rules)

  Uses INSERT ... SELECT ... WHERE NOT EXISTS to avoid ON CONFLICT on
  expression index for country_compliance_rules.
*/

ALTER TABLE eu_countries ALTER COLUMN vat_prefix DROP NOT NULL;

INSERT INTO eu_countries (code, name, vat_prefix, standard_vat, currency, language, is_eu_member) VALUES
  ('AL','Albania',NULL,20.00,'ALL','sq',false),
  ('XK','Kosovo',NULL,18.00,'EUR','sq',false),
  ('CH','Switzerland','CHE',8.10,'CHF','de',false),
  ('RS','Serbia',NULL,20.00,'RSD','sr',false),
  ('MK','North Macedonia',NULL,18.00,'MKD','mk',false),
  ('BA','Bosnia and Herzegovina',NULL,17.00,'BAM','bs',false),
  ('ME','Montenegro',NULL,21.00,'EUR','sr',false)
ON CONFLICT (code) DO NOTHING;

INSERT INTO eu_vat_rates (country_code, rate_type, rate, label, valid_from)
SELECT * FROM (VALUES
  ('AL','standard',20.00,'20%','2020-01-01'::date),
  ('AL','reduced',6.00,'6%','2020-01-01'::date),
  ('AL','zero',0.00,'0%','2020-01-01'::date),
  ('XK','standard',18.00,'18%','2020-01-01'::date),
  ('XK','reduced',8.00,'8%','2020-01-01'::date),
  ('XK','zero',0.00,'0%','2020-01-01'::date),
  ('CH','standard',8.10,'8.1%','2024-01-01'::date),
  ('CH','reduced',2.60,'2.6%','2024-01-01'::date),
  ('CH','reduced',3.80,'3.8%','2024-01-01'::date),
  ('CH','zero',0.00,'0%','2024-01-01'::date),
  ('RS','standard',20.00,'20%','2020-01-01'::date),
  ('RS','reduced',10.00,'10%','2020-01-01'::date),
  ('RS','zero',0.00,'0%','2020-01-01'::date),
  ('MK','standard',18.00,'18%','2020-01-01'::date),
  ('MK','reduced',5.00,'5%','2020-01-01'::date),
  ('MK','zero',0.00,'0%','2020-01-01'::date),
  ('BA','standard',17.00,'17%','2020-01-01'::date),
  ('BA','zero',0.00,'0%','2020-01-01'::date),
  ('ME','standard',21.00,'21%','2024-01-01'::date),
  ('ME','reduced',7.00,'7%','2024-01-01'::date),
  ('ME','zero',0.00,'0%','2024-01-01'::date),
  ('BG','reduced',9.00,'9%','2020-01-01'::date),
  ('BG','zero',0.00,'0%','2020-01-01'::date),
  ('CZ','reduced',12.00,'12%','2024-01-01'::date),
  ('CZ','zero',0.00,'0%','2024-01-01'::date),
  ('DK','zero',0.00,'0%','2020-01-01'::date),
  ('EE','reduced',9.00,'9%','2024-01-01'::date),
  ('EE','zero',0.00,'0%','2020-01-01'::date),
  ('GR','reduced',13.00,'13%','2020-01-01'::date),
  ('GR','reduced',6.00,'6%','2020-01-01'::date),
  ('GR','zero',0.00,'0%','2020-01-01'::date),
  ('HR','reduced',13.00,'13%','2020-01-01'::date),
  ('HR','reduced',5.00,'5%','2020-01-01'::date),
  ('HR','zero',0.00,'0%','2020-01-01'::date),
  ('HU','reduced',18.00,'18%','2020-01-01'::date),
  ('HU','reduced',5.00,'5%','2020-01-01'::date),
  ('HU','zero',0.00,'0%','2020-01-01'::date),
  ('LT','reduced',9.00,'9%','2020-01-01'::date),
  ('LT','reduced',5.00,'5%','2020-01-01'::date),
  ('LT','zero',0.00,'0%','2020-01-01'::date),
  ('RO','reduced',9.00,'9%','2020-01-01'::date),
  ('RO','reduced',5.00,'5%','2020-01-01'::date),
  ('RO','zero',0.00,'0%','2020-01-01'::date),
  ('SI','reduced',9.50,'9.5%','2020-01-01'::date),
  ('SI','reduced',5.00,'5%','2020-01-01'::date),
  ('SI','zero',0.00,'0%','2020-01-01'::date),
  ('SK','reduced',19.00,'19%','2025-01-01'::date),
  ('SK','reduced',5.00,'5%','2025-01-01'::date),
  ('SK','zero',0.00,'0%','2020-01-01'::date)
) AS v(country_code, rate_type, rate, label, valid_from)
WHERE NOT EXISTS (
  SELECT 1 FROM eu_vat_rates e
  WHERE e.country_code = v.country_code
    AND e.rate_type = v.rate_type
    AND e.rate = v.rate
    AND e.valid_from = v.valid_from
);

CREATE TABLE IF NOT EXISTS country_fleet_compliance_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text NOT NULL,
  type_key text NOT NULL,
  category text NOT NULL CHECK (category IN ('vehicle','driver')),
  label_sq text NOT NULL DEFAULT '',
  label_en text NOT NULL DEFAULT '',
  label_de text NOT NULL DEFAULT '',
  label_fr text NOT NULL DEFAULT '',
  is_mandatory boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS country_fleet_compliance_types_unique
  ON country_fleet_compliance_types (country_code, type_key, category);

CREATE INDEX IF NOT EXISTS country_fleet_compliance_types_country_idx
  ON country_fleet_compliance_types (country_code, category, sort_order);

ALTER TABLE country_fleet_compliance_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fleet compliance types read" ON country_fleet_compliance_types;
CREATE POLICY "fleet compliance types read"
  ON country_fleet_compliance_types FOR SELECT
  TO authenticated
  USING (true);

INSERT INTO country_fleet_compliance_types
  (country_code, type_key, category, label_sq, label_en, label_de, label_fr, is_mandatory, sort_order)
VALUES
  ('DE','hu_tuv','vehicle','HU/TÜV','Periodic Technical Inspection','HU/TÜV','Contrôle technique',true,10),
  ('DE','au','vehicle','AU','Emissions Test','AU','Contrôle des émissions',true,20),
  ('DE','sp','vehicle','SP','Safety Inspection','SP','Inspection de sécurité',true,30),
  ('DE','tacho','vehicle','Kalibrimi i tachografit','Tachograph Calibration','Tacho-Kalibrierung','Étalonnage tachygraphe',true,40),
  ('DE','haftpflicht','vehicle','Sigurimi i detyrueshëm','Liability Insurance','Haftpflicht','Assurance RC',true,50),
  ('DE','vollkasko','vehicle','Kasko e plotë','Comprehensive Insurance','Vollkasko','Assurance tous risques',false,60),
  ('DE','teilkasko','vehicle','Kasko e pjesshme','Partial Insurance','Teilkasko','Assurance partielle',false,70),
  ('DE','kfz_steuer','vehicle','Taksa e automjetit','Vehicle Tax','Kfz-Steuer','Taxe véhicule',true,80),
  ('DE','license','driver','Leje drejtimi','Driver License','Führerschein','Permis de conduire',true,10),
  ('DE','kod95','driver','Kodi 95 (BKrFQG)','Driver CPC (Code 95)','Code 95 (BKrFQG)','Code 95 (FIMO/FCO)',true,20),
  ('DE','fahrerkarte','driver','Karta e shoferit','Driver Card','Fahrerkarte','Carte conducteur',true,30),
  ('DE','adr','driver','ADR','ADR','ADR','ADR',false,40),
  ('DE','g25','driver','Ekzaminimi G25','G25 Medical','G25-Untersuchung','Examen médical G25',true,50),
  ('DE','erste_hilfe','driver','Ndihma e parë','First Aid','Erste Hilfe','Premiers secours',false,60),
  ('IT','revisione','vehicle','Revisione','Technical Inspection','Revisione','Contrôle technique',true,10),
  ('IT','bollo','vehicle','Bollo auto','Road Tax','Bollo','Taxe de circulation',true,20),
  ('IT','rc_auto','vehicle','RC Auto','Mandatory Liability','RC-Versicherung','Assurance RC auto',true,30),
  ('IT','kasko','vehicle','Kasko','Comprehensive','Kasko','Tous risques',false,40),
  ('IT','cronotachigrafo','vehicle','Kalibrimi i tachografit','Tachograph Calibration','Tacho-Kalibrierung','Étalonnage chrono',true,50),
  ('IT','patente','driver','Patente C/CE/D','Licence C/CE/D','Führerschein C/CE/D','Permis C/CE/D',true,10),
  ('IT','cqc','driver','CQC','Driver CPC','CQC (Code 95)','FIMO/FCO',true,20),
  ('IT','adr','driver','ADR','ADR','ADR','ADR',false,30),
  ('IT','carta_tachigrafica','driver','Karta e shoferit','Driver Card','Fahrerkarte','Carte conducteur',true,40),
  ('FR','controle_technique','vehicle','Contrôle technique','Technical Inspection','HU','Contrôle technique',true,10),
  ('FR','assurance','vehicle','Sigurimi i detyrueshëm','Liability Insurance','Haftpflicht','Assurance',true,20),
  ('FR','carte_grise','vehicle','Carte grise','Registration','Zulassung','Carte grise',true,30),
  ('FR','chronotachygraphe','vehicle','Kalibrimi i tachografit','Tachograph','Tacho','Chronotachygraphe',true,40),
  ('FR','permis','driver','Permis C/CE','Licence C/CE','Führerschein C/CE','Permis C/CE',true,10),
  ('FR','fimo','driver','FIMO/FCO','Driver CPC','BKF/Code 95','FIMO/FCO',true,20),
  ('FR','adr','driver','ADR','ADR','ADR','ADR',false,30),
  ('FR','carte_conducteur','driver','Karta e shoferit','Driver Card','Fahrerkarte','Carte conducteur',true,40),
  ('AT','begutachtung','vehicle','§57a Begutachtung','Technical Inspection','§57a Pickerl','Contrôle technique',true,10),
  ('AT','haftpflicht','vehicle','Haftpflicht','Liability','Haftpflicht','Assurance RC',true,20),
  ('AT','kasko','vehicle','Kasko','Kasko','Kasko','Tous risques',false,30),
  ('AT','kfz_steuer','vehicle','Taksa e automjetit','Vehicle Tax','KFZ-Steuer','Taxe véhicule',true,40),
  ('AT','fuhrerschein','driver','Leje drejtimi C/CE','Licence C/CE','Führerschein C/CE','Permis C/CE',true,10),
  ('AT','c95','driver','Kodi 95','Driver CPC','C95','Code 95',true,20),
  ('AT','adr','driver','ADR','ADR','ADR','ADR',false,30),
  ('AT','fahrerkarte','driver','Karta e shoferit','Driver Card','Fahrerkarte','Carte conducteur',true,40),
  ('CH','mfk','vehicle','MFK','Periodic Inspection','MFK','Contrôle technique',true,10),
  ('CH','vignette','vehicle','Vinjeta','Vignette','Vignette','Vignette',true,20),
  ('CH','haftpflicht','vehicle','Haftpflicht','Liability','Haftpflicht','RC',true,30),
  ('CH','kasko','vehicle','Kasko','Kasko','Kasko','Casco',false,40),
  ('CH','permis','driver','Permis C/CE','Licence C/CE','Führerschein C/CE','Permis C/CE',true,10),
  ('CH','oacp','driver','OACP','OACP (CPC)','OACP (Code 95)','OACP (Code 95)',true,20),
  ('CH','adr','driver','ADR/SDR','ADR','ADR/SDR','ADR/SDR',false,30),
  ('NL','apk','vehicle','APK','APK','APK','APK',true,10),
  ('NL','wa','vehicle','WA-verzekering','Liability','Haftpflicht','Assurance RC',true,20),
  ('NL','wegenbelasting','vehicle','Taksa e automjetit','Road Tax','Kfz-Steuer','Taxe',true,30),
  ('NL','rijbewijs','driver','Rijbewijs C/CE','Licence C/CE','Führerschein','Permis',true,10),
  ('NL','code95','driver','Code 95','Driver CPC','Code 95','Code 95',true,20),
  ('NL','adr','driver','ADR','ADR','ADR','ADR',false,30),
  ('BE','controle_technique','vehicle','Contrôle technique','Inspection','HU','Contrôle technique',true,10),
  ('BE','assurance','vehicle','RC','Liability','Haftpflicht','Assurance RC',true,20),
  ('BE','permis','driver','Permis C/CE','Licence C/CE','Führerschein','Permis',true,10),
  ('BE','code95','driver','Code 95','Driver CPC','Code 95','Code 95',true,20),
  ('BE','adr','driver','ADR','ADR','ADR','ADR',false,30),
  ('AL','kontrolli_teknik','vehicle','Kontrolli teknik','Technical Inspection','Technische Kontrolle','Contrôle technique',true,10),
  ('AL','sigurimi','vehicle','Sigurimi i detyrueshëm','Mandatory Liability','Haftpflicht','Assurance RC',true,20),
  ('AL','kasko','vehicle','Kasko','Comprehensive','Kasko','Casco',false,30),
  ('AL','leje_drejtimi','driver','Lejedrejtimi C/D','Licence C/D','Führerschein C/D','Permis C/D',true,10),
  ('AL','adr','driver','ADR','ADR','ADR','ADR',false,20),
  ('AL','certifikate_profesionale','driver','Certifikata profesionale','Professional Certificate','BKF-Nachweis','Certificat professionnel',true,30),
  ('XK','kontrolli_teknik','vehicle','Kontrolli teknik','Technical Inspection','Technische Kontrolle','Contrôle technique',true,10),
  ('XK','sigurimi','vehicle','Sigurimi i detyrueshëm','Mandatory Insurance','Haftpflicht','Assurance',true,20),
  ('XK','patenta','driver','Patenta C/D','Licence C/D','Führerschein C/D','Permis C/D',true,10),
  ('XK','adr','driver','ADR','ADR','ADR','ADR',false,20),
  ('HR','tehnicki_pregled','vehicle','Tehnicki pregled','Technical Inspection','HU','Contrôle technique',true,10),
  ('HR','osiguranje','vehicle','Obvezno osiguranje','Liability','Haftpflicht','Assurance RC',true,20),
  ('HR','vozacka','driver','Vozacka C/CE','Licence C/CE','Führerschein','Permis',true,10),
  ('HR','code95','driver','Kod 95','Driver CPC','Code 95','Code 95',true,20),
  ('HR','adr','driver','ADR','ADR','ADR','ADR',false,30),
  ('RS','tehnicki_pregled','vehicle','Tehnicki pregled','Technical Inspection','HU','Contrôle technique',true,10),
  ('RS','osiguranje','vehicle','Obavezno osiguranje','Liability','Haftpflicht','Assurance',true,20),
  ('RS','vozacka','driver','Vozacka C/CE','Licence C/CE','Führerschein','Permis',true,10),
  ('RS','cpc','driver','CPC/Kod 95','Driver CPC','Code 95','Code 95',true,20),
  ('RS','adr','driver','ADR','ADR','ADR','ADR',false,30),
  ('MK','tehnicki_pregled','vehicle','Tehnicki pregled','Technical Inspection','HU','Contrôle technique',true,10),
  ('MK','osiguruvanje','vehicle','Zadolzitelno osiguruvanje','Liability','Haftpflicht','Assurance',true,20),
  ('MK','vozacka','driver','Vozacka C/D','Licence C/D','Führerschein','Permis',true,10),
  ('MK','adr','driver','ADR','ADR','ADR','ADR',false,20),
  ('BG','gtp','vehicle','GTP','Technical Inspection','HU','Contrôle technique',true,10),
  ('BG','grazhdanska','vehicle','Grazhdanska otgovornost','Liability','Haftpflicht','Assurance',true,20),
  ('BG','svid','driver','Shofyorska knizhka C/CE','Licence C/CE','Führerschein','Permis',true,10),
  ('BG','kod95','driver','Kod 95','Code 95','Code 95','Code 95',true,20),
  ('BG','adr','driver','ADR','ADR','ADR','ADR',false,30),
  ('RO','itp','vehicle','ITP','Technical Inspection','HU','Contrôle technique',true,10),
  ('RO','rca','vehicle','RCA','Liability','Haftpflicht','Assurance RC',true,20),
  ('RO','rovinieta','vehicle','Rovinieta','Road Tax','Vignette','Vignette',true,30),
  ('RO','permis','driver','Permis C/CE','Licence C/CE','Führerschein','Permis',true,10),
  ('RO','atestat','driver','Atestat profesional','Driver CPC','Code 95','Code 95',true,20),
  ('RO','adr','driver','ADR','ADR','ADR','ADR',false,30),
  ('SI','tehnicni_pregled','vehicle','Tehnicni pregled','Technical Inspection','HU','Contrôle technique',true,10),
  ('SI','zavarovanje','vehicle','Obvezno zavarovanje','Liability','Haftpflicht','Assurance',true,20),
  ('SI','vozniski','driver','Vozniski izpit C/CE','Licence C/CE','Führerschein','Permis',true,10),
  ('SI','koda95','driver','Koda 95','Code 95','Code 95','Code 95',true,20),
  ('SI','adr','driver','ADR','ADR','ADR','ADR',false,30),
  ('GR','kteo','vehicle','KTEO','Technical Inspection','HU','Contrôle technique',true,10),
  ('GR','asfalisi','vehicle','Asfalisi','Liability','Haftpflicht','Assurance',true,20),
  ('GR','telos','vehicle','Teli kykloforias','Road Tax','Kfz-Steuer','Taxe',true,30),
  ('GR','adeia','driver','Adeia C/CE','Licence C/CE','Führerschein','Permis',true,10),
  ('GR','pei','driver','PEI','Driver CPC','Code 95','Code 95',true,20),
  ('GR','adr','driver','ADR','ADR','ADR','ADR',false,30),
  ('CZ','stk','vehicle','STK','Technical Inspection','HU','Contrôle technique',true,10),
  ('CZ','pov','vehicle','Povinne ruceni','Liability','Haftpflicht','Assurance',true,20),
  ('CZ','ridicak','driver','Ridicsky prukaz C/CE','Licence C/CE','Führerschein','Permis',true,10),
  ('CZ','profesni','driver','Profesni zpusobilost','Driver CPC','Code 95','Code 95',true,20),
  ('CZ','adr','driver','ADR','ADR','ADR','ADR',false,30),
  ('SK','stk','vehicle','STK','Technical Inspection','HU','Contrôle technique',true,10),
  ('SK','pzp','vehicle','PZP','Liability','Haftpflicht','Assurance',true,20),
  ('SK','vp','driver','Vodicsky preukaz C/CE','Licence C/CE','Führerschein','Permis',true,10),
  ('SK','kkv','driver','KKV','Driver CPC','Code 95','Code 95',true,20),
  ('SK','adr','driver','ADR','ADR','ADR','ADR',false,30),
  ('HU','muszaki','vehicle','Muszaki vizsga','Technical Inspection','HU','Contrôle technique',true,10),
  ('HU','kgfb','vehicle','KGFB','Liability','Haftpflicht','Assurance',true,20),
  ('HU','jogositvany','driver','Jogositvany C/CE','Licence C/CE','Führerschein','Permis',true,10),
  ('HU','gka','driver','GKI','Driver CPC','Code 95','Code 95',true,20),
  ('HU','adr','driver','ADR','ADR','ADR','ADR',false,30),
  ('PL','przeglad','vehicle','Przeglad techniczny','Technical Inspection','HU','Contrôle technique',true,10),
  ('PL','oc','vehicle','OC','Liability','Haftpflicht','Assurance',true,20),
  ('PL','prawojazdy','driver','Prawo jazdy C/CE','Licence C/CE','Führerschein','Permis',true,10),
  ('PL','kod95','driver','Kod 95','Code 95','Code 95','Code 95',true,20),
  ('PL','adr','driver','ADR','ADR','ADR','ADR',false,30),
  ('ES','itv','vehicle','ITV','Technical Inspection','HU','Contrôle technique',true,10),
  ('ES','seguro','vehicle','Seguro obligatorio','Liability','Haftpflicht','Assurance',true,20),
  ('ES','permiso','driver','Permiso C/CE','Licence C/CE','Führerschein','Permis',true,10),
  ('ES','cap','driver','CAP','Driver CPC','Code 95','Code 95',true,20),
  ('ES','adr','driver','ADR','ADR','ADR','ADR',false,30)
ON CONFLICT (country_code, type_key, category) DO NOTHING;

INSERT INTO country_compliance_rules (country_code, domain, rule_key, config, description)
SELECT * FROM (VALUES
  ('ES','accounting','chart_of_accounts','{"code":"PGC","name":"Plan General de Contabilidad"}'::jsonb,'Spanish chart of accounts'),
  ('ES','tax','authority','{"name":"Agencia Tributaria (AEAT)","exports":["SII","MODELO-303","MODELO-390"]}'::jsonb,'Spanish tax authority'),
  ('ES','tax','vat_standard','{"rate":21}'::jsonb,'Standard VAT'),
  ('ES','tax','vat_reduced','{"rate":10}'::jsonb,'Reduced VAT'),
  ('ES','invoicing','currency','{"code":"EUR","symbol":"€"}'::jsonb,'Currency'),
  ('PL','accounting','chart_of_accounts','{"code":"WPK","name":"Wzorcowy Plan Kont"}'::jsonb,'Polish chart of accounts'),
  ('PL','tax','authority','{"name":"Krajowa Administracja Skarbowa","exports":["JPK_V7","JPK_VAT","JPK_KR"]}'::jsonb,'Polish tax authority'),
  ('PL','tax','vat_standard','{"rate":23}'::jsonb,'Standard VAT'),
  ('PL','tax','vat_reduced','{"rate":8}'::jsonb,'Reduced VAT'),
  ('PL','invoicing','currency','{"code":"PLN","symbol":"zl"}'::jsonb,'Currency'),
  ('BG','accounting','chart_of_accounts','{"code":"NSS","name":"Natsionalen smetkoplan"}'::jsonb,'Bulgarian chart of accounts'),
  ('BG','tax','authority','{"name":"NRA","exports":["SAF-T BG","DDS"]}'::jsonb,'Bulgarian tax authority'),
  ('BG','tax','vat_standard','{"rate":20}'::jsonb,'Standard VAT'),
  ('BG','tax','vat_reduced','{"rate":9}'::jsonb,'Reduced VAT'),
  ('BG','invoicing','currency','{"code":"BGN","symbol":"lv"}'::jsonb,'Currency'),
  ('RO','accounting','chart_of_accounts','{"code":"PCG-RO","name":"Planul de Conturi General"}'::jsonb,'Romanian chart of accounts'),
  ('RO','tax','authority','{"name":"ANAF","exports":["D394","SAF-T","E-FACTURA"]}'::jsonb,'Romanian tax authority'),
  ('RO','tax','vat_standard','{"rate":19}'::jsonb,'Standard VAT'),
  ('RO','tax','vat_reduced','{"rate":9}'::jsonb,'Reduced VAT'),
  ('RO','invoicing','currency','{"code":"RON","symbol":"lei"}'::jsonb,'Currency'),
  ('SI','accounting','chart_of_accounts','{"code":"SKR-SI","name":"Kontni nacrt"}'::jsonb,'Slovenian chart of accounts'),
  ('SI','tax','authority','{"name":"FURS","exports":["DDV-O","eSlog"]}'::jsonb,'Slovenian tax authority'),
  ('SI','tax','vat_standard','{"rate":22}'::jsonb,'Standard VAT'),
  ('SI','tax','vat_reduced','{"rate":9.5}'::jsonb,'Reduced VAT'),
  ('SI','invoicing','currency','{"code":"EUR","symbol":"€"}'::jsonb,'Currency'),
  ('GR','accounting','chart_of_accounts','{"code":"EGLS","name":"Elliniko Geniko Logistiko Schedio"}'::jsonb,'Greek chart of accounts'),
  ('GR','tax','authority','{"name":"AADE","exports":["MyDATA","FPA"]}'::jsonb,'Greek tax authority'),
  ('GR','tax','vat_standard','{"rate":24}'::jsonb,'Standard VAT'),
  ('GR','tax','vat_reduced','{"rate":13}'::jsonb,'Reduced VAT'),
  ('GR','invoicing','currency','{"code":"EUR","symbol":"€"}'::jsonb,'Currency'),
  ('CZ','accounting','chart_of_accounts','{"code":"UOS","name":"Uctova osnova"}'::jsonb,'Czech chart of accounts'),
  ('CZ','tax','authority','{"name":"Financni sprava","exports":["KH-DPH","ISDOC"]}'::jsonb,'Czech tax authority'),
  ('CZ','tax','vat_standard','{"rate":21}'::jsonb,'Standard VAT'),
  ('CZ','tax','vat_reduced','{"rate":12}'::jsonb,'Reduced VAT'),
  ('CZ','invoicing','currency','{"code":"CZK","symbol":"Kc"}'::jsonb,'Currency'),
  ('SK','accounting','chart_of_accounts','{"code":"UOS-SK","name":"Uctova osnova SR"}'::jsonb,'Slovak chart of accounts'),
  ('SK','tax','authority','{"name":"Financna sprava","exports":["KV-DPH"]}'::jsonb,'Slovak tax authority'),
  ('SK','tax','vat_standard','{"rate":23}'::jsonb,'Standard VAT'),
  ('SK','tax','vat_reduced','{"rate":19}'::jsonb,'Reduced VAT'),
  ('SK','invoicing','currency','{"code":"EUR","symbol":"€"}'::jsonb,'Currency'),
  ('HU','accounting','chart_of_accounts','{"code":"SZK","name":"Egyseges szamlakeret"}'::jsonb,'Hungarian chart of accounts'),
  ('HU','tax','authority','{"name":"NAV","exports":["NAV-XML","ONLINE-SZAMLA"]}'::jsonb,'Hungarian tax authority'),
  ('HU','tax','vat_standard','{"rate":27}'::jsonb,'Standard VAT'),
  ('HU','tax','vat_reduced','{"rate":18}'::jsonb,'Reduced VAT'),
  ('HU','invoicing','currency','{"code":"HUF","symbol":"Ft"}'::jsonb,'Currency')
) AS v(country_code, domain, rule_key, config, description)
WHERE NOT EXISTS (
  SELECT 1 FROM country_compliance_rules r
  WHERE upper(r.country_code) = v.country_code
    AND r.domain = v.domain
    AND r.rule_key = v.rule_key
);
