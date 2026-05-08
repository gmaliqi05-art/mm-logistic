/*
  # Fix double-decrement of acc_products.current_stock

  ## Problem
  Migration 20260505100353_harden_sale_lifecycle.sql re-introduced direct
  `UPDATE acc_products SET current_stock = current_stock - ...` calls inside
  `acc_handle_invoice_stock()`. Since migration 20260505085341 made
  `trg_stock_sync_acc_product` on the physical `stock` table the single
  writer of `acc_products.current_stock` (recomputed via SUM), the invoice
  status change now subtracts stock twice:
    1) physical stock decrement via delivery note confirmation ->
       `trg_stock_sync_acc_product` refreshes current_stock from SUM(stock)
    2) `acc_handle_invoice_stock` additionally subtracts item.quantity

  ## Fix
  Rewrite `acc_handle_invoice_stock()` and `acc_handle_purchase_stock()` to
  be LOG-ONLY (insert into `acc_stock_movements` for traceability) and to
  maintain idempotency via `stock_posted_at`. They must not mutate
  `acc_products.current_stock` - that column is owned exclusively by
  `trg_stock_sync_acc_product` on the `stock` table.

  ## Changes
  1. `acc_handle_invoice_stock()` rewritten:
     - Log-only into acc_stock_movements
     - Idempotency via stock_posted_at (skip if set; set after first post)
     - Cancellation path also logs only; resets stock_posted_at so reversal
       can be re-posted if the invoice is later re-sent
  2. `acc_handle_purchase_stock()` rewritten for symmetry + idempotency
     (previously log-only but without stock_posted_at guard)
  3. One-shot normalization:
     - Re-sync acc_products.current_stock from SUM(stock.quantity)
     - Backfill stock_posted_at on already-posted invoices/purchases to
       prevent duplicate log rows if triggers somehow re-fire

  ## Safety
  - SECURITY DEFINER with search_path = public
  - CREATE OR REPLACE keeps existing trigger bindings intact
  - Idempotent: safe to run multiple times
*/

-- 1) Log-only invoice stock handler with idempotency
CREATE OR REPLACE FUNCTION public.acc_handle_invoice_stock()
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
      INSERT INTO acc_stock_movements (
        company_id, product_id, movement_type, quantity, unit_price,
        reference_type, reference_id, notes, created_by
      )
      VALUES (
        NEW.company_id, item.product_id, 'out', item.quantity, item.unit_price,
        'invoice', NEW.id, 'Auto: Fature ' || NEW.invoice_number, NEW.created_by
      );
    END LOOP;
    UPDATE acc_invoices SET stock_posted_at = now()
      WHERE id = NEW.id AND stock_posted_at IS NULL;
  END IF;

  IF OLD.status = 'draft' AND NEW.status IN ('sent', 'paid') AND NEW.invoice_type = 'credit_note' THEN
    FOR item IN
      SELECT ii.product_id, ii.quantity, ii.unit_price
      FROM acc_invoice_items ii
      WHERE ii.invoice_id = NEW.id AND ii.product_id IS NOT NULL
    LOOP
      INSERT INTO acc_stock_movements (
        company_id, product_id, movement_type, quantity, unit_price,
        reference_type, reference_id, notes, created_by
      )
      VALUES (
        NEW.company_id, item.product_id, 'return', item.quantity, item.unit_price,
        'credit_note', NEW.id, 'Auto: Note kreditimi ' || NEW.invoice_number, NEW.created_by
      );
    END LOOP;
  END IF;

  IF NEW.status = 'cancelled' AND OLD.status IN ('sent', 'paid', 'partial', 'overdue') AND NEW.invoice_type = 'invoice' THEN
    FOR item IN
      SELECT ii.product_id, ii.quantity, ii.unit_price
      FROM acc_invoice_items ii
      WHERE ii.invoice_id = NEW.id AND ii.product_id IS NOT NULL
    LOOP
      INSERT INTO acc_stock_movements (
        company_id, product_id, movement_type, quantity, unit_price,
        reference_type, reference_id, notes, created_by
      )
      VALUES (
        NEW.company_id, item.product_id, 'return', item.quantity, item.unit_price,
        'invoice', NEW.id, 'Auto: Anulim fature ' || NEW.invoice_number, NEW.created_by
      );
    END LOOP;
    UPDATE acc_invoices SET stock_posted_at = NULL WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

-- 2) Log-only purchase stock handler with idempotency
CREATE OR REPLACE FUNCTION public.acc_handle_purchase_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item RECORD;
BEGIN
  IF OLD.status = 'draft' AND NEW.status IN ('received', 'paid') THEN
    IF NEW.stock_posted_at IS NOT NULL THEN
      RETURN NEW;
    END IF;
    FOR item IN
      SELECT pi.product_id, pi.quantity, pi.unit_price
      FROM acc_purchase_items pi
      WHERE pi.purchase_id = NEW.id AND pi.product_id IS NOT NULL
    LOOP
      INSERT INTO acc_stock_movements (
        company_id, product_id, movement_type, quantity, unit_price,
        reference_type, reference_id, notes, created_by
      )
      VALUES (
        NEW.company_id, item.product_id, 'in', item.quantity, item.unit_price,
        'purchase', NEW.id, 'Auto: Blerje ' || NEW.purchase_number, NEW.created_by
      );
    END LOOP;
    UPDATE acc_purchases SET stock_posted_at = now()
      WHERE id = NEW.id AND stock_posted_at IS NULL;
  END IF;

  IF NEW.status = 'cancelled' AND OLD.status IN ('received', 'paid', 'overdue') THEN
    FOR item IN
      SELECT pi.product_id, pi.quantity, pi.unit_price
      FROM acc_purchase_items pi
      WHERE pi.purchase_id = NEW.id AND pi.product_id IS NOT NULL
    LOOP
      INSERT INTO acc_stock_movements (
        company_id, product_id, movement_type, quantity, unit_price,
        reference_type, reference_id, notes, created_by
      )
      VALUES (
        NEW.company_id, item.product_id, 'out', item.quantity, item.unit_price,
        'purchase', NEW.id, 'Auto: Anulim blerje ' || NEW.purchase_number, NEW.created_by
      );
    END LOOP;
    UPDATE acc_purchases SET stock_posted_at = NULL WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

-- 3) Backfill stock_posted_at on already-posted invoices/purchases
UPDATE acc_invoices
  SET stock_posted_at = COALESCE(stock_posted_at, updated_at, now())
  WHERE invoice_type = 'invoice'
    AND status IN ('sent', 'paid', 'partial', 'overdue')
    AND stock_posted_at IS NULL;

UPDATE acc_purchases
  SET stock_posted_at = COALESCE(stock_posted_at, updated_at, now())
  WHERE status IN ('received', 'paid', 'overdue')
    AND stock_posted_at IS NULL;

-- 4) Normalize acc_products.current_stock from physical stock (single source of truth)
UPDATE acc_products ap
SET current_stock = COALESCE(s.total, 0),
    updated_at = now()
FROM (
  SELECT category_product_id, SUM(quantity) AS total
  FROM stock
  WHERE category_product_id IS NOT NULL
  GROUP BY category_product_id
) s
WHERE ap.id = s.category_product_id;
