/*
  # Link operational delivery notes to accounting invoices

  1. Schema Changes
    - Add `acc_invoice_id` (uuid, nullable) to `delivery_notes` table
      - Foreign key to `acc_invoices(id)` with `ON DELETE SET NULL`
    - Add `invoiced_at` (timestamptz, nullable) to track when a delivery
      note was invoiced

  2. Index
    - Add index on `acc_invoice_id` for efficient lookups
    - Add partial index on (`company_id`, `status`) for unbilled queries

  3. Notes
    - Allows the accounting dashboard to show confirmed/delivered notes
      that are ready to be invoiced
    - No data migration needed; existing notes remain unlinked
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'delivery_notes' AND column_name = 'acc_invoice_id'
  ) THEN
    ALTER TABLE delivery_notes
      ADD COLUMN acc_invoice_id uuid REFERENCES acc_invoices(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'delivery_notes' AND column_name = 'invoiced_at'
  ) THEN
    ALTER TABLE delivery_notes
      ADD COLUMN invoiced_at timestamptz;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_delivery_notes_acc_invoice_id
  ON delivery_notes (acc_invoice_id)
  WHERE acc_invoice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_delivery_notes_company_status
  ON delivery_notes (company_id, status);
