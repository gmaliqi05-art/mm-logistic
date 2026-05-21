/*
  # Create apply_repair_from_stock RPC

  1. New Function
    - `apply_repair_from_stock(p_stock_id, p_repaired_qty, p_scrapped_qty, p_target_category_product_id, p_worker_id)`
    - Works directly with the stock table instead of depot_repairs
    - Decrements damaged stock, increments good stock for repaired items
    - Records stock_movements for traceability
    - Logs a depot_repairs row for worker productivity tracking

  2. Parameters
    - p_stock_id: The damaged stock row to repair from
    - p_repaired_qty: Number of pallets repaired
    - p_scrapped_qty: Number of pallets scrapped
    - p_target_category_product_id: Target product for repaired items (e.g., Klasse A)
    - p_worker_id: The repair worker who performed the work

  3. Security
    - SECURITY INVOKER: runs with the caller's permissions
    - Validates quantities don't exceed available damaged stock
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
BEGIN
  SELECT * INTO v_stock FROM stock WHERE id = p_stock_id;
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

  -- Decrement damaged stock
  UPDATE stock
  SET    quantity = quantity - v_total, updated_at = now()
  WHERE  id = p_stock_id;

  -- Record the repair movement
  INSERT INTO stock_movements (
    company_id, depot_id, category_id, category_product_id,
    movement_type, quantity, condition_before, condition_after,
    notes, performed_by, created_at
  ) VALUES (
    v_stock.company_id, v_stock.depot_id, v_stock.category_id,
    v_stock.category_product_id,
    'repair', v_total, 'damaged', 'good',
    'Reparim i raportuar nga stoku', v_actor, now()
  );

  -- Add repaired items to good stock
  IF COALESCE(p_repaired_qty, 0) > 0 AND p_target_category_product_id IS NOT NULL THEN
    SELECT id INTO v_good_id FROM stock
    WHERE company_id = v_stock.company_id
      AND depot_id   = v_stock.depot_id
      AND category_id = v_stock.category_id
      AND category_product_id = p_target_category_product_id
      AND condition  = 'good'
    LIMIT 1;

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
      'Palet te reparuara -> stok (te mira)', v_actor, now()
    );
  END IF;

  -- Record scrapped items
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

  -- Log for worker productivity tracking
  INSERT INTO depot_repairs (
    company_id, depot_id, category_id, category_product_id,
    quantity_in, quantity_repaired, quantity_scrapped,
    worker_id, opened_by, notes, product_name
  ) VALUES (
    v_stock.company_id, v_stock.depot_id, v_stock.category_id,
    v_stock.category_product_id,
    v_total, COALESCE(p_repaired_qty, 0), COALESCE(p_scrapped_qty, 0),
    v_credit, v_actor,
    'Reparim direkt nga stoku',
    COALESCE((SELECT name FROM category_products WHERE id = v_stock.category_product_id), '')
  );
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.apply_repair_from_stock TO authenticated;
