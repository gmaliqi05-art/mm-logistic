/*
  # Unifikim i stokut: stock si burim i vetem i se vertetes

  ## Permbledhje
  Heq dyfishimin mes `stock` (tabela fizike per cdo depo/kondite) dhe
  `acc_products.current_stock` (totali i kontabilitetit). Tani
  `acc_products.current_stock` rifreskohet automatikisht nga nje trigger
  mbi tabelen `stock`, duke marrur si burim `SUM(stock.quantity)` per
  `category_product_id` perkates.

  ## Ndryshime
  1. `acc_handle_purchase_stock()` dhe `acc_handle_invoice_stock()` nuk
     azhornojne me `acc_products.current_stock`. Mbajne vetem log-in ne
     `acc_stock_movements` per gjurmueshmeri kontabel.
  2. Funksion i ri `public.refresh_acc_product_stock(p_product_id uuid)`
     rillogarit `current_stock` nga tabela `stock` per nje produkt.
  3. Trigger `trg_stock_sync_acc_product` mbi `stock` (INSERT/UPDATE/DELETE)
     qe thirr funksionin automatikisht per produktin e prekur.
  4. Backfill njehere per te rreshtuar te dy burimet e te dhenave.

  ## Siguria
  - SECURITY DEFINER me search_path = public
  - Nuk prek RLS
*/

-- 1) Funksion i ri rifreskimi
CREATE OR REPLACE FUNCTION public.refresh_acc_product_stock(p_product_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_product_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE acc_products ap
    SET current_stock = COALESCE((
      SELECT SUM(s.quantity) FROM stock s WHERE s.category_product_id = p_product_id
    ), 0),
    updated_at = now()
  WHERE ap.id = p_product_id;
END;
$$;

-- 2) Trigger mbi stock
CREATE OR REPLACE FUNCTION public.stock_sync_acc_product()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_acc_product_stock(OLD.category_product_id);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.category_product_id IS DISTINCT FROM OLD.category_product_id THEN
      PERFORM public.refresh_acc_product_stock(OLD.category_product_id);
    END IF;
    PERFORM public.refresh_acc_product_stock(NEW.category_product_id);
    RETURN NEW;
  ELSE
    PERFORM public.refresh_acc_product_stock(NEW.category_product_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_stock_sync_acc_product ON stock;
CREATE TRIGGER trg_stock_sync_acc_product
  AFTER INSERT OR UPDATE OR DELETE ON stock
  FOR EACH ROW EXECUTE FUNCTION public.stock_sync_acc_product();

-- 3) Rishkrim i acc_handle_purchase_stock: hiq UPDATE current_stock
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
    FOR item IN
      SELECT pi.product_id, pi.quantity, pi.unit_price
      FROM acc_purchase_items pi
      WHERE pi.purchase_id = NEW.id AND pi.product_id IS NOT NULL
    LOOP
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
      INSERT INTO acc_stock_movements (company_id, product_id, movement_type, quantity, unit_price, reference_type, reference_id, notes, created_by)
      VALUES (NEW.company_id, item.product_id, 'out', item.quantity, item.unit_price, 'purchase', NEW.id, 'Auto: Anulim blerje ' || NEW.purchase_number, NEW.created_by);
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

-- 4) Rishkrim i acc_handle_invoice_stock: hiq UPDATE current_stock
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
    FOR item IN
      SELECT ii.product_id, ii.quantity, ii.unit_price
      FROM acc_invoice_items ii
      WHERE ii.invoice_id = NEW.id AND ii.product_id IS NOT NULL
    LOOP
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
      INSERT INTO acc_stock_movements (company_id, product_id, movement_type, quantity, unit_price, reference_type, reference_id, notes, created_by)
      VALUES (NEW.company_id, item.product_id, 'return', item.quantity, item.unit_price, 'invoice', NEW.id, 'Auto: Anulim fature ' || NEW.invoice_number, NEW.created_by);
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

-- 5) Backfill: rillogarit per te gjithe produktet me category_product lidhje
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
