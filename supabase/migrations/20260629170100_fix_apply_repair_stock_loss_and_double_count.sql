/*
  # Fix apply_repair_from_stock: stock loss + double-counted movements (A-C3)

  Two bugs in the live function:

  1. **Stock can be destroyed.** `v_total = repaired + scrapped` is always
     removed from the damaged stock row, but the good-stock re-add is guarded
     by `IF p_repaired_qty > 0 AND p_target_category_product_id IS NOT NULL`.
     So a call with `p_repaired_qty > 0` and NO target silently deletes the
     repaired pallets — they leave damaged stock and never arrive in good
     stock. (Both UI callers currently always pass a target, so this is
     latent, but a direct RPC call would corrupt stock.)

  2. **Movements double-counted.** The function always emitted a first
     `stock_movements` row of `movement_type='repair', quantity=v_total`
     (repaired + scrapped), THEN a per-repaired `repair` row and a
     per-scrapped `scrap` row. So repairs were counted twice and scrapped
     pallets were counted as BOTH repair and scrap — inflating every
     movement-based report.

  Fix:
  - Resolve the target once: use the supplied target when present (still
    validated to belong to the damaged row's category), otherwise default to
    the SOURCE product so repaired pallets always return to good stock and can
    never be lost.
  - Re-add repaired pallets to good stock whenever `p_repaired_qty > 0`
    (no longer gated on a non-null target).
  - Emit exactly one movement per outcome: one `repair` row of
    `p_repaired_qty` and one `scrap` row of `p_scrapped_qty`. The phantom
    aggregate `v_total` repair row is removed.

  Historical `stock_movements` rows written before this migration are an audit
  trail and are intentionally NOT rewritten; movement-based repair reports may
  be inflated for pre-fix data. Error messages stay Albanian (per project
  convention). SECURITY INVOKER + search_path unchanged.
*/

CREATE OR REPLACE FUNCTION public.apply_repair_from_stock(
  p_stock_id uuid,
  p_repaired_qty integer DEFAULT 0,
  p_scrapped_qty integer DEFAULT 0,
  p_target_category_product_id uuid DEFAULT NULL::uuid,
  p_worker_id uuid DEFAULT NULL::uuid
)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_stock        record;
  v_total        integer;
  v_good_id      uuid;
  v_actor        uuid := auth.uid();
  v_credit       uuid;
  v_target       uuid;
  v_target_cat   uuid;
  v_target_name  text;
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

  -- Resolve the good-stock target. When a target is supplied, validate it
  -- belongs to the damaged row's category. When omitted, default to the
  -- source product so repaired pallets can never be lost.
  IF p_target_category_product_id IS NOT NULL THEN
    SELECT category_id, name INTO v_target_cat, v_target_name
    FROM category_products WHERE id = p_target_category_product_id;
    IF v_target_cat IS NULL THEN
      RAISE EXCEPTION 'Produkti i synuar nuk u gjet';
    END IF;
    IF v_stock.category_id IS NOT NULL AND v_target_cat <> v_stock.category_id THEN
      RAISE EXCEPTION 'Produkti i synuar nuk i takon kategorise se stokut defekt';
    END IF;
    v_target := p_target_category_product_id;
  ELSE
    v_target := v_stock.category_product_id;
  END IF;
  v_target_name := COALESCE(v_target_name, (SELECT name FROM category_products WHERE id = v_target), '');

  -- Remove repaired + scrapped from the damaged pool.
  UPDATE stock
  SET    quantity = quantity - v_total, updated_at = now()
  WHERE  id = p_stock_id;

  -- Repaired pallets return to good stock under the resolved target.
  IF COALESCE(p_repaired_qty, 0) > 0 THEN
    SELECT id INTO v_good_id FROM stock
    WHERE company_id = v_stock.company_id
      AND depot_id   = v_stock.depot_id
      AND category_id = v_stock.category_id
      AND category_product_id = v_target
      AND condition  = 'good'
    LIMIT 1
    FOR UPDATE;

    IF v_good_id IS NULL THEN
      INSERT INTO stock (company_id, depot_id, category_id, category_product_id, condition, quantity, updated_at, created_at)
      VALUES (v_stock.company_id, v_stock.depot_id, v_stock.category_id, v_target, 'good', p_repaired_qty, now(), now());
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
      v_target,
      'repair', p_repaired_qty, 'damaged', 'good',
      'Palet te reparuara -> stok (te mira)', v_actor, now()
    );
  END IF;

  -- Scrapped pallets: one scrap movement, no good-stock add.
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

  INSERT INTO depot_repairs (
    company_id, depot_id, category_id, category_product_id,
    quantity_in, quantity_repaired, quantity_scrapped,
    worker_id, opened_by, notes, product_name, stock_synced
  ) VALUES (
    v_stock.company_id, v_stock.depot_id, v_stock.category_id,
    v_target,
    v_total, COALESCE(p_repaired_qty, 0), COALESCE(p_scrapped_qty, 0),
    v_credit, v_actor,
    'Reparim direkt nga stoku',
    v_target_name,
    true
  );
END;
$function$;
