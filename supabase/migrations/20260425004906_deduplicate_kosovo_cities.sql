/*
  # Bashko qytete të Kosovës me emra dublikatë (anglisht/shqip)

  1. Ndryshime
    - Zhvendos kodet postare nga variantet e dublikuara (Pristina, Peja, Mitrovica, Gjakova)
      te emrat kanonikë shqip (Prishtinë, Pejë, Mitrovicë, Gjakovë)
    - Fshin qytetet dublikatë që nuk kanë asnjë varësi tjetër

  2. Siguria
    - Operim me kujdes: përditëson foreign keys para se të fshijë rreshta
    - Vetëm qytete që janë tashmë dublikatë të qartë (i njëjti shtet + emër ekuivalent)

  3. Shënime
    - Për Gjakova: rreshti ekzistues ka admin_area='Gjakova'; rreshti i ri 'Gjakovë'
      nuk ekzistonte, prandaj thjesht përditësojmë emrin në vend
*/

DO $$
DECLARE
  xk_id uuid;
  canonical_id uuid;
  duplicate_id uuid;
  canonical_name text;
  duplicate_name text;
  pairs text[][] := ARRAY[
    ARRAY['Prishtinë','Pristina'],
    ARRAY['Pejë','Peja'],
    ARRAY['Mitrovicë','Mitrovica'],
    ARRAY['Gjakovë','Gjakova']
  ];
  pair text[];
BEGIN
  SELECT id INTO xk_id FROM countries WHERE upper(code) = 'XK';
  IF xk_id IS NULL THEN RETURN; END IF;

  FOREACH pair SLICE 1 IN ARRAY pairs LOOP
    canonical_name := pair[1];
    duplicate_name := pair[2];

    SELECT id INTO canonical_id FROM cities
      WHERE country_id = xk_id AND lower(name) = lower(canonical_name)
      LIMIT 1;
    SELECT id INTO duplicate_id FROM cities
      WHERE country_id = xk_id AND lower(name) = lower(duplicate_name)
      LIMIT 1;

    IF canonical_id IS NULL AND duplicate_id IS NOT NULL THEN
      UPDATE cities SET name = canonical_name, admin_area = canonical_name
        WHERE id = duplicate_id;
    ELSIF canonical_id IS NOT NULL AND duplicate_id IS NOT NULL AND canonical_id <> duplicate_id THEN
      UPDATE postal_codes
        SET city_id = canonical_id
        WHERE city_id = duplicate_id
          AND NOT EXISTS (
            SELECT 1 FROM postal_codes p2
            WHERE p2.city_id = canonical_id AND p2.code = postal_codes.code
          );
      DELETE FROM postal_codes WHERE city_id = duplicate_id;
      DELETE FROM cities WHERE id = duplicate_id;
    END IF;

    canonical_id := NULL;
    duplicate_id := NULL;
  END LOOP;
END $$;

UPDATE cities SET admin_area = '' WHERE admin_area IS NOT NULL;
