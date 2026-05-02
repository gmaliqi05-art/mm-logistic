/*
  # Fix search_path for accounting sync triggers

  Two functions reference `company_has_logistics(uuid)` without qualifying
  the schema, but the helper actually lives in the `private` schema. Calls
  fail when those triggers fire in a clean session. Fully qualify the
  calls to make them robust.

  Functions fixed:
    - public.acc_products_seed_stock_row
    - public.acc_invoice_apply_stock_movement
*/

CREATE OR REPLACE FUNCTION public.acc_products_seed_stock_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_depot uuid;
BEGIN
  IF NEW.depot_category_id IS NULL THEN RETURN NEW; END IF;
  IF NOT private.company_has_logistics(NEW.company_id) THEN RETURN NEW; END IF;

  SELECT id INTO v_depot FROM depots
  WHERE company_id = NEW.company_id AND is_active = true
  ORDER BY created_at ASC LIMIT 1;

  IF v_depot IS NOT NULL THEN
    INSERT INTO stock(company_id, depot_id, category_id, condition, quantity)
    SELECT NEW.company_id, v_depot, NEW.depot_category_id, 'good', 0
    WHERE NOT EXISTS (
      SELECT 1 FROM stock
      WHERE company_id = NEW.company_id
        AND depot_id = v_depot
        AND category_id = NEW.depot_category_id
        AND condition = 'good'
    );
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public.acc_invoice_apply_stock_movement()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  it RECORD;
  v_cat uuid;
  v_stock_id uuid;
  v_qty integer;
BEGIN
  IF NEW.source_depot_id IS NULL THEN RETURN NEW; END IF;
  IF NOT private.company_has_logistics(NEW.company_id) THEN RETURN NEW; END IF;

  IF (TG_OP = 'UPDATE')
     AND COALESCE(OLD.status,'') <> 'sent'
     AND NEW.status = 'sent' THEN

    FOR it IN
      SELECT ii.product_id, ii.quantity, p.depot_category_id
      FROM acc_invoice_items ii
      LEFT JOIN acc_products p ON p.id = ii.product_id
      WHERE ii.invoice_id = NEW.id
    LOOP
      v_cat := it.depot_category_id;
      v_qty := COALESCE(it.quantity, 0)::integer;
      IF v_cat IS NULL OR v_qty <= 0 THEN CONTINUE; END IF;

      INSERT INTO stock_movements(
        company_id, depot_id, category_id, movement_type, quantity,
        condition_before, condition_after, notes, performed_by
      ) VALUES (
        NEW.company_id, NEW.source_depot_id, v_cat, 'exit', v_qty,
        'good', 'good',
        'Auto: shitje fature ' || COALESCE(NEW.invoice_number,''),
        COALESCE(NEW.dispatched_by, NEW.created_by)
      );

      SELECT id INTO v_stock_id
      FROM stock
      WHERE company_id = NEW.company_id
        AND depot_id = NEW.source_depot_id
        AND category_id = v_cat
        AND condition = 'good'
      LIMIT 1;

      IF v_stock_id IS NOT NULL THEN
        UPDATE stock
        SET quantity = GREATEST(0, quantity - v_qty), updated_at = now()
        WHERE id = v_stock_id;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END
$$;
