/*
  # Add destination partner fields to stock_movements

  1. Modified Tables
    - `stock_movements`
      - `destination_partner` (text) - name of the client/partner receiving outgoing goods
      - `destination_contact_id` (uuid, FK -> acc_contacts) - link to existing contact record

  2. Notes
    - These columns complement the existing `source_partner` / `source_contact_id` fields
    - `source_*` is used for incoming (entry) movements
    - `destination_*` is used for outgoing (exit) movements
    - Index added on destination_contact_id for join performance
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stock_movements' AND column_name = 'destination_partner'
  ) THEN
    ALTER TABLE stock_movements ADD COLUMN destination_partner text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stock_movements' AND column_name = 'destination_contact_id'
  ) THEN
    ALTER TABLE stock_movements ADD COLUMN destination_contact_id uuid
      REFERENCES acc_contacts(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_stock_movements_destination_contact
  ON public.stock_movements(destination_contact_id)
  WHERE destination_contact_id IS NOT NULL;
