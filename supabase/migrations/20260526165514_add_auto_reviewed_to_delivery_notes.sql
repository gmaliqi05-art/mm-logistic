/*
  # Add auto_reviewed flag to delivery_notes

  1. Modified Tables
    - `delivery_notes`
      - `auto_reviewed` (boolean, default false) - flag set when the system auto-approves a delivery note because the partner is already known

  2. Notes
    - This column allows the UI to show a banner indicating the document was auto-approved
    - Admin can still edit all data even when auto-approved
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'delivery_notes' AND column_name = 'auto_reviewed'
  ) THEN
    ALTER TABLE delivery_notes ADD COLUMN auto_reviewed boolean DEFAULT false;
  END IF;
END $$;
