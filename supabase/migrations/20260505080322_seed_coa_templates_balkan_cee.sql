/*
  # Seed Chart of Accounts templates for Balkan and CEE countries

  1. Templates Added
    - AL: Plani Kontabël Lokal (PKL)
    - XK: Kosovo COA (IFRS for SME based)
    - RO: Plan de conturi general
    - BG: Национален сметкоплан
    - GR: Ελληνικό Λογιστικό Σχέδιο (ELS)
    - HR: Računski plan
    - RS: Kontni okvir
    - SI: Slovenski kontni okvir
    - CZ: Směrná účtová osnova
    - SK: Rámcová účtová osnova
    - HU: Egységes Számlakeret

  2. Notes
    - Idempotent via ON CONFLICT (country_code, template_code) DO UPDATE
    - Each country gets a default template with core accounts covering cash, bank,
      AR/AP, VAT in/out, sales, purchases, payroll, vehicles
*/

-- AL: Plani Kontabël Lokal (PKL)
WITH t AS (
  INSERT INTO coa_templates (country_code, template_code, name, description, language, is_default)
  VALUES ('AL', 'PKL', 'Plani Kontabël Lokal', 'Plani i llogarive sipas standardeve shqiptare', 'sq', true)
  ON CONFLICT (country_code, template_code) DO UPDATE SET name = EXCLUDED.name
  RETURNING id
)
INSERT INTO coa_template_accounts (template_id, account_code, account_name, account_type, vat_relevance, sort_order)
SELECT t.id, x.code, x.name, x.type, x.vat, x.sort FROM t, (VALUES
  ('211', 'Arkë', 'asset', 'none', 10),
  ('212', 'Bankë', 'asset', 'none', 20),
  ('411', 'Klientë', 'asset', 'none', 30),
  ('401', 'Furnitorë', 'liability', 'none', 40),
  ('4452', 'TVSH e zbritshme 20%', 'asset', 'input', 50),
  ('4457', 'TVSH e mbledhur 20%', 'liability', 'output', 60),
  ('601', 'Blerje mallrash', 'expense', 'input', 70),
  ('701', 'Të ardhura nga shitjet', 'income', 'output', 80),
  ('641', 'Pagat', 'expense', 'none', 90),
  ('613', 'Qira', 'expense', 'input', 100),
  ('624', 'Transport', 'expense', 'input', 110),
  ('213', 'Automjete', 'asset', 'none', 120),
  ('101', 'Kapitali themeltar', 'equity', 'none', 130)
) AS x(code, name, type, vat, sort)
ON CONFLICT DO NOTHING;

-- XK: Kosovo COA (IFRS for SME based)
WITH t AS (
  INSERT INTO coa_templates (country_code, template_code, name, description, language, is_default)
  VALUES ('XK', 'KOSCOA', 'Plani i Llogarive të Kosovës', 'IFRS për NVM - plan kontabël i Kosovës', 'sq', true)
  ON CONFLICT (country_code, template_code) DO UPDATE SET name = EXCLUDED.name
  RETURNING id
)
INSERT INTO coa_template_accounts (template_id, account_code, account_name, account_type, vat_relevance, sort_order)
SELECT t.id, x.code, x.name, x.type, x.vat, x.sort FROM t, (VALUES
  ('1010', 'Arka', 'asset', 'none', 10),
  ('1020', 'Banka', 'asset', 'none', 20),
  ('1210', 'Kerkesat nga klientet', 'asset', 'none', 30),
  ('2010', 'Obligimet ndaj furnitoreve', 'liability', 'none', 40),
  ('1350', 'TVSH e zbritshme 18%', 'asset', 'input', 50),
  ('1351', 'TVSH e zbritshme 8%', 'asset', 'reduced_input', 55),
  ('2350', 'TVSH e mbledhur 18%', 'liability', 'output', 60),
  ('2351', 'TVSH e mbledhur 8%', 'liability', 'reduced_output', 65),
  ('6010', 'Blerje mallrash', 'expense', 'input', 70),
  ('7010', 'Te hyrat nga shitjet', 'income', 'output', 80),
  ('6100', 'Pagat', 'expense', 'none', 90),
  ('6200', 'Qiraja', 'expense', 'input', 100),
  ('1500', 'Automjete', 'asset', 'none', 110),
  ('3010', 'Kapitali aksionar', 'equity', 'none', 120)
) AS x(code, name, type, vat, sort)
ON CONFLICT DO NOTHING;

-- RO: Plan de conturi general
WITH t AS (
  INSERT INTO coa_templates (country_code, template_code, name, description, language, is_default)
  VALUES ('RO', 'PCG-RO', 'Plan de conturi general', 'Planul general de conturi romanesc', 'en', true)
  ON CONFLICT (country_code, template_code) DO UPDATE SET name = EXCLUDED.name
  RETURNING id
)
INSERT INTO coa_template_accounts (template_id, account_code, account_name, account_type, vat_relevance, sort_order)
SELECT t.id, x.code, x.name, x.type, x.vat, x.sort FROM t, (VALUES
  ('5311', 'Casa in lei', 'asset', 'none', 10),
  ('5121', 'Conturi la banci in lei', 'asset', 'none', 20),
  ('4111', 'Clienti', 'asset', 'none', 30),
  ('401', 'Furnizori', 'liability', 'none', 40),
  ('4426', 'TVA deductibila 19%', 'asset', 'input', 50),
  ('4427', 'TVA colectata 19%', 'liability', 'output', 60),
  ('371', 'Marfuri', 'asset', 'none', 70),
  ('607', 'Cheltuieli cu marfurile', 'expense', 'input', 80),
  ('707', 'Venituri din vanzarea marfurilor', 'income', 'output', 90),
  ('641', 'Cheltuieli cu salariile', 'expense', 'none', 100),
  ('612', 'Cheltuieli cu chiriile', 'expense', 'input', 110),
  ('2133', 'Mijloace de transport', 'asset', 'none', 120),
  ('1012', 'Capital subscris varsat', 'equity', 'none', 130)
) AS x(code, name, type, vat, sort)
ON CONFLICT DO NOTHING;

-- BG
WITH t AS (
  INSERT INTO coa_templates (country_code, template_code, name, description, language, is_default)
  VALUES ('BG', 'NSK-BG', 'Национален сметкоплан', 'Bulgarian national chart of accounts', 'en', true)
  ON CONFLICT (country_code, template_code) DO UPDATE SET name = EXCLUDED.name
  RETURNING id
)
INSERT INTO coa_template_accounts (template_id, account_code, account_name, account_type, vat_relevance, sort_order)
SELECT t.id, x.code, x.name, x.type, x.vat, x.sort FROM t, (VALUES
  ('501', 'Каса в лева', 'asset', 'none', 10),
  ('503', 'Разплащателна сметка', 'asset', 'none', 20),
  ('411', 'Клиенти', 'asset', 'none', 30),
  ('401', 'Доставчици', 'liability', 'none', 40),
  ('4531', 'ДДС за възстановяване 20%', 'asset', 'input', 50),
  ('4532', 'ДДС за внасяне 20%', 'liability', 'output', 60),
  ('304', 'Стоки', 'asset', 'none', 70),
  ('702', 'Приходи от продажби на стоки', 'income', 'output', 80),
  ('602', 'Разходи за външни услуги', 'expense', 'input', 90),
  ('604', 'Разходи за заплати', 'expense', 'none', 100),
  ('205', 'Транспортни средства', 'asset', 'none', 110),
  ('101', 'Основен капитал', 'equity', 'none', 120)
) AS x(code, name, type, vat, sort)
ON CONFLICT DO NOTHING;

-- GR
WITH t AS (
  INSERT INTO coa_templates (country_code, template_code, name, description, language, is_default)
  VALUES ('GR', 'ELS', 'Ελληνικό Λογιστικό Σχέδιο', 'Greek General Chart of Accounts', 'en', true)
  ON CONFLICT (country_code, template_code) DO UPDATE SET name = EXCLUDED.name
  RETURNING id
)
INSERT INTO coa_template_accounts (template_id, account_code, account_name, account_type, vat_relevance, sort_order)
SELECT t.id, x.code, x.name, x.type, x.vat, x.sort FROM t, (VALUES
  ('38.00', 'Ταμείο', 'asset', 'none', 10),
  ('38.03', 'Καταθέσεις όψεως', 'asset', 'none', 20),
  ('30.00', 'Πελάτες', 'asset', 'none', 30),
  ('50.00', 'Προμηθευτές', 'liability', 'none', 40),
  ('54.00.29', 'ΦΠΑ εισροών 24%', 'asset', 'input', 50),
  ('54.00.79', 'ΦΠΑ εκροών 24%', 'liability', 'output', 60),
  ('70.00', 'Πωλήσεις εμπορευμάτων', 'income', 'output', 70),
  ('20.00', 'Αγορές εμπορευμάτων', 'expense', 'input', 80),
  ('60.00', 'Αμοιβές προσωπικού', 'expense', 'none', 90),
  ('62.04', 'Ενοίκια', 'expense', 'input', 100),
  ('13.00', 'Μεταφορικά μέσα', 'asset', 'none', 110),
  ('40.00', 'Κεφάλαιο', 'equity', 'none', 120)
) AS x(code, name, type, vat, sort)
ON CONFLICT DO NOTHING;

-- HR
WITH t AS (
  INSERT INTO coa_templates (country_code, template_code, name, description, language, is_default)
  VALUES ('HR', 'RP-HR', 'Računski plan', 'Croatian chart of accounts (RRIF)', 'en', true)
  ON CONFLICT (country_code, template_code) DO UPDATE SET name = EXCLUDED.name
  RETURNING id
)
INSERT INTO coa_template_accounts (template_id, account_code, account_name, account_type, vat_relevance, sort_order)
SELECT t.id, x.code, x.name, x.type, x.vat, x.sort FROM t, (VALUES
  ('1000', 'Blagajna', 'asset', 'none', 10),
  ('1010', 'Žiro račun', 'asset', 'none', 20),
  ('1200', 'Kupci', 'asset', 'none', 30),
  ('2200', 'Dobavljači', 'liability', 'none', 40),
  ('1400', 'Pretporez 25%', 'asset', 'input', 50),
  ('2400', 'Obveza za PDV 25%', 'liability', 'output', 60),
  ('6600', 'Prihodi od prodaje', 'income', 'output', 70),
  ('4000', 'Troškovi sirovina', 'expense', 'input', 80),
  ('4700', 'Plaće', 'expense', 'none', 90),
  ('0400', 'Transportna sredstva', 'asset', 'none', 100),
  ('9000', 'Temeljni kapital', 'equity', 'none', 110)
) AS x(code, name, type, vat, sort)
ON CONFLICT DO NOTHING;

-- RS
WITH t AS (
  INSERT INTO coa_templates (country_code, template_code, name, description, language, is_default)
  VALUES ('RS', 'KO-RS', 'Kontni okvir', 'Serbian chart of accounts framework', 'en', true)
  ON CONFLICT (country_code, template_code) DO UPDATE SET name = EXCLUDED.name
  RETURNING id
)
INSERT INTO coa_template_accounts (template_id, account_code, account_name, account_type, vat_relevance, sort_order)
SELECT t.id, x.code, x.name, x.type, x.vat, x.sort FROM t, (VALUES
  ('243', 'Blagajna', 'asset', 'none', 10),
  ('241', 'Tekući račun', 'asset', 'none', 20),
  ('202', 'Kupci u zemlji', 'asset', 'none', 30),
  ('432', 'Dobavljači u zemlji', 'liability', 'none', 40),
  ('270', 'PDV u primljenim računima 20%', 'asset', 'input', 50),
  ('470', 'Obaveza za PDV 20%', 'liability', 'output', 60),
  ('601', 'Prihodi od prodaje robe', 'income', 'output', 70),
  ('501', 'Nabavka robe', 'expense', 'input', 80),
  ('520', 'Troškovi zarada', 'expense', 'none', 90),
  ('023', 'Transportna sredstva', 'asset', 'none', 100),
  ('300', 'Osnovni kapital', 'equity', 'none', 110)
) AS x(code, name, type, vat, sort)
ON CONFLICT DO NOTHING;

-- SI
WITH t AS (
  INSERT INTO coa_templates (country_code, template_code, name, description, language, is_default)
  VALUES ('SI', 'SKO', 'Slovenski kontni okvir', 'Slovenian chart of accounts', 'en', true)
  ON CONFLICT (country_code, template_code) DO UPDATE SET name = EXCLUDED.name
  RETURNING id
)
INSERT INTO coa_template_accounts (template_id, account_code, account_name, account_type, vat_relevance, sort_order)
SELECT t.id, x.code, x.name, x.type, x.vat, x.sort FROM t, (VALUES
  ('100', 'Blagajna', 'asset', 'none', 10),
  ('110', 'Transakcijski račun', 'asset', 'none', 20),
  ('120', 'Terjatve do kupcev', 'asset', 'none', 30),
  ('220', 'Obveznosti do dobaviteljev', 'liability', 'none', 40),
  ('160', 'Vstopni DDV 22%', 'asset', 'input', 50),
  ('260', 'Izstopni DDV 22%', 'liability', 'output', 60),
  ('760', 'Prihodki od prodaje', 'income', 'output', 70),
  ('400', 'Stroški materiala', 'expense', 'input', 80),
  ('470', 'Plače', 'expense', 'none', 90),
  ('040', 'Vozila', 'asset', 'none', 100),
  ('900', 'Osnovni kapital', 'equity', 'none', 110)
) AS x(code, name, type, vat, sort)
ON CONFLICT DO NOTHING;

-- CZ
WITH t AS (
  INSERT INTO coa_templates (country_code, template_code, name, description, language, is_default)
  VALUES ('CZ', 'SUO-CZ', 'Směrná účtová osnova', 'Czech standard chart of accounts', 'en', true)
  ON CONFLICT (country_code, template_code) DO UPDATE SET name = EXCLUDED.name
  RETURNING id
)
INSERT INTO coa_template_accounts (template_id, account_code, account_name, account_type, vat_relevance, sort_order)
SELECT t.id, x.code, x.name, x.type, x.vat, x.sort FROM t, (VALUES
  ('211', 'Pokladna', 'asset', 'none', 10),
  ('221', 'Bankovní účty', 'asset', 'none', 20),
  ('311', 'Odběratelé', 'asset', 'none', 30),
  ('321', 'Dodavatelé', 'liability', 'none', 40),
  ('343.1', 'DPH na vstupu 21%', 'asset', 'input', 50),
  ('343.2', 'DPH na výstupu 21%', 'liability', 'output', 60),
  ('604', 'Tržby za zboží', 'income', 'output', 70),
  ('504', 'Prodané zboží', 'expense', 'input', 80),
  ('521', 'Mzdové náklady', 'expense', 'none', 90),
  ('022', 'Dopravní prostředky', 'asset', 'none', 100),
  ('411', 'Základní kapitál', 'equity', 'none', 110)
) AS x(code, name, type, vat, sort)
ON CONFLICT DO NOTHING;

-- SK
WITH t AS (
  INSERT INTO coa_templates (country_code, template_code, name, description, language, is_default)
  VALUES ('SK', 'RUO-SK', 'Rámcová účtová osnova', 'Slovak framework chart of accounts', 'en', true)
  ON CONFLICT (country_code, template_code) DO UPDATE SET name = EXCLUDED.name
  RETURNING id
)
INSERT INTO coa_template_accounts (template_id, account_code, account_name, account_type, vat_relevance, sort_order)
SELECT t.id, x.code, x.name, x.type, x.vat, x.sort FROM t, (VALUES
  ('211', 'Pokladnica', 'asset', 'none', 10),
  ('221', 'Bankové účty', 'asset', 'none', 20),
  ('311', 'Odberatelia', 'asset', 'none', 30),
  ('321', 'Dodávatelia', 'liability', 'none', 40),
  ('343.1', 'DPH na vstupe 20%', 'asset', 'input', 50),
  ('343.2', 'DPH na výstupe 20%', 'liability', 'output', 60),
  ('604', 'Tržby za tovar', 'income', 'output', 70),
  ('504', 'Predaný tovar', 'expense', 'input', 80),
  ('521', 'Mzdové náklady', 'expense', 'none', 90),
  ('022', 'Dopravné prostriedky', 'asset', 'none', 100),
  ('411', 'Základné imanie', 'equity', 'none', 110)
) AS x(code, name, type, vat, sort)
ON CONFLICT DO NOTHING;

-- HU
WITH t AS (
  INSERT INTO coa_templates (country_code, template_code, name, description, language, is_default)
  VALUES ('HU', 'ESZ-HU', 'Egységes Számlakeret', 'Hungarian unified chart of accounts', 'en', true)
  ON CONFLICT (country_code, template_code) DO UPDATE SET name = EXCLUDED.name
  RETURNING id
)
INSERT INTO coa_template_accounts (template_id, account_code, account_name, account_type, vat_relevance, sort_order)
SELECT t.id, x.code, x.name, x.type, x.vat, x.sort FROM t, (VALUES
  ('381', 'Pénztár', 'asset', 'none', 10),
  ('384', 'Bankbetétek', 'asset', 'none', 20),
  ('311', 'Belföldi vevők', 'asset', 'none', 30),
  ('454', 'Belföldi szállítók', 'liability', 'none', 40),
  ('466', 'Előzetesen felszámított ÁFA 27%', 'asset', 'input', 50),
  ('467', 'Fizetendő ÁFA 27%', 'liability', 'output', 60),
  ('911', 'Belföldi értékesítés árbevétele', 'income', 'output', 70),
  ('511', 'Anyagköltség', 'expense', 'input', 80),
  ('541', 'Bérköltség', 'expense', 'none', 90),
  ('131', 'Járművek', 'asset', 'none', 100),
  ('411', 'Jegyzett tőke', 'equity', 'none', 110)
) AS x(code, name, type, vat, sort)
ON CONFLICT DO NOTHING;
