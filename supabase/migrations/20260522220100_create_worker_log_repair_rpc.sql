/*
  # L1: worker_log_repair RPC syncs worker entries with stock

  WorkerRepairEntry.handleSave was doing a direct INSERT into
  depot_repairs. The depot_repairs row got the productivity counts
  but the matching damaged-stock row was NEVER decremented and no
  good stock was added. Result: inventory permanently overstated
  damaged pallets and understated good pallets, and a bad-faith
  worker could inflate the daily repair count without any matching
  physical work.

  This migration:
    1. Adds depot_repairs.stock_synced (boolean, default false).
    2. Backfills stock_synced=true for past rows that look like
       they were created by apply_repair_from_stock (those rows
       have quantity_in > 0).
    3. Introduces worker_log_repair() — a SECURITY DEFINER wrapper
       that workers call from WorkerRepairEntry. The RPC tries to
       find the damaged stock row for the depot+category, deducts
       it, and (if a target product was resolved from the
       product_name input) adds the repaired qty to the good
       stock row. If the damaged row is missing or has less than
       the reported qty, the productivity entry is still recorded
       (with stock_synced=false) and a human-readable message is
       returned so the UI can flag it. Admin then reconciles
       manually via RepairCompletionModal.
*/

ALTER TABLE public.depot_repairs
  ADD COLUMN IF NOT EXISTS stock_synced BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.depot_repairs.stock_synced IS
  'true iff this entry decremented damaged stock and (optionally) incremented good stock. false rows are productivity-only and need manual reconciliation.';

UPDATE public.depot_repairs
SET stock_synced = TRUE
WHERE quantity_in > 0
  AND stock_synced = FALSE;

CREATE OR REPLACE FUNCTION public.worker_log_repair(
  p_worker_id        UUID,
  p_depot_id         UUID,
  p_category_id      UUID,
  p_product_name     TEXT,
  p_quantity_repaired INTEGER,
  p_quantity_scrapped INTEGER DEFAULT 0
)
RETURNS TABLE(repair_id UUID, stock_synced BOOLEAN, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_company_id        UUID;
  v_worker_company    UUID;
  v_caller_id         UUID := auth.uid();
  v_caller_role       TEXT;
  v_total             INTEGER;
  v_damaged_stock_id  UUID;
  v_damaged_qty       INTEGER;
  v_target_cp_id      UUID;
  v_good_stock_id     UUID;
  v_repair_id         UUID;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Nuk je i kycur' USING ERRCODE = '42501';
  END IF;

  SELECT company_id, role
    INTO v_company_id, v_caller_role
  FROM profiles
  WHERE id = v_caller_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Caller pa kompani' USING ERRCODE = '42501';
  END IF;

  IF v_caller_role NOT IN ('depot_worker', 'company_admin', 'super_admin') THEN
    RAISE EXCEPTION 'Roli % nuk lejohet', v_caller_role USING ERRCODE = '42501';
  END IF;

  SELECT company_id INTO v_worker_company
  FROM profiles
  WHERE id = p_worker_id;

  IF v_worker_company IS NULL OR v_worker_company <> v_company_id THEN
    RAISE EXCEPTION 'Punetori nuk eshte ne kompanine tende' USING ERRCODE = '42501';
  END IF;

  v_total := COALESCE(p_quantity_repaired, 0) + COALESCE(p_quantity_scrapped, 0);
  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Asnje sasi per te raportuar';
  END IF;

  IF p_product_name IS NOT NULL AND length(trim(p_product_name)) > 0 THEN
    SELECT id INTO v_target_cp_id
    FROM category_products
    WHERE company_id = v_company_id
      AND category_id = p_category_id
      AND lower(trim(name)) = lower(trim(p_product_name))
      AND is_active
    LIMIT 1;
  END IF;

  SELECT id, quantity
    INTO v_damaged_stock_id, v_damaged_qty
  FROM stock
  WHERE company_id = v_company_id
    AND depot_id = p_depot_id
    AND category_id = p_category_id
    AND condition = 'damaged'
    AND ownership = 'own'
  ORDER BY quantity DESC
  LIMIT 1;

  INSERT INTO depot_repairs (
    company_id, depot_id, worker_id, category_id, category_product_id,
    quantity_in, quantity_repaired, quantity_scrapped, product_name,
    opened_by, logged_at, stock_synced
  ) VALUES (
    v_company_id, p_depot_id, p_worker_id, p_category_id, v_target_cp_id,
    v_total, COALESCE(p_quantity_repaired, 0), COALESCE(p_quantity_scrapped, 0),
    COALESCE(p_product_name, ''), v_caller_id, now(), FALSE
  )
  RETURNING id INTO v_repair_id;

  IF v_damaged_stock_id IS NULL THEN
    repair_id := v_repair_id;
    worker_log_repair.stock_synced := FALSE;
    message := 'U regjistrua, por nuk ka stok te demtuar per reconciliation. Admini duhet ta perpunoje manualisht.';
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_total > v_damaged_qty THEN
    repair_id := v_repair_id;
    worker_log_repair.stock_synced := FALSE;
    message := format(
      'Sasia e raportuar (%s) tejkalon stokun e demtuar (%s). U regjistrua per produktivitet por jo per stok.',
      v_total, v_damaged_qty
    );
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE stock
  SET    quantity = quantity - v_total,
         updated_at = now()
  WHERE  id = v_damaged_stock_id;

  IF COALESCE(p_quantity_repaired, 0) > 0 AND v_target_cp_id IS NOT NULL THEN
    SELECT id INTO v_good_stock_id
    FROM stock
    WHERE company_id = v_company_id
      AND depot_id   = p_depot_id
      AND category_id = p_category_id
      AND category_product_id = v_target_cp_id
      AND condition  = 'good'
      AND ownership  = 'own'
    LIMIT 1;

    IF v_good_stock_id IS NULL THEN
      INSERT INTO stock (
        company_id, depot_id, category_id, category_product_id,
        quantity, condition, ownership, owner_company_id, created_at, updated_at
      )
      VALUES (
        v_company_id, p_depot_id, p_category_id, v_target_cp_id,
        p_quantity_repaired, 'good', 'own', v_company_id, now(), now()
      );
    ELSE
      UPDATE stock
      SET    quantity = quantity + p_quantity_repaired,
             updated_at = now()
      WHERE  id = v_good_stock_id;
    END IF;
  END IF;

  INSERT INTO stock_movements (
    company_id, depot_id, category_id, category_product_id,
    movement_type, quantity, condition_before, condition_after,
    notes, performed_by
  ) VALUES (
    v_company_id, p_depot_id, p_category_id, v_target_cp_id,
    'repair', v_total, 'damaged',
    CASE WHEN v_target_cp_id IS NOT NULL THEN 'good' ELSE 'damaged' END,
    'Log nga punetori: ' || COALESCE(p_product_name, ''),
    v_caller_id
  );

  IF COALESCE(p_quantity_scrapped, 0) > 0 THEN
    INSERT INTO stock_movements (
      company_id, depot_id, category_id, category_product_id,
      movement_type, quantity, condition_before, condition_after,
      notes, performed_by
    ) VALUES (
      v_company_id, p_depot_id, p_category_id, v_target_cp_id,
      'scrap', p_quantity_scrapped, 'damaged', 'damaged',
      'Hedhur si scrap (log punetori)', v_caller_id
    );
  END IF;

  UPDATE depot_repairs
  SET    stock_synced = TRUE
  WHERE  id = v_repair_id;

  repair_id := v_repair_id;
  worker_log_repair.stock_synced := TRUE;
  message := 'Stoku u perditesua me sukses';
  RETURN NEXT;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.worker_log_repair(UUID, UUID, UUID, TEXT, INTEGER, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.worker_log_repair IS
  'Wrapper used by WorkerRepairEntry — logs productivity in depot_repairs and syncs stock_movements/stock if the damaged stock row is available.';
