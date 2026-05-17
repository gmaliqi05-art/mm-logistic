/*
  # Add report_sent_at to pallet_sorting_batches

  1. Changes
    - Adds `report_sent_at` (timestamptz, nullable) column to `pallet_sorting_batches`
    - Tracks when the depot sent the sorting report to the company admin
    - NULL means report not yet sent; a timestamp means it was sent

  2. Important notes
    - No destructive changes
    - Column is nullable so existing rows remain untouched
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pallet_sorting_batches' AND column_name = 'report_sent_at'
  ) THEN
    ALTER TABLE pallet_sorting_batches ADD COLUMN report_sent_at timestamptz;
  END IF;
END $$;
