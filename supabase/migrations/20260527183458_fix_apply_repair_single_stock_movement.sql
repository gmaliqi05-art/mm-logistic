/*
  # Remove duplicate stock movement from apply_repair_from_stock

  1. Modified Functions
    - `apply_repair_from_stock` — removed the first INSERT INTO stock_movements
      (lines 69-78) that logged a category-level "deduct from damaged" movement.
      Only the product-level movement that records the repaired items going into
      good stock is kept. This eliminates the duplicate "Euro Paletten" entries
      appearing in the movement history alongside the actual product entries
      (Klasse A, Klasse B, etc.).

  2. Important Notes
    - The deduction from damaged stock still happens (UPDATE stock SET quantity).
    - Only the redundant stock_movements log row is removed.
    - Scrap movement logging is unchanged.
*/

CREATE OR REPLACE FUNCTION public.apply_repair_from_stock(
  p_stock_id uuid,
  p_repaired_qty integer DEFAULT 0,
  p_scrapped_qty integer DEFAULT 0,
  p_target_category_product_id uuid DEFAULT NULL,
  p_worker_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_stock    record;
  v_total    integer;
  v_good_id  uuid;
  v_actor    uuid := auth.uid();
  v_credit   uuid;
  v_target_name text;
BEGIN
  SELECT * INTO v_stock FROM stock WHERE id = p_stock_id FOR UPDATE;
  IF v_stock IS NULL THEN
    RAISE EXCEPTION 'Stock row not found';
  END IF;
  IF v_stock.condition <> 'damaged' THEN
    RAISE EXCEPTION 'Stock row is not damaged condition';
  END IF;

  v_total := COALESCE(p_repaired_qty, 0) + COALESCE(p_scrapped_qty, 0);
  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Asnje sasi per te raportuar';
  END IF;
  IF v_total > v_stock.quantity THEN
    RAISE EXCEPTION 'Sasia tejkalon stokun e disponueshem defekt (%)' , v_stock.quantity;
  END IF;

  v_credit := COALESCE(p_worker_id, v_actor);

  IF p_target_category_product_id IS NOT NULL THEN
    SELECT name INTO v_target_name FROM category_products WHERE id = p_target_category_product_id;
  END IF;
  v_target_name := COALESCE(v_target_name, (SELECT name FROM category_products WHERE id = v_stock.category_product_id), '');

  -- Deduct from damaged stock
  UPDATE stock
  SET    quantity = quantity - v_total, updated_at = now()
  WHERE  id = p_stock_id;

  -- Add to good stock and log single movement
  IF COALESCE(p_repaired_qty, 0) > 0 AND p_target_category_product_id IS NOT NULL THEN
    SELECT id INTO v_good_id FROM stock
    WHERE company_id = v_stock.company_id
      AND depot_id   = v_stock.depot_id
      AND category_id = v_stock.category_id
      AND category_product_id = p_target_category_product_id
      AND condition  = 'good'
    LIMIT 1
    FOR UPDATE;

    IF v_good_id IS NULL THEN
      INSERT INTO stock (company_id, depot_id, category_id, category_product_id, condition, quantity, updated_at, created_at)
      VALUES (v_stock.company_id, v_stock.depot_id, v_stock.category_id, p_target_category_product_id, 'good', p_repaired_qty, now(), now());
    ELSE
      UPDATE stock SET quantity = quantity + p_repaired_qty, updated_at = now()
      WHERE id = v_good_id;
    END IF;

    INSERT INTO stock_movements (
      company_id, depot_id, category_id, category_product_id,
      movement_type, quantity, condition_before, condition_after,
      notes, performed_by, created_at
    ) VALUES (
      v_stock.company_id, v_stock.depot_id, v_stock.category_id,
      p_target_category_product_id,
      'repair', p_repaired_qty, 'damaged', 'good',
      v_target_name || ' — reparim nga stoku defekt', v_actor, now()
    );
  END IF;

  -- Log scrapped
  IF COALESCE(p_scrapped_qty, 0) > 0 THEN
    INSERT INTO stock_movements (
      company_id, depot_id, category_id, category_product_id,
      movement_type, quantity, condition_before, condition_after,
      notes, performed_by, created_at
    ) VALUES (
      v_stock.company_id, v_stock.depot_id, v_stock.category_id,
      v_stock.category_product_id,
      'scrap', p_scrapped_qty, 'damaged', 'damaged',
      'Hedhur si scrap', v_actor, now()
    );
  END IF;

  -- Log depot_repairs
  INSERT INTO depot_repairs (
    company_id, depot_id, category_id, category_product_id,
    quantity_in, quantity_repaired, quantity_scrapped,
    worker_id, opened_by, notes, product_name, stock_synced
  ) VALUES (
    v_stock.company_id, v_stock.depot_id, v_stock.category_id,
    COALESCE(p_target_category_product_id, v_stock.category_product_id),
    v_total, COALESCE(p_repaired_qty, 0), COALESCE(p_scrapped_qty, 0),
    v_credit, v_actor,
    'Reparim direkt nga stoku',
    v_target_name,
    true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_repair_from_stock TO authenticated;
