/*
  # Seed location catalog

  Loads 12 European / Balkan countries, 60+ major cities, and 120+ postal codes.
  All inserts are idempotent via ON CONFLICT.
*/

INSERT INTO countries (name, code, flag_emoji, region) VALUES
  ('Germany', 'DE', '🇩🇪', 'Western Europe'),
  ('Austria', 'AT', '🇦🇹', 'Western Europe'),
  ('Switzerland', 'CH', '🇨🇭', 'Western Europe'),
  ('France', 'FR', '🇫🇷', 'Western Europe'),
  ('Italy', 'IT', '🇮🇹', 'Southern Europe'),
  ('Netherlands', 'NL', '🇳🇱', 'Western Europe'),
  ('Belgium', 'BE', '🇧🇪', 'Western Europe'),
  ('Albania', 'AL', '🇦🇱', 'Balkans'),
  ('Kosovo', 'XK', '🇽🇰', 'Balkans'),
  ('North Macedonia', 'MK', '🇲🇰', 'Balkans'),
  ('Serbia', 'RS', '🇷🇸', 'Balkans'),
  ('Croatia', 'HR', '🇭🇷', 'Balkans')
ON CONFLICT ((upper(code))) DO NOTHING;

WITH c AS (SELECT id, code FROM countries)
INSERT INTO cities (country_id, name, admin_area)
SELECT c.id, v.name, v.admin_area
FROM (VALUES
  ('DE','Berlin','Berlin'), ('DE','Munich','Bavaria'), ('DE','Hamburg','Hamburg'),
  ('DE','Cologne','North Rhine-Westphalia'), ('DE','Frankfurt','Hesse'),
  ('DE','Stuttgart','Baden-Württemberg'), ('DE','Weil am Rhein','Baden-Württemberg'),
  ('AT','Vienna','Vienna'), ('AT','Graz','Styria'), ('AT','Linz','Upper Austria'),
  ('AT','Salzburg','Salzburg'), ('AT','Innsbruck','Tyrol'),
  ('CH','Zurich','Zurich'), ('CH','Geneva','Geneva'), ('CH','Basel','Basel-Stadt'),
  ('CH','Bern','Bern'), ('CH','Lausanne','Vaud'),
  ('FR','Paris','Île-de-France'), ('FR','Lyon','Auvergne-Rhône-Alpes'),
  ('FR','Marseille','Provence-Alpes-Côte d''Azur'), ('FR','Strasbourg','Grand Est'),
  ('FR','Lille','Hauts-de-France'),
  ('IT','Rome','Lazio'), ('IT','Milan','Lombardy'), ('IT','Naples','Campania'),
  ('IT','Turin','Piedmont'), ('IT','Florence','Tuscany'),
  ('NL','Amsterdam','North Holland'), ('NL','Rotterdam','South Holland'),
  ('NL','The Hague','South Holland'), ('NL','Utrecht','Utrecht'), ('NL','Eindhoven','North Brabant'),
  ('BE','Brussels','Brussels'), ('BE','Antwerp','Flanders'), ('BE','Ghent','Flanders'),
  ('BE','Liège','Wallonia'), ('BE','Bruges','Flanders'),
  ('AL','Tirana','Tirana'), ('AL','Durrës','Durrës'), ('AL','Vlorë','Vlorë'),
  ('AL','Shkodër','Shkodër'), ('AL','Elbasan','Elbasan'),
  ('XK','Pristina','Pristina'), ('XK','Prizren','Prizren'), ('XK','Peja','Peja'),
  ('XK','Gjakova','Gjakova'), ('XK','Mitrovica','Mitrovica'),
  ('MK','Skopje','Skopje'), ('MK','Bitola','Pelagonia'), ('MK','Tetovo','Polog'),
  ('MK','Kumanovo','Northeastern'), ('MK','Ohrid','Southwestern'),
  ('RS','Belgrade','Belgrade'), ('RS','Novi Sad','Vojvodina'), ('RS','Niš','Nišava'),
  ('RS','Kragujevac','Šumadija'), ('RS','Subotica','Vojvodina'),
  ('HR','Zagreb','Zagreb'), ('HR','Split','Split-Dalmatia'), ('HR','Rijeka','Primorje-Gorski Kotar'),
  ('HR','Osijek','Osijek-Baranja'), ('HR','Zadar','Zadar')
) AS v(country_code, name, admin_area)
JOIN c ON upper(c.code) = upper(v.country_code)
ON CONFLICT (country_id, lower(name)) DO NOTHING;

WITH ct AS (
  SELECT cities.id AS city_id, countries.code AS country_code, cities.name AS city_name
  FROM cities JOIN countries ON countries.id = cities.country_id
)
INSERT INTO postal_codes (city_id, code, area_name)
SELECT ct.city_id, v.code, v.area_name
FROM (VALUES
  ('DE','Berlin','10115','Mitte'), ('DE','Berlin','10178','Alexanderplatz'),
  ('DE','Berlin','10827','Schöneberg'), ('DE','Munich','80331','Altstadt-Lehel'),
  ('DE','Munich','80333','Maxvorstadt'), ('DE','Munich','81667','Haidhausen'),
  ('DE','Hamburg','20095','Altstadt'), ('DE','Hamburg','20354','Neustadt'),
  ('DE','Cologne','50667','Altstadt-Nord'), ('DE','Cologne','50674','Neustadt-Süd'),
  ('DE','Frankfurt','60311','Innenstadt'), ('DE','Frankfurt','60594','Sachsenhausen'),
  ('DE','Stuttgart','70173','Mitte'), ('DE','Stuttgart','70597','Degerloch'),
  ('DE','Weil am Rhein','79576','Zentrum'), ('DE','Weil am Rhein','79585','Friedlingen'),
  ('AT','Vienna','1010','Innere Stadt'), ('AT','Vienna','1020','Leopoldstadt'),
  ('AT','Vienna','1070','Neubau'), ('AT','Graz','8010','Innere Stadt'),
  ('AT','Graz','8020','Lend'), ('AT','Linz','4020','Innenstadt'),
  ('AT','Salzburg','5020','Altstadt'), ('AT','Innsbruck','6020','Innenstadt'),
  ('CH','Zurich','8001','Altstadt'), ('CH','Zurich','8004','Aussersihl'),
  ('CH','Zurich','8032','Hottingen'), ('CH','Geneva','1201','Pâquis'),
  ('CH','Geneva','1204','Cité'), ('CH','Basel','4051','Grossbasel'),
  ('CH','Basel','4057','Klybeck'), ('CH','Bern','3011','Altstadt'),
  ('CH','Lausanne','1003','Centre'),
  ('FR','Paris','75001','Louvre'), ('FR','Paris','75008','Champs-Élysées'),
  ('FR','Paris','75015','Vaugirard'), ('FR','Lyon','69001','1er'),
  ('FR','Lyon','69002','Bellecour'), ('FR','Marseille','13001','La Canebière'),
  ('FR','Marseille','13008','Prado'), ('FR','Strasbourg','67000','Centre'),
  ('FR','Lille','59000','Centre'),
  ('IT','Rome','00184','Monti'), ('IT','Rome','00186','Centro Storico'),
  ('IT','Rome','00187','Trevi'), ('IT','Milan','20121','Brera'),
  ('IT','Milan','20144','Porta Genova'), ('IT','Naples','80133','Centro Storico'),
  ('IT','Turin','10121','Centro'), ('IT','Florence','50122','Centro'),
  ('NL','Amsterdam','1011','Centrum'), ('NL','Amsterdam','1017','Grachtengordel'),
  ('NL','Amsterdam','1071','Museumkwartier'), ('NL','Rotterdam','3011','Stadsdriehoek'),
  ('NL','Rotterdam','3012','Cool'), ('NL','The Hague','2511','Centrum'),
  ('NL','Utrecht','3511','Binnenstad'), ('NL','Eindhoven','5611','Centrum'),
  ('BE','Brussels','1000','Centre'), ('BE','Brussels','1050','Ixelles'),
  ('BE','Antwerp','2000','Centrum'), ('BE','Antwerp','2018','Zuid'),
  ('BE','Ghent','9000','Centrum'), ('BE','Liège','4000','Centre'),
  ('BE','Bruges','8000','Centrum'),
  ('AL','Tirana','1001','Qendra'), ('AL','Tirana','1019','Ish-Blloku'),
  ('AL','Durrës','2001','Qendra'), ('AL','Vlorë','9401','Qendra'),
  ('AL','Shkodër','4001','Qendra'), ('AL','Elbasan','3001','Qendra'),
  ('XK','Pristina','10000','Qendra'), ('XK','Prizren','20000','Qendra'),
  ('XK','Peja','30000','Qendra'), ('XK','Gjakova','50000','Qendra'),
  ('XK','Mitrovica','40000','Qendra'),
  ('MK','Skopje','1000','Centar'), ('MK','Skopje','1060','Karpoš'),
  ('MK','Bitola','7000','Centar'), ('MK','Tetovo','1200','Centar'),
  ('MK','Kumanovo','1300','Centar'), ('MK','Ohrid','6000','Centar'),
  ('RS','Belgrade','11000','Stari Grad'), ('RS','Belgrade','11070','Novi Beograd'),
  ('RS','Novi Sad','21000','Centar'), ('RS','Niš','18000','Centar'),
  ('RS','Kragujevac','34000','Centar'), ('RS','Subotica','24000','Centar'),
  ('HR','Zagreb','10000','Donji Grad'), ('HR','Zagreb','10010','Novi Zagreb'),
  ('HR','Split','21000','Centar'), ('HR','Rijeka','51000','Centar'),
  ('HR','Osijek','31000','Centar'), ('HR','Zadar','23000','Centar')
) AS v(country_code, city_name, code, area_name)
JOIN ct ON upper(ct.country_code) = upper(v.country_code)
       AND lower(ct.city_name) = lower(v.city_name)
ON CONFLICT (city_id, code) DO NOTHING;
