/*
  # Repair Completion: Repaired Items Go to 'good' Stock

  1. Changes
    - Modify `apply_repair_completion` RPC so repaired pallets are inserted/updated 
      with condition='good' (ready for sale) instead of 'repaired'
    - The evidence of repair is preserved in:
      - `stock_movements` table (movement_type='repair', condition_before='damaged', condition_after='good')
      - `depot_repairs` table (quantity_repaired counter)
      - `depot_repair_reports` table (full daily reports)
    - Companies retain full visibility into how many pallets were repaired

  2. Logic Change
    - Previously: damaged -> repaired (separate stock category)
    - Now: damaged -> good (merged into sellable stock)
    - Stock movements still record the repair transition for reporting

  3. Security
    - Same SECURITY DEFINER permissions as before
    - Revoked from PUBLIC, granted to authenticated and service_role
*/

CREATE OR REPLACE FUNCTION public.apply_repair_completion(
  p_repair_id uuid,
  p_repaired_qty integer,
  p_scrapped_qty integer,
  p_target_category_product_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_repair record;
  v_total integer;
  v_damaged_row record;
  v_good_id uuid;
BEGIN
  SELECT * INTO v_repair FROM depot_repairs WHERE id = p_repair_id;
  IF v_repair IS NULL THEN RAISE EXCEPTION 'Repair not found'; END IF;

  v_total := coalesce(p_repaired_qty,0) + coalesce(p_scrapped_qty,0);
  IF v_total <= 0 THEN RAISE EXCEPTION 'Asnje sasi per te raportuar'; END IF;
  IF coalesce(v_repair.quantity_repaired,0) + coalesce(v_repair.quantity_scrapped,0) + v_total
     > coalesce(v_repair.quantity_in,0) THEN
    RAISE EXCEPTION 'Sasia tejkalon totalin e pritur ne reparature';
  END IF;

  -- Decrement damaged stock
  SELECT * INTO v_damaged_row FROM stock
    WHERE company_id = v_repair.company_id
      AND depot_id = v_repair.depot_id
      AND category_id = v_repair.category_id
      AND condition = 'damaged'
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1;

  IF v_damaged_row.id IS NOT NULL AND v_damaged_row.quantity >= v_total THEN
    UPDATE stock SET quantity = quantity - v_total, updated_at = now()
      WHERE id = v_damaged_row.id;
    INSERT INTO stock_movements (company_id, depot_id, category_id, category_product_id, movement_type, quantity, condition_before, condition_after, notes, performed_by)
      VALUES (v_repair.company_id, v_repair.depot_id, v_repair.category_id, v_damaged_row.category_product_id, 'repair', v_total, 'damaged', 'good', 'Reparim i raportuar', auth.uid());
  END IF;

  -- Add repaired items to good stock (ready for sale)
  IF coalesce(p_repaired_qty,0) > 0 AND p_target_category_product_id IS NOT NULL THEN
    SELECT id INTO v_good_id FROM stock
      WHERE company_id = v_repair.company_id
        AND depot_id = v_repair.depot_id
        AND category_id = v_repair.category_id
        AND category_product_id = p_target_category_product_id
        AND condition = 'good'
      LIMIT 1;
    IF v_good_id IS NULL THEN
      INSERT INTO stock (company_id, depot_id, category_id, category_product_id, condition, quantity, updated_at, created_at)
        VALUES (v_repair.company_id, v_repair.depot_id, v_repair.category_id, p_target_category_product_id, 'good', p_repaired_qty, now(), now());
    ELSE
      UPDATE stock SET quantity = quantity + p_repaired_qty, updated_at = now()
        WHERE id = v_good_id;
    END IF;
    INSERT INTO stock_movements (company_id, depot_id, category_id, category_product_id, movement_type, quantity, condition_before, condition_after, notes, performed_by)
      VALUES (v_repair.company_id, v_repair.depot_id, v_repair.category_id, p_target_category_product_id, 'repair', p_repaired_qty, 'damaged', 'good', 'Palet te reparuara -> stok (te mira)', auth.uid());
  END IF;

  -- Log scrapped items
  IF coalesce(p_scrapped_qty,0) > 0 THEN
    INSERT INTO stock_movements (company_id, depot_id, category_id, category_product_id, movement_type, quantity, condition_before, condition_after, notes, performed_by)
      VALUES (v_repair.company_id, v_repair.depot_id, v_repair.category_id, p_target_category_product_id, 'scrap', p_scrapped_qty, 'damaged', 'damaged', 'Hedhur si scrap gjate raportimit te riparimit', auth.uid());
  END IF;

  -- Update repair counters
  UPDATE depot_repairs
    SET quantity_repaired = coalesce(quantity_repaired,0) + coalesce(p_repaired_qty,0),
        quantity_scrapped = coalesce(quantity_scrapped,0) + coalesce(p_scrapped_qty,0)
    WHERE id = p_repair_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.apply_repair_completion(uuid,integer,integer,uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.apply_repair_completion(uuid,integer,integer,uuid) TO authenticated, service_role;
