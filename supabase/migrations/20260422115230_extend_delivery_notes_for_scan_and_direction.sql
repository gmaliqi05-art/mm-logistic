/*
  # Extend delivery notes for incoming/outgoing direction and scanned attachments

  1. Changes to acc_delivery_notes
    - `direction` (text) - either `outgoing` (Fletedalje) or `incoming` (Fletepranim/Wareneingang)
    - `document_url` (text) - URL of scanned/uploaded document attached to the note
    - `document_mime` (text) - MIME type of attached document
    - `supplier_invoice_number` (text) - external supplier's invoice/reference number on an incoming receipt

  2. Extend acc_delivery_note_items
    - `unit_price` (numeric) - optional unit price captured from scans
    - `line_total` (numeric) - optional line total captured from scans
    - `vat_rate` (numeric) - optional VAT rate captured from scans

  3. Security
    - No RLS changes needed, existing policies on acc_delivery_notes and items continue to apply
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acc_delivery_notes' AND column_name = 'direction'
  ) THEN
    ALTER TABLE acc_delivery_notes
      ADD COLUMN direction text NOT NULL DEFAULT 'outgoing'
      CHECK (direction IN ('outgoing','incoming'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acc_delivery_notes' AND column_name = 'document_url'
  ) THEN
    ALTER TABLE acc_delivery_notes ADD COLUMN document_url text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acc_delivery_notes' AND column_name = 'document_mime'
  ) THEN
    ALTER TABLE acc_delivery_notes ADD COLUMN document_mime text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acc_delivery_notes' AND column_name = 'supplier_invoice_number'
  ) THEN
    ALTER TABLE acc_delivery_notes ADD COLUMN supplier_invoice_number text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acc_delivery_note_items' AND column_name = 'unit_price'
  ) THEN
    ALTER TABLE acc_delivery_note_items ADD COLUMN unit_price numeric DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acc_delivery_note_items' AND column_name = 'line_total'
  ) THEN
    ALTER TABLE acc_delivery_note_items ADD COLUMN line_total numeric DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acc_delivery_note_items' AND column_name = 'vat_rate'
  ) THEN
    ALTER TABLE acc_delivery_note_items ADD COLUMN vat_rate numeric DEFAULT 0;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_acc_delivery_notes_direction ON acc_delivery_notes(direction);
