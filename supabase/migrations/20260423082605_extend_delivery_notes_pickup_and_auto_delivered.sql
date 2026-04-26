/*
  # Extend delivery_notes for pickup orders and auto-delivered tracking

  1. New columns on delivery_notes
    - delivered_at (timestamptz) — timestamp when the driver scanned the signed delivery note
    - confirmed_at (timestamptz) — timestamp when the confirmation flag was applied
    - reference_number (text) — pickup reference number provided by partner company
    - scheduled_pickup_at (timestamptz) — scheduled pickup time for pickup orders
    - scheduled_delivery_at (timestamptz) — scheduled delivery time for delivery orders

  2. Trigger
    - When scanned_photo_url transitions from empty/null to a value and type='delivery',
      auto-set status='delivered' and delivered_at=now() (only if still active).
    - When status transitions to 'delivered' without delivered_at, stamp delivered_at.
    - When status transitions to 'confirmed' without confirmed_at, stamp confirmed_at.

  3. Index
    - idx_delivery_notes_reference_number for quick lookup by reference
    - idx_delivery_notes_note_date on created_at for day-bucket charts
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='delivery_notes' AND column_name='delivered_at') THEN
    ALTER TABLE delivery_notes ADD COLUMN delivered_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='delivery_notes' AND column_name='confirmed_at') THEN
    ALTER TABLE delivery_notes ADD COLUMN confirmed_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='delivery_notes' AND column_name='reference_number') THEN
    ALTER TABLE delivery_notes ADD COLUMN reference_number text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='delivery_notes' AND column_name='scheduled_pickup_at') THEN
    ALTER TABLE delivery_notes ADD COLUMN scheduled_pickup_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='delivery_notes' AND column_name='scheduled_delivery_at') THEN
    ALTER TABLE delivery_notes ADD COLUMN scheduled_delivery_at timestamptz;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_delivery_notes_reference_number
  ON delivery_notes(company_id, reference_number);

CREATE INDEX IF NOT EXISTS idx_delivery_notes_created_at
  ON delivery_notes(company_id, created_at);

CREATE OR REPLACE FUNCTION public.delivery_notes_auto_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.scanned_photo_url IS NOT NULL
       AND NEW.scanned_photo_url <> ''
       AND COALESCE(OLD.scanned_photo_url, '') = ''
       AND NEW.type = 'delivery'
       AND NEW.status IN ('sent', 'in_transit', 'draft') THEN
      NEW.status := 'delivered';
      IF NEW.delivered_at IS NULL THEN
        NEW.delivered_at := now();
      END IF;
    END IF;

    IF NEW.status = 'delivered' AND OLD.status <> 'delivered' AND NEW.delivered_at IS NULL THEN
      NEW.delivered_at := now();
    END IF;

    IF NEW.status = 'confirmed' AND OLD.status <> 'confirmed' AND NEW.confirmed_at IS NULL THEN
      NEW.confirmed_at := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_delivery_notes_auto_status ON delivery_notes;
CREATE TRIGGER trg_delivery_notes_auto_status
  BEFORE UPDATE ON delivery_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.delivery_notes_auto_status();
