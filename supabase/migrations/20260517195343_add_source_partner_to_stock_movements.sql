/*
  # Add source_partner to stock_movements

  1. Schema Changes
    - `stock_movements`: Add `source_partner` text column (nullable, default '')
      - Stores the name of the person/company who delivered pallets to the depot
      - Used for receiving (entry) movements only

  2. Notes
    - This allows depot workers to record who brought pallets
    - Company reports can then show the source of each delivery
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stock_movements' AND column_name = 'source_partner'
  ) THEN
    ALTER TABLE public.stock_movements ADD COLUMN source_partner text DEFAULT '';
  END IF;
END $$;
