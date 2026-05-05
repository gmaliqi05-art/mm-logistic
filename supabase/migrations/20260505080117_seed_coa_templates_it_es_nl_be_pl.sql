/*
  # Seed COA templates — Italy, Spain, Netherlands, Belgium, Poland
*/

-- IT: Codice Civile
WITH t AS (
  INSERT INTO coa_templates (country_code, template_code, name, description, language, is_default)
  VALUES ('IT', 'CC', 'Piano dei Conti (Codice Civile)', 'Piano dei conti secondo il Codice Civile italiano', 'it', true)
  ON CONFLICT (country_code, template_code) DO UPDATE SET name = EXCLUDED.name
  RETURNING id
)
INSERT INTO coa_template_accounts (template_id, account_code, account_name, account_type, parent_code, vat_relevance, sort_order)
SELECT t.id, v.code, v.name, v.atype, NULL, v.vat, v.ord FROM t, (VALUES
  ('1010','Cassa','asset','none',100),
  ('1020','Banca c/c','asset','none',110),
  ('1030','Crediti v/clienti','asset','none',120),
  ('1610','IVA a credito 22%','asset','input',130),
  ('1611','IVA a credito 10%','asset','reduced_input',131),
  ('1710','Automezzi','asset','none',140),
  ('2010','Debiti v/fornitori','liability','none',200),
  ('2610','IVA a debito 22%','liability','output',210),
  ('2611','IVA a debito 10%','liability','reduced_output',211),
  ('3010','Capitale sociale','equity','none',300),
  ('4010','Ricavi vendite 22%','income','output',400),
  ('4011','Ricavi vendite 10%','income','reduced_output',401),
  ('5010','Acquisti merci 22%','expense','input',500),
  ('5011','Acquisti merci 10%','expense','reduced_input',501),
  ('6010','Stipendi','expense','none',510),
  ('6020','Oneri sociali','expense','none',511),
  ('6110','Affitti passivi','expense','input',520),
  ('6210','Carburanti','expense','input',540),
  ('6310','Assicurazioni','expense','none',530)
) AS v(code,name,atype,vat,ord)
ON CONFLICT (template_id, account_code) DO NOTHING;

-- ES: PGC
WITH t AS (
  INSERT INTO coa_templates (country_code, template_code, name, description, language, is_default)
  VALUES ('ES', 'PGC', 'Plan General de Contabilidad', 'Plan General de Contabilidad español (RD 1514/2007)', 'es', true)
  ON CONFLICT (country_code, template_code) DO UPDATE SET name = EXCLUDED.name
  RETURNING id
)
INSERT INTO coa_template_accounts (template_id, account_code, account_name, account_type, parent_code, vat_relevance, sort_order)
SELECT t.id, v.code, v.name, v.atype, NULL, v.vat, v.ord FROM t, (VALUES
  ('100','Capital social','equity','none',10),
  ('170','Deudas a largo plazo','liability','none',20),
  ('210','Terrenos','asset','none',30),
  ('218','Elementos de transporte','asset','none',40),
  ('400','Proveedores','liability','none',200),
  ('430','Clientes','asset','none',100),
  ('472','IVA soportado 21%','asset','input',130),
  ('4721','IVA soportado 10%','asset','reduced_input',131),
  ('477','IVA repercutido 21%','liability','output',210),
  ('4771','IVA repercutido 10%','liability','reduced_output',211),
  ('570','Caja','asset','none',110),
  ('572','Bancos','asset','none',120),
  ('600','Compras de mercaderías','expense','input',500),
  ('621','Arrendamientos','expense','input',520),
  ('624','Transportes','expense','input',540),
  ('625','Primas de seguros','expense','none',530),
  ('640','Sueldos y salarios','expense','none',510),
  ('642','Seguridad Social a cargo de la empresa','expense','none',511),
  ('700','Ventas de mercaderías','income','output',400),
  ('705','Prestaciones de servicios','income','output',401)
) AS v(code,name,atype,vat,ord)
ON CONFLICT (template_id, account_code) DO NOTHING;

-- NL: RGS (simplified)
WITH t AS (
  INSERT INTO coa_templates (country_code, template_code, name, description, language, is_default)
  VALUES ('NL', 'RGS', 'Referentie Grootboekschema (RGS)', 'Nederlands standaard rekeningschema', 'nl', true)
  ON CONFLICT (country_code, template_code) DO UPDATE SET name = EXCLUDED.name
  RETURNING id
)
INSERT INTO coa_template_accounts (template_id, account_code, account_name, account_type, parent_code, vat_relevance, sort_order)
SELECT t.id, v.code, v.name, v.atype, NULL, v.vat, v.ord FROM t, (VALUES
  ('0100','Bedrijfsgebouwen','asset','none',10),
  ('0200','Vervoermiddelen','asset','none',20),
  ('1000','Kas','asset','none',100),
  ('1100','Bank','asset','none',110),
  ('1300','Debiteuren','asset','none',120),
  ('1540','Te vorderen BTW 21%','asset','input',130),
  ('1541','Te vorderen BTW 9%','asset','reduced_input',131),
  ('1600','Crediteuren','liability','none',200),
  ('1650','Af te dragen BTW 21%','liability','output',210),
  ('1651','Af te dragen BTW 9%','liability','reduced_output',211),
  ('2000','Eigen vermogen','equity','none',300),
  ('4000','Loonkosten','expense','none',510),
  ('4400','Huisvestingskosten','expense','input',520),
  ('4500','Autokosten','expense','input',540),
  ('7000','Inkopen','expense','input',500),
  ('8000','Omzet hoog BTW','income','output',400),
  ('8010','Omzet laag BTW','income','reduced_output',401)
) AS v(code,name,atype,vat,ord)
ON CONFLICT (template_id, account_code) DO NOTHING;

-- BE: PCMN
WITH t AS (
  INSERT INTO coa_templates (country_code, template_code, name, description, language, is_default)
  VALUES ('BE', 'PCMN', 'Plan Comptable Minimum Normalisé', 'Plan comptable belge PCMN / MAR', 'fr', true)
  ON CONFLICT (country_code, template_code) DO UPDATE SET name = EXCLUDED.name
  RETURNING id
)
INSERT INTO coa_template_accounts (template_id, account_code, account_name, account_type, parent_code, vat_relevance, sort_order)
SELECT t.id, v.code, v.name, v.atype, NULL, v.vat, v.ord FROM t, (VALUES
  ('100','Capital','equity','none',10),
  ('22','Terrains et constructions','asset','none',30),
  ('24','Matériel roulant','asset','none',40),
  ('400','Clients','asset','none',100),
  ('411','TVA à récupérer 21%','asset','input',130),
  ('440','Fournisseurs','liability','none',200),
  ('451','TVA à payer 21%','liability','output',210),
  ('550','Banque','asset','none',110),
  ('570','Caisse','asset','none',120),
  ('600','Achats de matières premières','expense','input',500),
  ('604','Achats de marchandises','expense','input',501),
  ('610','Services et biens divers','expense','input',520),
  ('620','Rémunérations','expense','none',510),
  ('700','Ventes','income','output',400),
  ('705','Prestations de services','income','output',401)
) AS v(code,name,atype,vat,ord)
ON CONFLICT (template_id, account_code) DO NOTHING;

-- PL: Wzorcowy
WITH t AS (
  INSERT INTO coa_templates (country_code, template_code, name, description, language, is_default)
  VALUES ('PL', 'WPK', 'Wzorcowy Plan Kont', 'Polski wzorcowy plan kont', 'pl', true)
  ON CONFLICT (country_code, template_code) DO UPDATE SET name = EXCLUDED.name
  RETURNING id
)
INSERT INTO coa_template_accounts (template_id, account_code, account_name, account_type, parent_code, vat_relevance, sort_order)
SELECT t.id, v.code, v.name, v.atype, NULL, v.vat, v.ord FROM t, (VALUES
  ('010','Środki trwałe','asset','none',10),
  ('100','Kasa','asset','none',100),
  ('130','Rachunek bieżący','asset','none',110),
  ('200','Rozrachunki z odbiorcami','asset','none',120),
  ('221','VAT naliczony 23%','asset','input',130),
  ('2211','VAT naliczony 8%','asset','reduced_input',131),
  ('210','Rozrachunki z dostawcami','liability','none',200),
  ('222','VAT należny 23%','liability','output',210),
  ('2221','VAT należny 8%','liability','reduced_output',211),
  ('800','Kapitał podstawowy','equity','none',300),
  ('700','Sprzedaż produktów','income','output',400),
  ('730','Sprzedaż towarów','income','output',401),
  ('400','Amortyzacja','expense','none',500),
  ('401','Zużycie materiałów','expense','input',501),
  ('402','Usługi obce','expense','input',520),
  ('404','Wynagrodzenia','expense','none',510),
  ('409','Pozostałe koszty','expense','input',540)
) AS v(code,name,atype,vat,ord)
ON CONFLICT (template_id, account_code) DO NOTHING;
