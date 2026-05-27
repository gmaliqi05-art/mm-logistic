/*
  # Fix apply_repair_from_stock: set stock_synced and target product

  1. Modified Functions
    - `apply_repair_from_stock` — now sets `stock_synced = true` on the
      depot_repairs row it creates, and stores the TARGET product id
      (`p_target_category_product_id`) instead of the source row's
      (which may be NULL for category-level damaged stock).
    - Also resolves the product_name from the target product, not the source.

  2. Important Notes
    - Previously the RPC correctly modified stock but left
      `stock_synced = false` and `category_product_id = null`
      on the depot_repairs log row, making it appear as if
      stock was never touched.
    - No permission changes; function retains SECURITY INVOKER and
      existing GRANTs.
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

  -- Resolve target product name
  IF p_target_category_product_id IS NOT NULL THEN
    SELECT name INTO v_target_name FROM category_products WHERE id = p_target_category_product_id;
  END IF;
  v_target_name := COALESCE(v_target_name, (SELECT name FROM category_products WHERE id = v_stock.category_product_id), '');

  -- Deduct from damaged stock
  UPDATE stock
  SET    quantity = quantity - v_total, updated_at = now()
  WHERE  id = p_stock_id;

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

  -- Add to good stock
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
      'Palet te reparuara -> stok (te mira)', v_actor, now()
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

  -- Log depot_repairs with stock_synced = true and target product
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
