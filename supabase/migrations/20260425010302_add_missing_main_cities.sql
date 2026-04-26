/*
  # Shtim qytetesh kryesore që mungonin

  1. Ndryshime
    - Shton Ferizaj dhe Gjilan për Kosovën (XK)
    - Shton Fier për Shqipërinë (AL)
    - Shton kodet postare 70000 (Ferizaj), 60000 (Gjilan), 9301 (Fier)

  2. Siguria
    - Pa ndryshime politikash; idempotent
*/

INSERT INTO cities (country_id, name, admin_area)
SELECT c.id, v.name, ''
FROM (VALUES
  ('XK','Ferizaj'),
  ('XK','Gjilan'),
  ('AL','Fier')
) AS v(country_code, name)
JOIN countries c ON upper(c.code) = upper(v.country_code)
WHERE NOT EXISTS (
  SELECT 1 FROM cities ci
  WHERE ci.country_id = c.id AND lower(ci.name) = lower(v.name)
);

INSERT INTO postal_codes (city_id, code, area_name)
SELECT ci.id, v.code, v.area_name
FROM (VALUES
  ('XK','Ferizaj','70000','Qendër'),
  ('XK','Gjilan','60000','Qendër'),
  ('AL','Fier','9301','Qendër')
) AS v(country_code, city_name, code, area_name)
JOIN countries c ON upper(c.code) = upper(v.country_code)
JOIN cities ci ON ci.country_id = c.id AND lower(ci.name) = lower(v.city_name)
WHERE NOT EXISTS (
  SELECT 1 FROM postal_codes p
  WHERE p.city_id = ci.id AND p.code = v.code
);
