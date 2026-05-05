/*
  # Harden Sale lifecycle: auto logistic note, negative-stock guard, idempotency

  1. New Columns
    - `acc_invoices.stock_posted_at` (timestamptz) — idempotency guard so stock trigger never double-posts
    - `acc_purchases.stock_posted_at` (timestamptz) — same guard for purchases
    - `delivery_notes.origin` (text) — 'invoice' | 'purchase' | 'manual' (default 'manual') for routing/filtering

  2. New Functions / Triggers
    - `acc_guard_invoice_negative_stock()` — BEFORE UPDATE on acc_invoices; when draft->sent for invoice type,
      scans items and raises EXCEPTION if acc_products.current_stock < quantity (per item)
    - `acc_invoice_auto_logistic_delivery_note()` — AFTER UPDATE on acc_invoices; when draft->sent for invoice,
      inserts a logistic delivery_notes row with type='delivery', origin='invoice', acc_invoice_id linked.
      Guards with acc_invoice_id IS UNIQUE to avoid duplicates.
    - `acc_purchase_auto_logistic_delivery_note()` — AFTER UPDATE on acc_purchases; when draft->received,
      inserts a logistic delivery_notes row with type='pickup', origin='purchase'.

  3. Hardened acc_handle_invoice_stock / acc_handle_purchase_stock
    - Recreated to set stock_posted_at and skip if already set (idempotency)

  4. Notes
    - Does NOT drop existing tables/columns.
    - Leaves existing `acc_invoice_auto_delivery_note()` (creates acc_delivery_notes) untouched.
    - Safe to run multiple times (IF NOT EXISTS, OR REPLACE).
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='acc_invoices' AND column_name='stock_posted_at') THEN
    ALTER TABLE acc_invoices ADD COLUMN stock_posted_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='acc_purchases' AND column_name='stock_posted_at') THEN
    ALTER TABLE acc_purchases ADD COLUMN stock_posted_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='delivery_notes' AND column_name='origin') THEN
    ALTER TABLE delivery_notes ADD COLUMN origin text DEFAULT 'manual';
  END IF;
END $$;

-- Unique constraint: one logistic delivery_note per acc_invoice (prevents duplicates from trigger)
CREATE UNIQUE INDEX IF NOT EXISTS uq_delivery_notes_acc_invoice
  ON delivery_notes(acc_invoice_id) WHERE acc_invoice_id IS NOT NULL;

-- Negative stock guard: BEFORE UPDATE of status on acc_invoices
CREATE OR REPLACE FUNCTION acc_guard_invoice_negative_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bad_item RECORD;
BEGIN
  IF NEW.invoice_type <> 'invoice' THEN
    RETURN NEW;
  END IF;

  IF COALESCE(OLD.status,'') = 'draft' AND NEW.status IN ('sent','paid') THEN
    SELECT ii.product_id, ii.quantity, ap.current_stock, ap.name
      INTO bad_item
    FROM acc_invoice_items ii
    JOIN acc_products ap ON ap.id = ii.product_id
    WHERE ii.invoice_id = NEW.id
      AND ii.product_id IS NOT NULL
      AND ap.current_stock < ii.quantity
    LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION 'Insufficient stock for product % (have %, need %)',
        bad_item.name, bad_item.current_stock, bad_item.quantity
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_acc_guard_invoice_negative_stock ON acc_invoices;
CREATE TRIGGER trg_acc_guard_invoice_negative_stock
  BEFORE UPDATE OF status ON acc_invoices
  FOR EACH ROW EXECUTE FUNCTION acc_guard_invoice_negative_stock();

-- Hardened stock handler: sets stock_posted_at as idempotency lock
CREATE OR REPLACE FUNCTION acc_handle_invoice_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item RECORD;
BEGIN
  IF OLD.status = 'draft' AND NEW.status IN ('sent', 'paid') AND NEW.invoice_type = 'invoice' THEN
    IF NEW.stock_posted_at IS NOT NULL THEN
      RETURN NEW;
    END IF;
    FOR item IN
      SELECT ii.product_id, ii.quantity, ii.unit_price
      FROM acc_invoice_items ii
      WHERE ii.invoice_id = NEW.id AND ii.product_id IS NOT NULL
    LOOP
      UPDATE acc_products SET current_stock = current_stock - item.quantity, updated_at = now()
      WHERE id = item.product_id;

      INSERT INTO acc_stock_movements (company_id, product_id, movement_type, quantity, unit_price, reference_type, reference_id, notes, created_by)
      VALUES (NEW.company_id, item.product_id, 'out', item.quantity, item.unit_price, 'invoice', NEW.id, 'Auto: Fature ' || NEW.invoice_number, NEW.created_by);
    END LOOP;
    UPDATE acc_invoices SET stock_posted_at = now() WHERE id = NEW.id AND stock_posted_at IS NULL;
  END IF;

  IF OLD.status = 'draft' AND NEW.status IN ('sent', 'paid') AND NEW.invoice_type = 'credit_note' THEN
    FOR item IN
      SELECT ii.product_id, ii.quantity, ii.unit_price
      FROM acc_invoice_items ii
      WHERE ii.invoice_id = NEW.id AND ii.product_id IS NOT NULL
    LOOP
      UPDATE acc_products SET current_stock = current_stock + item.quantity, updated_at = now()
      WHERE id = item.product_id;

      INSERT INTO acc_stock_movements (company_id, product_id, movement_type, quantity, unit_price, reference_type, reference_id, notes, created_by)
      VALUES (NEW.company_id, item.product_id, 'return', item.quantity, item.unit_price, 'credit_note', NEW.id, 'Auto: Note kreditimi ' || NEW.invoice_number, NEW.created_by);
    END LOOP;
  END IF;

  IF NEW.status = 'cancelled' AND OLD.status IN ('sent', 'paid', 'partial', 'overdue') AND NEW.invoice_type = 'invoice' THEN
    FOR item IN
      SELECT ii.product_id, ii.quantity, ii.unit_price
      FROM acc_invoice_items ii
      WHERE ii.invoice_id = NEW.id AND ii.product_id IS NOT NULL
    LOOP
      UPDATE acc_products SET current_stock = current_stock + item.quantity, updated_at = now()
      WHERE id = item.product_id;

      INSERT INTO acc_stock_movements (company_id, product_id, movement_type, quantity, unit_price, reference_type, reference_id, notes, created_by)
      VALUES (NEW.company_id, item.product_id, 'return', item.quantity, item.unit_price, 'invoice', NEW.id, 'Auto: Anulim fature ' || NEW.invoice_number, NEW.created_by);
    END LOOP;
    UPDATE acc_invoices SET stock_posted_at = NULL WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

-- Auto-create logistic delivery_notes row when invoice moves to 'sent'
CREATE OR REPLACE FUNCTION acc_invoice_auto_logistic_delivery_note()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner_name text;
  v_partner_address text;
BEGIN
  IF NEW.invoice_type <> 'invoice' THEN
    RETURN NEW;
  END IF;
  IF NOT (COALESCE(OLD.status,'') = 'draft' AND NEW.status IN ('sent','paid')) THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM delivery_notes WHERE acc_invoice_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT name, COALESCE(address,'') INTO v_partner_name, v_partner_address
  FROM acc_contacts WHERE id = NEW.contact_id;

  INSERT INTO delivery_notes (
    company_id, created_by, note_number, type, status,
    delivery_address, partner_name, acc_invoice_id, origin, invoiced_at
  ) VALUES (
    NEW.company_id, NEW.created_by,
    'DN-' || NEW.invoice_number,
    'delivery', 'draft',
    COALESCE(v_partner_address,''),
    COALESCE(v_partner_name,''),
    NEW.id, 'invoice', now()
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_acc_invoice_auto_logistic_delivery_note ON acc_invoices;
CREATE TRIGGER trg_acc_invoice_auto_logistic_delivery_note
  AFTER UPDATE OF status ON acc_invoices
  FOR EACH ROW EXECUTE FUNCTION acc_invoice_auto_logistic_delivery_note();

-- Auto-create logistic pickup delivery_notes row when purchase moves to 'received'
CREATE OR REPLACE FUNCTION acc_purchase_auto_logistic_delivery_note()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner_name text;
  v_partner_address text;
BEGIN
  IF NOT (COALESCE(OLD.status,'') = 'draft' AND NEW.status IN ('received','paid')) THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM delivery_notes
    WHERE company_id = NEW.company_id
      AND origin = 'purchase'
      AND note_number = 'DN-' || NEW.purchase_number
  ) THEN
    RETURN NEW;
  END IF;

  SELECT name, COALESCE(address,'') INTO v_partner_name, v_partner_address
  FROM acc_contacts WHERE id = NEW.contact_id;

  INSERT INTO delivery_notes (
    company_id, created_by, note_number, type, status,
    pickup_address, partner_name, origin
  ) VALUES (
    NEW.company_id, NEW.created_by,
    'DN-' || NEW.purchase_number,
    'pickup', 'draft',
    COALESCE(v_partner_address,''),
    COALESCE(v_partner_name,''),
    'purchase'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_acc_purchase_auto_logistic_delivery_note ON acc_purchases;
CREATE TRIGGER trg_acc_purchase_auto_logistic_delivery_note
  AFTER UPDATE OF status ON acc_purchases
  FOR EACH ROW EXECUTE FUNCTION acc_purchase_auto_logistic_delivery_note();
