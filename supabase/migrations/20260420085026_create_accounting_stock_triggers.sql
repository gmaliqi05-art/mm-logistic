/*
  # Accounting Stock Trigger Functions

  1. Functions
    - `acc_handle_invoice_stock()` - When invoice status changes to sent/paid, deduct stock
    - `acc_handle_purchase_stock()` - When purchase status changes to received/paid, add stock
    - `acc_handle_invoice_cancel()` - When invoice cancelled, return stock
    - `acc_handle_purchase_cancel()` - When purchase cancelled, deduct stock

  2. Triggers
    - On acc_invoices UPDATE for status changes
    - On acc_purchases UPDATE for status changes

  3. Notes
    - Stock movements are recorded automatically
    - Only items with product_id are affected
    - Each trigger checks previous status to avoid double-processing
*/

-- Invoice stock deduction: when status goes from draft -> sent or paid
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
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_acc_invoice_stock
  AFTER UPDATE OF status ON acc_invoices
  FOR EACH ROW
  EXECUTE FUNCTION acc_handle_invoice_stock();

-- Purchase stock addition: when status goes from draft -> received or paid
CREATE OR REPLACE FUNCTION acc_handle_purchase_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item RECORD;
BEGIN
  IF OLD.status = 'draft' AND NEW.status IN ('received', 'paid') THEN
    FOR item IN
      SELECT pi.product_id, pi.quantity, pi.unit_price
      FROM acc_purchase_items pi
      WHERE pi.purchase_id = NEW.id AND pi.product_id IS NOT NULL
    LOOP
      UPDATE acc_products SET current_stock = current_stock + item.quantity, updated_at = now()
      WHERE id = item.product_id;

      INSERT INTO acc_stock_movements (company_id, product_id, movement_type, quantity, unit_price, reference_type, reference_id, notes, created_by)
      VALUES (NEW.company_id, item.product_id, 'in', item.quantity, item.unit_price, 'purchase', NEW.id, 'Auto: Blerje ' || NEW.purchase_number, NEW.created_by);
    END LOOP;
  END IF;

  IF NEW.status = 'cancelled' AND OLD.status IN ('received', 'paid', 'overdue') THEN
    FOR item IN
      SELECT pi.product_id, pi.quantity, pi.unit_price
      FROM acc_purchase_items pi
      WHERE pi.purchase_id = NEW.id AND pi.product_id IS NOT NULL
    LOOP
      UPDATE acc_products SET current_stock = current_stock - item.quantity, updated_at = now()
      WHERE id = item.product_id;

      INSERT INTO acc_stock_movements (company_id, product_id, movement_type, quantity, unit_price, reference_type, reference_id, notes, created_by)
      VALUES (NEW.company_id, item.product_id, 'out', item.quantity, item.unit_price, 'purchase', NEW.id, 'Auto: Anulim blerje ' || NEW.purchase_number, NEW.created_by);
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_acc_purchase_stock
  AFTER UPDATE OF status ON acc_purchases
  FOR EACH ROW
  EXECUTE FUNCTION acc_handle_purchase_stock();
