/*
  # Add missing unique constraints required by stock-posting trigger

  `process_delivery_note_stock()` uses:
    - ON CONFLICT (company_id, depot_id, category_product_id, condition) on `stock`
    - ON CONFLICT (source_item_id) on `pallet_sorting_batches`
    - ON CONFLICT (source_item_id) on `depot_repairs`

  None of these had matching unique constraints, so every confirmation that
  routed items to stock failed with:
    "there is no unique or exclusion constraint matching the ON CONFLICT specification".

  This migration:
    1. Deduplicates existing rows (keeping the row with the largest quantity / earliest id).
    2. Creates the missing unique indexes.

  No destructive operations beyond folding obvious duplicate keys into a
  single retained row (sum quantities for stock).
*/

-- 1. stock: deduplicate by (company_id, depot_id, category_product_id, condition)
DO $$
BEGIN
  WITH ranked AS (
    SELECT id,
           company_id, depot_id, category_product_id, condition,
           quantity,
           ROW_NUMBER() OVER (
             PARTITION BY company_id, depot_id, category_product_id, condition
             ORDER BY created_at NULLS LAST, id
           ) AS rn,
           SUM(quantity) OVER (
             PARTITION BY company_id, depot_id, category_product_id, condition
           ) AS total_qty
    FROM public.stock
    WHERE category_product_id IS NOT NULL
  ),
  keepers AS (
    SELECT * FROM ranked WHERE rn = 1
  )
  UPDATE public.stock s
  SET quantity = k.total_qty
  FROM keepers k
  WHERE s.id = k.id
    AND s.quantity <> k.total_qty;

  DELETE FROM public.stock s
  USING (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY company_id, depot_id, category_product_id, condition
             ORDER BY created_at NULLS LAST, id
           ) AS rn
    FROM public.stock
    WHERE category_product_id IS NOT NULL
  ) d
  WHERE s.id = d.id AND d.rn > 1;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS stock_unique_per_product_condition
  ON public.stock (company_id, depot_id, category_product_id, condition)
  WHERE category_product_id IS NOT NULL;

-- 2. pallet_sorting_batches: deduplicate by source_item_id
DELETE FROM public.pallet_sorting_batches s
USING (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY source_item_id
           ORDER BY created_at NULLS LAST, id
         ) AS rn
  FROM public.pallet_sorting_batches
  WHERE source_item_id IS NOT NULL
) d
WHERE s.id = d.id AND d.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS pallet_sorting_batches_source_item_uniq
  ON public.pallet_sorting_batches (source_item_id)
  WHERE source_item_id IS NOT NULL;

-- 3. depot_repairs: deduplicate by source_item_id
DELETE FROM public.depot_repairs s
USING (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY source_item_id
           ORDER BY created_at NULLS LAST, id
         ) AS rn
  FROM public.depot_repairs
  WHERE source_item_id IS NOT NULL
) d
WHERE s.id = d.id AND d.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS depot_repairs_source_item_uniq
  ON public.depot_repairs (source_item_id)
  WHERE source_item_id IS NOT NULL;
