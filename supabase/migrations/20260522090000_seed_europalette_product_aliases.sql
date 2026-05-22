-- 20260522090000 — Seed product aliases for EuroPalette + Klasse A/B/C so the
-- matcher reliably resolves "EPAL", "EuroPalette", "Euro Palete", "A Klasse",
-- "B Klasse", "C Klasse" etc. to the existing category_products instead of
-- silently creating duplicates on the next delivery note.
--
-- Strategy:
-- - Idempotent: union new aliases with whatever is already there so re-running
--   adds nothing.
-- - Scope: applies to every company that has a product whose canonical name
--   matches the seed list (today only the SalPal company; future tenants
--   inherit the same hints automatically when they create catalog entries with
--   the same canonical names).
-- - Does NOT touch SKU / dimensions / default_condition.

-- 1) Euro Pallet EPAL — the parent europalette product.
UPDATE public.category_products
SET aliases = ARRAY(
  SELECT DISTINCT v
  FROM unnest(
    COALESCE(aliases, ARRAY[]::text[]) || ARRAY[
      'EPAL', 'EUR', 'UIC',
      'Euro Pallet', 'Euro Pal',
      'Euro Palette', 'EuroPalette', 'Europalette',
      'Euro Palete', 'Europalete',
      'Euro Paleta', 'Europaleta',
      'EUR1', 'EUR 1',
      'Euro-Pallet', 'Euro-Palette', 'Europ Paleta'
    ]
  ) AS v
)
WHERE name ILIKE 'Euro Pallet EPAL'
   OR name ILIKE 'EuroPallet EPAL'
   OR name ILIKE 'Euro EPAL';

-- 2) Klasse A / B / C — common multilingual variants for the post-sort buckets.
UPDATE public.category_products
SET aliases = ARRAY(
  SELECT DISTINCT v
  FROM unnest(
    COALESCE(aliases, ARRAY[]::text[]) || ARRAY[
      'A-Klasse', 'A Klasse', 'A-Class', 'Class A',
      'A Quality', 'A Qualität', 'A Qualitaet',
      'Klasa A', 'Klasi A',
      'EPAL A', 'A EPAL', 'A-Palet', 'A Palet',
      'Klasse A EPAL'
    ]
  ) AS v
)
WHERE name ILIKE 'Klasse A';

UPDATE public.category_products
SET aliases = ARRAY(
  SELECT DISTINCT v
  FROM unnest(
    COALESCE(aliases, ARRAY[]::text[]) || ARRAY[
      'B-Klasse', 'B Klasse', 'B-Class', 'Class B',
      'B Quality', 'B Qualität', 'B Qualitaet',
      'Klasa B', 'Klasi B',
      'EPAL B', 'B EPAL', 'B-Palet', 'B Palet',
      'Klasse B EPAL'
    ]
  ) AS v
)
WHERE name ILIKE 'Klasse B';

UPDATE public.category_products
SET aliases = ARRAY(
  SELECT DISTINCT v
  FROM unnest(
    COALESCE(aliases, ARRAY[]::text[]) || ARRAY[
      'C-Klasse', 'C Klasse', 'C-Class', 'Class C',
      'C Quality', 'C Qualität', 'C Qualitaet',
      'Klasa C', 'Klasi C',
      'EPAL C', 'C EPAL', 'C-Palet', 'C Palet',
      'Klasse C EPAL'
    ]
  ) AS v
)
WHERE name ILIKE 'Klasse C';
