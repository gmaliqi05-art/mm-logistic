/*
  # Link delivery note items to category_products

  The legacy `product_id` column on `delivery_note_items` is a FK to
  `acc_products` (the accounting catalog). The new depot/company catalog lives
  in `category_products`, which made the existing column reject inserts with a
  23503 error. Adds a parallel nullable FK so delivery items can reference the
  new catalog without breaking existing rows.

  1. Modified tables
    - delivery_note_items
      - new column `category_product_id` uuid (FK category_products ON DELETE SET NULL)
      - index on category_product_id

  2. Security
    - No RLS changes (existing policies already gate the parent table).
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'delivery_note_items' AND column_name = 'category_product_id'
  ) THEN
    ALTER TABLE delivery_note_items
      ADD COLUMN category_product_id uuid REFERENCES category_products(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_delivery_note_items_category_product
  ON delivery_note_items(category_product_id);
