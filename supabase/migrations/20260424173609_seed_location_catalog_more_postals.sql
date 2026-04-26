/*
  # Additional postal codes to reach 100+

  Expands coverage for cities that only had one entry to improve the autocomplete demo surface.
*/

WITH ct AS (
  SELECT cities.id AS city_id, countries.code AS country_code, cities.name AS city_name
  FROM cities JOIN countries ON countries.id = cities.country_id
)
INSERT INTO postal_codes (city_id, code, area_name)
SELECT ct.city_id, v.code, v.area_name
FROM (VALUES
  ('FR','Strasbourg','67100','Neudorf'),
  ('FR','Lille','59800','Centre-Vieux Lille'),
  ('FR','Lyon','69003','Part-Dieu'),
  ('IT','Turin','10123','San Salvario'),
  ('IT','Naples','80122','Chiaia'),
  ('IT','Florence','50123','Santa Maria Novella'),
  ('NL','The Hague','2517','Zeeheldenkwartier'),
  ('NL','Utrecht','3512','Wittevrouwen'),
  ('NL','Eindhoven','5612','Woensel'),
  ('AT','Linz','4040','Urfahr'),
  ('AT','Salzburg','5023','Gnigl'),
  ('AT','Innsbruck','6060','Hall'),
  ('CH','Bern','3005','Kirchenfeld'),
  ('CH','Lausanne','1005','Cité'),
  ('AL','Durrës','2002','Porti'),
  ('AL','Vlorë','9402','Skelë'),
  ('XK','Prizren','20001','Bazhdarhane'),
  ('XK','Peja','30001','Kapeshnica'),
  ('MK','Bitola','7001','Park'),
  ('MK','Tetovo','1220','Poroj')
) AS v(country_code, city_name, code, area_name)
JOIN ct ON upper(ct.country_code) = upper(v.country_code)
       AND lower(ct.city_name) = lower(v.city_name)
ON CONFLICT (city_id, code) DO NOTHING;
