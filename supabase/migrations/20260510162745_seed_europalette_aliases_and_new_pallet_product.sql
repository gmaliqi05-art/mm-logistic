/*
  # Seed Euro Palette aliases and "Euro Paleta e Re" default product

  1. Backfills product_categories.aliases with common Euro Palette aliases
     (EPAL, UIC, Euro Palette, EUR, Euro Pallet, Europalette) for every
     category that is a class-mode Europalette variant (name matches).
  2. Ensures a "Euro Paleta e Re" category_product exists for every class
     mode Europalette category, so new/unclassified incoming pallets can
     be auto-assigned to it without going through sorting.

  No destructive changes. All inserts/updates are guarded.
*/

UPDATE product_categories
SET aliases = ARRAY['EPAL','UIC','Euro Palette','EUR','Euro Pallet','Europalette']::text[]
WHERE sorting_mode = 'class'
  AND (
    lower(name) LIKE '%euro%' OR
    lower(name) LIKE '%epal%' OR
    lower(name) LIKE '%uic%' OR
    lower(name) LIKE '%eur %' OR
    lower(name) = 'eur'
  )
  AND (aliases IS NULL OR array_length(aliases, 1) IS NULL OR array_length(aliases, 1) = 0);

INSERT INTO category_products (id, company_id, category_id, name, is_active, created_at, updated_at)
SELECT gen_random_uuid(), c.company_id, c.id, 'Euro Paleta e Re', true, now(), now()
FROM product_categories c
WHERE c.sorting_mode = 'class'
  AND (
    lower(c.name) LIKE '%euro%' OR
    lower(c.name) LIKE '%epal%' OR
    lower(c.name) LIKE '%uic%'
  )
  AND NOT EXISTS (
    SELECT 1 FROM category_products cp
    WHERE cp.category_id = c.id
      AND cp.company_id = c.company_id
      AND (
        lower(cp.name) LIKE '%e re%' OR
        lower(cp.name) LIKE '%neu%' OR
        lower(cp.name) LIKE '%new%' OR
        lower(cp.name) LIKE 'euro paleta e re%'
      )
  )
ON CONFLICT DO NOTHING;
