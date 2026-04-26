/*
  # Track stock transfer for repair reports

  Adds a `sent_to_stock_at` timestamp (and `sent_to_stock_by`) to
  `depot_repair_reports` so the company admin can mark a daily depot
  report as processed: the repaired quantities are added to stock
  exactly once, and the report shows who moved it and when.

  1. Modified tables
    - depot_repair_reports:
      - sent_to_stock_at timestamptz (nullable)
      - sent_to_stock_by uuid (nullable FK profiles)

  2. Security
    - No policy changes needed; existing policies already allow admins to
      UPDATE rows in the same company.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='depot_repair_reports' AND column_name='sent_to_stock_at'
  ) THEN
    ALTER TABLE depot_repair_reports ADD COLUMN sent_to_stock_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='depot_repair_reports' AND column_name='sent_to_stock_by'
  ) THEN
    ALTER TABLE depot_repair_reports ADD COLUMN sent_to_stock_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;
