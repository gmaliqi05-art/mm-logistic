/*
  # Seed COA templates — Germany (SKR03), Austria (EKR), Switzerland (KMU), France (PCG)

  1. Changes
    - Insert templates for DE, AT, CH, FR
    - Insert main-level accounts (chart roots + common postings)
    - Mark `is_default = true` for the primary template per country

  2. Notes
    - Account codes follow the official national numbering schemes
    - Types: asset | liability | equity | income | expense | contra
    - vat_relevance: 'none' | 'input' | 'output' | 'reduced_input' | 'reduced_output'
*/

-- DE: SKR03 (condensed main accounts)
WITH t AS (
  INSERT INTO coa_templates (country_code, template_code, name, description, language, is_default)
  VALUES ('DE', 'SKR03', 'SKR03 (Datev)', 'Standardkontenrahmen 03 für Einzelunternehmen und Personengesellschaften', 'de', true)
  ON CONFLICT (country_code, template_code) DO UPDATE SET name = EXCLUDED.name
  RETURNING id
)
INSERT INTO coa_template_accounts (template_id, account_code, account_name, account_type, parent_code, vat_relevance, sort_order)
SELECT t.id, v.code, v.name, v.atype, v.parent, v.vat, v.ord FROM t, (VALUES
  ('0100','Grundstücke','asset',NULL,'none',10),
  ('0200','Gebäude','asset',NULL,'none',20),
  ('0320','Lkw','asset',NULL,'none',30),
  ('0350','Pkw','asset',NULL,'none',40),
  ('0400','Betriebsausstattung','asset',NULL,'none',50),
  ('0500','Büroausstattung','asset',NULL,'none',60),
  ('1000','Kasse','asset',NULL,'none',100),
  ('1200','Bank','asset',NULL,'none',110),
  ('1400','Forderungen aus L&L','asset',NULL,'none',120),
  ('1576','Vorsteuer 7%','asset',NULL,'reduced_input',130),
  ('1576','Abziehbare Vorsteuer 7%','asset',NULL,'reduced_input',131),
  ('1571','Abziehbare Vorsteuer 19%','asset',NULL,'input',132),
  ('1600','Verbindlichkeiten aus L&L','liability',NULL,'none',200),
  ('1700','Sonstige Verbindlichkeiten','liability',NULL,'none',210),
  ('1770','Umsatzsteuer 19%','liability',NULL,'output',220),
  ('1771','Umsatzsteuer 7%','liability',NULL,'reduced_output',221),
  ('2000','Eigenkapital','equity',NULL,'none',300),
  ('8400','Erlöse 19% USt','income',NULL,'output',400),
  ('8300','Erlöse 7% USt','income',NULL,'reduced_output',401),
  ('8200','Erlöse steuerfrei','income',NULL,'none',402),
  ('3400','Wareneingang 19%','expense',NULL,'input',500),
  ('3300','Wareneingang 7%','expense',NULL,'reduced_input',501),
  ('4100','Löhne und Gehälter','expense',NULL,'none',510),
  ('4120','Soziale Abgaben','expense',NULL,'none',511),
  ('4210','Miete','expense',NULL,'input',520),
  ('4240','Gas/Strom/Wasser','expense',NULL,'input',521),
  ('4360','Versicherungen','expense',NULL,'none',530),
  ('4510','Kfz-Steuer','expense',NULL,'none',540),
  ('4520','Kfz-Versicherung','expense',NULL,'none',541),
  ('4530','Laufende Kfz-Betriebskosten','expense',NULL,'input',542),
  ('4660','Reisekosten','expense',NULL,'input',550),
  ('4910','Telefon','expense',NULL,'input',560),
  ('4920','Porto','expense',NULL,'none',561),
  ('4930','Bürobedarf','expense',NULL,'input',570),
  ('4950','Rechts- und Beratungskosten','expense',NULL,'input',580)
) AS v(code,name,atype,parent,vat,ord)
ON CONFLICT (template_id, account_code) DO NOTHING;

-- DE: SKR04 (reference only)
WITH t AS (
  INSERT INTO coa_templates (country_code, template_code, name, description, language, is_default)
  VALUES ('DE', 'SKR04', 'SKR04 (Datev)', 'Standardkontenrahmen 04 für Kapitalgesellschaften', 'de', false)
  ON CONFLICT (country_code, template_code) DO UPDATE SET name = EXCLUDED.name
  RETURNING id
)
INSERT INTO coa_template_accounts (template_id, account_code, account_name, account_type, parent_code, vat_relevance, sort_order)
SELECT t.id, v.code, v.name, v.atype, NULL, v.vat, v.ord FROM t, (VALUES
  ('0100','Sachanlagen','asset','none',10),
  ('1000','Kasse','asset','none',100),
  ('1800','Bank','asset','none',110),
  ('1400','Forderungen LuL','asset','none',120),
  ('3300','Verbindlichkeiten LuL','liability','none',200),
  ('3800','Umsatzsteuer','liability','output',210),
  ('2000','Gezeichnetes Kapital','equity','none',300),
  ('4000','Umsatzerlöse','income','output',400),
  ('5100','Wareneingang','expense','input',500),
  ('6020','Gehälter','expense','none',510)
) AS v(code,name,atype,vat,ord)
ON CONFLICT (template_id, account_code) DO NOTHING;

-- AT: EKR
WITH t AS (
  INSERT INTO coa_templates (country_code, template_code, name, description, language, is_default)
  VALUES ('AT', 'EKR', 'Einheitskontenrahmen (EKR)', 'Österreichischer Einheitskontenrahmen', 'de', true)
  ON CONFLICT (country_code, template_code) DO UPDATE SET name = EXCLUDED.name
  RETURNING id
)
INSERT INTO coa_template_accounts (template_id, account_code, account_name, account_type, parent_code, vat_relevance, sort_order)
SELECT t.id, v.code, v.name, v.atype, NULL, v.vat, v.ord FROM t, (VALUES
  ('0100','Grundstücke und Bauten','asset','none',10),
  ('0630','LKW','asset','none',20),
  ('2000','Kassa','asset','none',100),
  ('2800','Bank','asset','none',110),
  ('2000','Forderungen','asset','none',120),
  ('2500','Vorsteuer 20%','asset','input',130),
  ('3300','Verbindlichkeiten LuL','liability','none',200),
  ('3500','Umsatzsteuer 20%','liability','output',210),
  ('3510','Umsatzsteuer 10%','liability','reduced_output',211),
  ('9000','Eigenkapital','equity','none',300),
  ('4000','Erlöse 20% USt','income','output',400),
  ('4010','Erlöse 10% USt','income','reduced_output',401),
  ('5000','Wareneinkauf','expense','input',500),
  ('6000','Personalaufwand','expense','none',510),
  ('7100','Miete','expense','input',520),
  ('7200','Energie','expense','input',521),
  ('7500','KFZ-Aufwand','expense','input',540)
) AS v(code,name,atype,vat,ord)
ON CONFLICT (template_id, account_code) DO NOTHING;

-- CH: KMU
WITH t AS (
  INSERT INTO coa_templates (country_code, template_code, name, description, language, is_default)
  VALUES ('CH', 'KMU', 'KMU-Kontenrahmen', 'Schweizer Kontenrahmen für KMU nach Veb.ch', 'de', true)
  ON CONFLICT (country_code, template_code) DO UPDATE SET name = EXCLUDED.name
  RETURNING id
)
INSERT INTO coa_template_accounts (template_id, account_code, account_name, account_type, parent_code, vat_relevance, sort_order)
SELECT t.id, v.code, v.name, v.atype, NULL, v.vat, v.ord FROM t, (VALUES
  ('1000','Kasse','asset','none',100),
  ('1020','Bank','asset','none',110),
  ('1100','Forderungen aus L&L','asset','none',120),
  ('1170','Vorsteuer (8.1%)','asset','input',130),
  ('1500','Fahrzeuge','asset','none',140),
  ('2000','Verbindlichkeiten aus L&L','liability','none',200),
  ('2200','Umsatzsteuer (8.1%)','liability','output',210),
  ('2800','Eigenkapital','equity','none',300),
  ('3000','Erträge Verkauf','income','output',400),
  ('4000','Materialaufwand','expense','input',500),
  ('5000','Personalaufwand','expense','none',510),
  ('6000','Raumaufwand','expense','input',520),
  ('6100','Fahrzeug- und Transportaufwand','expense','input',540)
) AS v(code,name,atype,vat,ord)
ON CONFLICT (template_id, account_code) DO NOTHING;

-- FR: PCG
WITH t AS (
  INSERT INTO coa_templates (country_code, template_code, name, description, language, is_default)
  VALUES ('FR', 'PCG', 'Plan Comptable Général (PCG)', 'Plan Comptable Général français', 'fr', true)
  ON CONFLICT (country_code, template_code) DO UPDATE SET name = EXCLUDED.name
  RETURNING id
)
INSERT INTO coa_template_accounts (template_id, account_code, account_name, account_type, parent_code, vat_relevance, sort_order)
SELECT t.id, v.code, v.name, v.atype, NULL, v.vat, v.ord FROM t, (VALUES
  ('101','Capital','equity','none',10),
  ('164','Emprunts','liability','none',20),
  ('211','Terrains','asset','none',30),
  ('213','Constructions','asset','none',40),
  ('218','Matériel de transport','asset','none',50),
  ('401','Fournisseurs','liability','none',200),
  ('411','Clients','asset','none',100),
  ('44566','TVA déductible 20%','asset','input',130),
  ('44562','TVA déductible sur immobilisations','asset','input',131),
  ('44571','TVA collectée 20%','liability','output',210),
  ('445715','TVA collectée 10%','liability','reduced_output',211),
  ('512','Banque','asset','none',110),
  ('530','Caisse','asset','none',120),
  ('601','Achats stockés - matières','expense','input',500),
  ('607','Achats de marchandises','expense','input',501),
  ('613','Locations','expense','input',520),
  ('616','Primes d''assurances','expense','none',530),
  ('624','Transports de biens','expense','input',540),
  ('625','Déplacements, missions','expense','input',550),
  ('626','Frais postaux et télécommunications','expense','input',560),
  ('641','Rémunérations du personnel','expense','none',510),
  ('645','Charges de sécurité sociale','expense','none',511),
  ('701','Ventes de produits finis','income','output',400),
  ('707','Ventes de marchandises','income','output',401),
  ('706','Prestations de services','income','output',402)
) AS v(code,name,atype,vat,ord)
ON CONFLICT (template_id, account_code) DO NOTHING;
