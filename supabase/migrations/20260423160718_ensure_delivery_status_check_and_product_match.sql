/*
  # Ensure delivery_notes status CHECK covers the new workflow statuses

  1. Safety
     - Drop and recreate the CHECK constraint so it includes every status
       used by the app: draft, sent, in_transit, pending_company_review,
       pending_stock_confirmation, delivered, completed, confirmed.
  2. New column
     - delivery_note_items.product_id (uuid) — optional link to an acc_products row
       so the system can remember the auto-matched or manually chosen product.
*/

ALTER TABLE delivery_notes DROP CONSTRAINT IF EXISTS delivery_notes_status_check;
ALTER TABLE delivery_notes ADD CONSTRAINT delivery_notes_status_check
  CHECK (status IN (
    'draft',
    'sent',
    'in_transit',
    'pending_company_review',
    'pending_stock_confirmation',
    'delivered',
    'completed',
    'confirmed'
  ));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='delivery_note_items' AND column_name='product_id'
  ) THEN
    ALTER TABLE delivery_note_items
      ADD COLUMN product_id uuid REFERENCES acc_products(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_delivery_note_items_product_id
  ON delivery_note_items(product_id);
