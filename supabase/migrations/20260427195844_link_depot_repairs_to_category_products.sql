/*
  # Link Depot Repairs to Specific Products

  ## Why
  Repaired pallets were stored with only a `category_id` and a freeform
  `product_name` text on `depot_repairs`. Because `category_product_id`
  was never captured, every repaired pallet ended up in stock without a
  product link, collapsing A/B/C Klasse into a single "no product"
  bucket on the Company Stock page.

  ## Changes
  1. Schema
    - `depot_repairs`: add `category_product_id uuid` (nullable) referencing
      `category_products(id) on delete set null`
    - Add supporting index `(company_id, category_product_id)`
  2. Data backfill
    - For existing repair rows where `product_name` matches a single active
      product within the same company + category (case/space insensitive),
      populate `category_product_id`. Ambiguous rows are left untouched.

  ## Notes
  - No data is deleted or destructively transformed.
  - RLS policies on `depot_repairs` already restrict by company; no policy
    changes required.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'depot_repairs' AND column_name = 'category_product_id'
  ) THEN
    ALTER TABLE depot_repairs
      ADD COLUMN category_product_id uuid REFERENCES category_products(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_depot_repairs_company_product
  ON depot_repairs(company_id, category_product_id);

UPDATE depot_repairs dr
SET category_product_id = match.id
FROM (
  SELECT
    cp.id,
    cp.company_id,
    cp.category_id,
    lower(btrim(cp.name)) AS norm_name
  FROM category_products cp
  WHERE cp.is_active = true
) match
WHERE dr.category_product_id IS NULL
  AND dr.product_name IS NOT NULL
  AND btrim(dr.product_name) <> ''
  AND match.company_id = dr.company_id
  AND match.category_id = dr.category_id
  AND match.norm_name = lower(btrim(dr.product_name));
