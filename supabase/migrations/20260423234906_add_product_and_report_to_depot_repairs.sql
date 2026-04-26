/*
  # Add product name and report tracking to depot_repairs

  1. Schema changes
    - depot_repairs:
      - product_name text (nullable) — free-text product name logged per repair
      - reported_at timestamptz (nullable) — when the entry was bundled into a
        report sent to company admin; null means not yet reported

  2. Notes
    - Both columns are additive and nullable; existing rows are unaffected.
    - No RLS changes; existing policies cover the new columns.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='depot_repairs' AND column_name='product_name'
  ) THEN
    ALTER TABLE depot_repairs ADD COLUMN product_name text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='depot_repairs' AND column_name='reported_at'
  ) THEN
    ALTER TABLE depot_repairs ADD COLUMN reported_at timestamptz;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_depot_repairs_reported_at ON depot_repairs(reported_at);
