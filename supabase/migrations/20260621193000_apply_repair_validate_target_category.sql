/*
  # apply_repair_from_stock: reject target product from a different category

  The current RPC inserts new good stock with `category_id = v_stock.category_id`
  but `category_product_id = p_target_category_product_id`. If the caller
  passes a target product belonging to a different category, the new stock
  row ends up with a category_id that does not match its product's actual
  category — silently corrupting both stock and the depot_repairs log
  (product_name resolves from the target, category_id stays at the source).

  Add an explicit check: when the caller supplies a target product, its
  category_id must match the damaged stock's category_id. Albanian error
  message follows the existing RPC convention.
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
  v_stock        record;
  v_total        integer;
  v_good_id      uuid;
  v_actor        uuid := auth.uid();
  v_credit       uuid;
  v_target_name  text;
  v_target_cat   uuid;
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

  -- Validate the target product belongs to the same category as the
  -- damaged stock being repaired. Otherwise the new good-stock row would
  -- be created with a category_id that does not match its product.
  IF p_target_category_product_id IS NOT NULL THEN
    SELECT category_id, name INTO v_target_cat, v_target_name
    FROM category_products WHERE id = p_target_category_product_id;
    IF v_target_cat IS NULL THEN
      RAISE EXCEPTION 'Produkti i synuar nuk u gjet';
    END IF;
    IF v_stock.category_id IS NOT NULL AND v_target_cat <> v_stock.category_id THEN
      RAISE EXCEPTION 'Produkti i synuar nuk i takon kategorise se stokut defekt';
    END IF;
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
