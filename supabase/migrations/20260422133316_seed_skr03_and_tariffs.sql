/*
  # Seed SKR03 Chart of Accounts dhe kodet doganore

  ## Përshkrim
  Mbush planin e kontabilitetit për çdo kompani ekzistuese me kodet standarde
  gjermane SKR03, dhe krijon një listë bazë të kodeve doganore HS për importet
  më të zakonshme në sektorin logjistik.

  ## Veprime
  1. Për çdo kompani në `companies`, shto ~45 llogari bazë të SKR03
  2. Shto 15 kode HS bazë (paleta druri, metal, plastikë, elektronike, etj.)

  ## Vërejtje
  - Llogaritë nuk duplikohen falë constraint UNIQUE(company_id, account_code)
  - Kodet HS kanë UNIQUE në hs_code
*/

-- Mbushja e SKR03 për çdo kompani
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN SELECT id FROM companies LOOP
    INSERT INTO acc_chart_of_accounts (company_id, account_code, name, account_type, account_group, vat_rate) VALUES
    -- AKTIVET (Aktiva) - Klasa 0-1
    (c.id, '0300', 'Pajisje teknike dhe makina', 'asset', 'Anlagevermoegen', 0),
    (c.id, '0400', 'Automjete', 'asset', 'Anlagevermoegen', 0),
    (c.id, '0500', 'Inventari i zyres', 'asset', 'Anlagevermoegen', 0),
    (c.id, '0670', 'Softwer dhe licensa', 'asset', 'Anlagevermoegen', 0),
    (c.id, '1000', 'Arka', 'asset', 'Umlaufvermoegen', 0),
    (c.id, '1200', 'Banka', 'asset', 'Umlaufvermoegen', 0),
    (c.id, '1210', 'Banka 2', 'asset', 'Umlaufvermoegen', 0),
    (c.id, '1400', 'Llogari klientesh (Debitoren)', 'asset', 'Umlaufvermoegen', 0),
    (c.id, '1500', 'Stok malli', 'asset', 'Umlaufvermoegen', 0),
    (c.id, '1570', 'TVSH e zbritshme 19%', 'asset', 'Umlaufvermoegen', 19),
    (c.id, '1571', 'TVSH e zbritshme 7%', 'asset', 'Umlaufvermoegen', 7),
    (c.id, '1588', 'TVSH importi (Einfuhrumsatzsteuer)', 'asset', 'Umlaufvermoegen', 19),
    (c.id, '1590', 'TVSH e zbritshme reverse charge', 'asset', 'Umlaufvermoegen', 0),

    -- DETYRIMET (Passiva) - Klasa 1-3
    (c.id, '1600', 'Arka (kreditore)', 'liability', 'Verbindlichkeiten', 0),
    (c.id, '1700', 'Llogari furnitoresh (Kreditoren)', 'liability', 'Verbindlichkeiten', 0),
    (c.id, '1740', 'Kredi bankare afatshkurtra', 'liability', 'Verbindlichkeiten', 0),
    (c.id, '1770', 'TVSH e pagueshme 19%', 'liability', 'Verbindlichkeiten', 19),
    (c.id, '1771', 'TVSH e pagueshme 7%', 'liability', 'Verbindlichkeiten', 7),
    (c.id, '1776', 'TVSH reverse charge e pagueshme', 'liability', 'Verbindlichkeiten', 0),
    (c.id, '1780', 'Tatim mbi pagen', 'liability', 'Verbindlichkeiten', 0),

    -- KAPITALI - Klasa 2
    (c.id, '2000', 'Kapitali fillestar', 'equity', 'Eigenkapital', 0),
    (c.id, '2100', 'Fitim i pashpernd', 'equity', 'Eigenkapital', 0),
    (c.id, '2180', 'Humbje e bartur', 'equity', 'Eigenkapital', 0),

    -- TE ARDHURAT (Ertrag) - Klasa 8
    (c.id, '8400', 'Te ardhurat nga shitjet 19%', 'revenue', 'Erloese', 19),
    (c.id, '8300', 'Te ardhurat nga shitjet 7%', 'revenue', 'Erloese', 7),
    (c.id, '8125', 'Te ardhura Intra-EU (tax-free)', 'revenue', 'Erloese', 0),
    (c.id, '8120', 'Eksporte jashte BE', 'revenue', 'Erloese', 0),
    (c.id, '8590', 'Te ardhura te tjera', 'revenue', 'Erloese', 19),
    (c.id, '8736', 'Zbritje e dhene klienteve', 'revenue', 'Erloese', 19),

    -- SHPENZIMET (Aufwand) - Klasa 3, 4, 6, 7
    (c.id, '3400', 'Blerje lendesh 19%', 'expense', 'Materialaufwand', 19),
    (c.id, '3300', 'Blerje lendesh 7%', 'expense', 'Materialaufwand', 7),
    (c.id, '3425', 'Blerje Intra-EU 19%', 'expense', 'Materialaufwand', 19),
    (c.id, '3550', 'Blerje nga jashte BE (importe)', 'expense', 'Materialaufwand', 0),
    (c.id, '3800', 'Shpenzime transporti', 'expense', 'Materialaufwand', 19),
    (c.id, '3830', 'Tarifa doganore', 'expense', 'Materialaufwand', 0),
    (c.id, '4100', 'Paga dhe rroga', 'expense', 'Personalaufwand', 0),
    (c.id, '4120', 'Sigurime shoqerore', 'expense', 'Personalaufwand', 0),
    (c.id, '4210', 'Qira hapesirash', 'expense', 'Raumkosten', 19),
    (c.id, '4240', 'Energji elektrike, gas, uje', 'expense', 'Raumkosten', 19),
    (c.id, '4500', 'Karburant automjetesh', 'expense', 'Fahrzeugkosten', 19),
    (c.id, '4510', 'Mirembajtje automjetesh', 'expense', 'Fahrzeugkosten', 19),
    (c.id, '4600', 'Reklamim', 'expense', 'Werbekosten', 19),
    (c.id, '4910', 'Shpenzime posta dhe telefon', 'expense', 'Verwaltung', 19),
    (c.id, '4920', 'Shpenzime zyre dhe printim', 'expense', 'Verwaltung', 19),
    (c.id, '4930', 'Konsulence dhe avokat', 'expense', 'Verwaltung', 19),
    (c.id, '4940', 'Kontabilitet', 'expense', 'Verwaltung', 19),
    (c.id, '4980', 'Shpenzime te tjera operative', 'expense', 'Verwaltung', 19),
    (c.id, '4830', 'Amortizim (AfA)', 'expense', 'Abschreibungen', 0),
    (c.id, '7000', 'Interes kredie', 'expense', 'Finanzaufwand', 0)
    ON CONFLICT (company_id, account_code) DO NOTHING;
  END LOOP;
END $$;

-- Mbushja e kodeve HS baze
INSERT INTO acc_customs_tariffs (hs_code, description, duty_rate, vat_rate, category) VALUES
('44152020', 'Paleta druri (Holzpaletten)', 2.5, 19, 'Druri'),
('44151020', 'Ambalazh druri, kuti', 4.0, 19, 'Druri'),
('39231010', 'Kuti plastike per ambalazhim', 6.5, 19, 'Plastike'),
('39232100', 'Qese plastike (polietilen)', 6.5, 19, 'Plastike'),
('48191000', 'Kuti kartoni te valezuar', 0.0, 19, 'Karton'),
('73089098', 'Struktura metalike, hekur', 2.0, 19, 'Metal'),
('73269098', 'Artikuj te tjere metalike', 2.7, 19, 'Metal'),
('87169000', 'Pjese per rimorkio dhe gjysemrimorkio', 2.7, 19, 'Transport'),
('87089997', 'Pjese automjetesh', 3.5, 19, 'Automjete'),
('85044090', 'Konvertues tensioni, invertera', 3.7, 19, 'Elektronike'),
('85371091', 'Panele kontrolli elektrike', 2.1, 19, 'Elektronike'),
('94032080', 'Raft metalik per depo', 0.0, 19, 'Mobilie'),
('63053299', 'Çanta dhe thase per mallra', 7.2, 19, 'Tekstil'),
('39269097', 'Artikuj te tjere plastike', 6.5, 19, 'Plastike'),
('00000000', 'Tjeter - klasifikim manual', 0.0, 19, 'Tjeter')
ON CONFLICT (hs_code) DO NOTHING;
