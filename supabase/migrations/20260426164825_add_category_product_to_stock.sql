/*
  # Link stock and stock_movements to category_products

  1. Modified Tables
    - `stock`: +category_product_id (uuid, nullable, FK to category_products)
      Allows tracking stock per specific product (e.g. EPAL Klasse A) within a category.
    - `stock_movements`: +category_product_id (uuid, nullable, FK to category_products)
      Allows recording which specific product was moved.

  2. Indexes
    - `idx_stock_category_product` on stock(category_product_id)
    - `idx_stock_movements_category_product` on stock_movements(category_product_id)

  3. Notes
    - Both columns are nullable to remain backward compatible with existing rows.
    - No RLS changes are needed: RLS continues to be enforced via company_id.
    - No data is dropped or migrated; only additive schema changes.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stock' AND column_name = 'category_product_id'
  ) THEN
    ALTER TABLE stock
      ADD COLUMN category_product_id uuid REFERENCES category_products(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stock_movements' AND column_name = 'category_product_id'
  ) THEN
    ALTER TABLE stock_movements
      ADD COLUMN category_product_id uuid REFERENCES category_products(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_stock_category_product ON stock(category_product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_category_product ON stock_movements(category_product_id);
