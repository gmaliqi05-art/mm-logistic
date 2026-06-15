/*
  # K3: Validate p_worker_id is a reparature worker in worker_log_repair

  ## Why
  General-audit finding K3 (depot flow). The route
  `/depot/repair-workers/:workerId` is protected with
  `<ProtectedRoute roles={['depot_worker']} workerCategories={['depoist']}>`
  so only depoist workers reach it — they log repairs on behalf of
  reparature colleagues (the depoist physically hands damaged
  pallets to the reparature, then keys the productivity entry).

  But `worker_log_repair(p_worker_id, ...)` only verifies that
  p_worker_id belongs to the same company. A depoist who knows or
  guesses the UUID of ANY same-company user (another depoist, a
  company_admin, a driver) can:

    * Log fake repair entries against that user's productivity
      record.
    * Drive admin dashboards into a bad state (B's per-worker
      productivity inflates / deflates without B doing anything).
    * Submit a finalised `depot_repair_reports` row that ties B to
      work B never did.

  This is the canonical confused-deputy hole: the caller has a
  legitimate role (depot_worker), but the *target* is the trust
  boundary. RLS gates the company; the RPC must gate the worker
  identity.

  ## What this ships
  Adds one check inside `worker_log_repair` between the existing
  worker-category gate and the existing same-company gate: the
  target user (p_worker_id) must itself be `depot_worker` with
  `worker_category = 'reparature'`. company_admin / accountant /
  super_admin can still log repairs for any user under
  themselves — that path is used by the admin "Reparim direkt nga
  stoku" modal which can credit any worker.

  apply_repair_from_stock is unchanged: that RPC accepts
  p_worker_id but only company_admins / accountants reach the modal
  that calls it. We do not add the target-worker validation there
  because admins legitimately credit any depoist worker on
  occasion (e.g., a stand-in shift). If that ever changes the
  same pattern below can be applied verbatim.

  ## Safety
  - Same idempotency / search_path / SECURITY DEFINER as the
    enforce_worker_category_in_repair_rpcs migration.
  - No data migration; only the validation is new.
  - The new check uses the same `profiles` lookup that already
    happens at line 213-216, so the cost is one extra column read.
  - Idempotent via CREATE OR REPLACE.
*/

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
  v_worker_role       TEXT;
  v_worker_cat        TEXT;
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

  -- Worker-category gate: a depoist worker is the only depot_worker
  -- variant that logs repairs on someone else's behalf (the
  -- reparature themselves call apply_repair_from_stock). Server-side
  -- mirror of the React route guard.
  IF v_caller_role = 'depot_worker' AND v_caller_cat IS DISTINCT FROM 'depoist' THEN
    RAISE EXCEPTION 'Kjo veprim eshte vetem per depoist' USING ERRCODE = '42501';
  END IF;

  -- Target validation: p_worker_id must belong to the caller's
  -- company. Audit finding K3: a depoist could previously log
  -- productivity against ANY same-company UUID (e.g., the
  -- company_admin's, another depoist's). Pull role + category
  -- so we can validate both at once.
  SELECT company_id, role, worker_category
    INTO v_worker_company, v_worker_role, v_worker_cat
  FROM profiles
  WHERE id = p_worker_id;

  IF v_worker_company IS NULL OR v_worker_company <> v_company_id THEN
    RAISE EXCEPTION 'Punetori nuk eshte ne kompanine tende' USING ERRCODE = '42501';
  END IF;

  -- New: only credit repair work against a reparature worker.
  -- company_admin / accountant / super_admin keep the privilege of
  -- crediting any worker (the admin "credit a stand-in shift" flow),
  -- but a depot_worker caller must target a reparature.
  IF v_caller_role = 'depot_worker'
     AND (v_worker_role <> 'depot_worker' OR v_worker_cat IS DISTINCT FROM 'reparature') THEN
    RAISE EXCEPTION 'Punetori i synuar nuk eshte reparature' USING ERRCODE = '42501';
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
