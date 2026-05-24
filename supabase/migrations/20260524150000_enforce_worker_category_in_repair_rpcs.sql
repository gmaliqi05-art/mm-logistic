/*
  # Enforce worker_category server-side in repair RPCs

  Security audit M1: depot_worker is partitioned into 'depoist'
  (intake/sorting) and 'reparature' (repair). The frontend
  <ProtectedRoute workerCategories={['depoist']}> guard runs only
  in the browser. Without a matching server-side check, a
  reparature worker with a valid JWT could call apply_repair_from_stock
  and worker_log_repair (intended for reparature) — or, more
  concerning, a depoist worker could call repair RPCs.

  This adds an inline check: if caller.role = 'depot_worker', their
  worker_category must be 'reparature'. company_admin / super_admin
  bypass.

  Both functions also gain `pg_temp` in search_path so they line up
  with the PR-D3 hardening.
*/

-- ============================================================
-- apply_repair_from_stock: add worker_category gate
-- ============================================================
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
SET search_path = public, pg_temp
AS $$
DECLARE
  v_stock    record;
  v_total    integer;
  v_good_id  uuid;
  v_actor    uuid := auth.uid();
  v_credit   uuid;
  v_role     text;
  v_cat      text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Nuk je i kycur' USING ERRCODE = '42501';
  END IF;

  -- Worker-category server-side enforcement: a depoist worker
  -- cannot call repair RPCs even with a valid session. RLS alone
  -- doesn't catch this because both worker_categories belong to
  -- the same tenant.
  SELECT role, worker_category INTO v_role, v_cat
  FROM profiles WHERE id = v_actor;

  IF v_role = 'depot_worker' AND v_cat IS DISTINCT FROM 'reparature' THEN
    RAISE EXCEPTION 'Kjo veprim eshte vetem per reparature' USING ERRCODE = '42501';
  END IF;

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

-- ============================================================
-- worker_log_repair: insert worker_category gate after the role
-- check. Keep the rest of the logic identical to the original
-- migration 20260522220100.
-- ============================================================
DO $$
DECLARE
  v_proc_oid oid;
BEGIN
  SELECT p.oid INTO v_proc_oid
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'worker_log_repair';

  IF v_proc_oid IS NULL THEN
    RAISE NOTICE 'worker_log_repair not found; nothing to alter';
    RETURN;
  END IF;

  ALTER FUNCTION public.worker_log_repair(uuid, uuid, uuid, text, integer, integer)
    SET search_path = public, pg_temp;
END $$;

-- Add the worker_category check inside worker_log_repair by
-- creating a small wrapper trigger-style logic. Since we cannot
-- easily edit the function body inline, just CREATE OR REPLACE
-- with the same body + the new check. Keep body in sync with
-- migration 20260522220100.
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
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_company_id        UUID;
  v_worker_company    UUID;
  v_caller_id         UUID := auth.uid();
  v_caller_role       TEXT;
  v_caller_cat        TEXT;
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

  SELECT company_id, role, worker_category
    INTO v_company_id, v_caller_role, v_caller_cat
  FROM profiles
  WHERE id = v_caller_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Caller pa kompani' USING ERRCODE = '42501';
  END IF;

  IF v_caller_role NOT IN ('depot_worker', 'company_admin', 'super_admin') THEN
    RAISE EXCEPTION 'Roli % nuk lejohet', v_caller_role USING ERRCODE = '42501';
  END IF;

  -- Worker-category gate: a depoist (intake/sorting) worker cannot
  -- log repairs. Server-side mirror of the React route guard.
  IF v_caller_role = 'depot_worker' AND v_caller_cat IS DISTINCT FROM 'reparature' THEN
    RAISE EXCEPTION 'Kjo veprim eshte vetem per reparature' USING ERRCODE = '42501';
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
    v_caller_id, now(), FALSE
  )
  RETURNING id INTO v_repair_id;

  IF v_damaged_stock_id IS NULL OR v_damaged_qty < v_total THEN
    worker_log_repair.repair_id := v_repair_id;
    worker_log_repair.stock_synced := FALSE;
    worker_log_repair.message := 'Logged without stock sync (insufficient damaged stock)';
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_target_cp_id IS NULL AND COALESCE(p_quantity_repaired, 0) > 0 THEN
    worker_log_repair.repair_id := v_repair_id;
    worker_log_repair.stock_synced := FALSE;
    worker_log_repair.message := 'Logged without stock sync (target product not found)';
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE stock
  SET    quantity = quantity - v_total, updated_at = now()
  WHERE  id = v_damaged_stock_id;

  INSERT INTO stock_movements (
    company_id, depot_id, category_id, category_product_id,
    movement_type, quantity, condition_before, condition_after,
    notes, performed_by, created_at
  ) VALUES (
    v_company_id, p_depot_id, p_category_id, NULL,
    'repair', v_total, 'damaged', 'good',
    'worker_log_repair', v_caller_id, now()
  );

  IF COALESCE(p_quantity_repaired, 0) > 0 AND v_target_cp_id IS NOT NULL THEN
    SELECT id INTO v_good_stock_id FROM stock
    WHERE company_id = v_company_id
      AND depot_id = p_depot_id
      AND category_id = p_category_id
      AND category_product_id = v_target_cp_id
      AND condition = 'good'
      AND ownership = 'own'
    LIMIT 1;

    IF v_good_stock_id IS NULL THEN
      INSERT INTO stock (company_id, depot_id, category_id, category_product_id, condition, ownership, quantity)
      VALUES (v_company_id, p_depot_id, p_category_id, v_target_cp_id, 'good', 'own', p_quantity_repaired);
    ELSE
      UPDATE stock SET quantity = quantity + p_quantity_repaired, updated_at = now()
      WHERE id = v_good_stock_id;
    END IF;
  END IF;

  UPDATE depot_repairs SET stock_synced = TRUE WHERE id = v_repair_id;

  worker_log_repair.repair_id := v_repair_id;
  worker_log_repair.stock_synced := TRUE;
  worker_log_repair.message := 'OK';
  RETURN NEXT;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.worker_log_repair(uuid, uuid, uuid, text, integer, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.worker_log_repair(uuid, uuid, uuid, text, integer, integer) TO authenticated, service_role;
