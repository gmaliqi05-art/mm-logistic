/*
  # Multi-step delivery confirmation workflow

  Adds a chain-of-custody flow from driver scan to stock registration.

  1. New status values (stored as text; constraint updated):
     - pending_company_review  — driver confirmed preview; awaiting admin
     - pending_stock_confirmation — admin approved; depot must post to stock
     - completed                — stock posted; final state
  2. New columns on delivery_notes:
     - ai_extracted_json (jsonb) — raw AI extraction result
     - ai_confidence    (numeric)
     - company_reviewed_at/by  — admin review timestamps
     - stock_confirmed_at/by   — depot stock posting timestamps
     - review_notes (text)     — reason on return
  3. Trigger update:
     - The old auto-delivered trigger (on scanned_photo_url) is replaced by a no-op
       driver-controlled flow. It still stamps timestamps when the status moves to
       delivered/pending_company_review/completed without them set.
  4. Notifications are created from application code, not in SQL.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='delivery_notes' AND column_name='ai_extracted_json') THEN
    ALTER TABLE delivery_notes ADD COLUMN ai_extracted_json jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='delivery_notes' AND column_name='ai_confidence') THEN
    ALTER TABLE delivery_notes ADD COLUMN ai_confidence numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='delivery_notes' AND column_name='company_reviewed_at') THEN
    ALTER TABLE delivery_notes ADD COLUMN company_reviewed_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='delivery_notes' AND column_name='company_reviewed_by') THEN
    ALTER TABLE delivery_notes ADD COLUMN company_reviewed_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='delivery_notes' AND column_name='stock_confirmed_at') THEN
    ALTER TABLE delivery_notes ADD COLUMN stock_confirmed_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='delivery_notes' AND column_name='stock_confirmed_by') THEN
    ALTER TABLE delivery_notes ADD COLUMN stock_confirmed_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='delivery_notes' AND column_name='review_notes') THEN
    ALTER TABLE delivery_notes ADD COLUMN review_notes text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_delivery_notes_company_status
  ON delivery_notes(company_id, status);

CREATE OR REPLACE FUNCTION public.delivery_notes_auto_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'pending_company_review' AND OLD.status <> 'pending_company_review' AND NEW.delivered_at IS NULL THEN
      NEW.delivered_at := now();
    END IF;

    IF NEW.status = 'delivered' AND OLD.status <> 'delivered' AND NEW.delivered_at IS NULL THEN
      NEW.delivered_at := now();
    END IF;

    IF NEW.status = 'pending_stock_confirmation' AND OLD.status <> 'pending_stock_confirmation' AND NEW.company_reviewed_at IS NULL THEN
      NEW.company_reviewed_at := now();
    END IF;

    IF NEW.status = 'completed' AND OLD.status <> 'completed' THEN
      IF NEW.stock_confirmed_at IS NULL THEN NEW.stock_confirmed_at := now(); END IF;
      IF NEW.confirmed_at IS NULL THEN NEW.confirmed_at := now(); END IF;
      NEW.stock_posted := true;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
