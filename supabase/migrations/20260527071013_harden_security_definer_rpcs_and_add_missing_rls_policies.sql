/*
  # Harden SECURITY DEFINER RPCs and add missing RLS policies

  1. Functions
    - `is_email_suppressed`: Revoke EXECUTE from authenticated and anon.
      This is an internal helper used only by edge functions (service_role).
      Authenticated users have no reason to query the email suppression list.
    - `report_stock_damage`: Already has internal role gate (depot_worker/depoist,
      company_admin, super_admin). SECURITY DEFINER is required for cross-table
      writes. Revoke from anon/public (idempotent). Add FOR UPDATE on stock reads
      for consistency with K5 hardening.
    - `worker_log_repair`: Already has internal role gate (depot_worker/reparature,
      company_admin, super_admin). SECURITY DEFINER is required for cross-table
      writes and RETURNS TABLE syntax. Add FOR UPDATE on stock reads. Revoke from
      anon/public (idempotent).

  2. New RLS Policies
    - `email_verification_codes`: Service-role-only table (no user_id column).
      Add explicit deny-all by providing no permissive policies; add a
      super_admin SELECT policy for audit/debugging visibility via email match.
    - `stripe_webhook_events`: Service-role-only table. Add super_admin
      SELECT policy for audit visibility.

  3. Security
    - is_email_suppressed no longer callable via PostgREST by any user role
    - Both stock RPCs retain SECURITY DEFINER with strong internal auth gates
    - Both previously-empty RLS tables now have explicit super_admin read access
*/

-- ============================================================
-- 1. is_email_suppressed: revoke from authenticated
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.is_email_suppressed(text) FROM authenticated, anon, public;
GRANT  EXECUTE ON FUNCTION public.is_email_suppressed(text) TO service_role;

-- ============================================================
-- 2. report_stock_damage: already gated, add FOR UPDATE
--    (recreated in full for idempotency)
-- ============================================================
CREATE OR REPLACE FUNCTION public.report_stock_damage(
  p_depot_id            uuid,
  p_category_product_id uuid,
  p_quantity            integer,
  p_reason              text DEFAULT NULL,
  p_condition_from      text DEFAULT 'good'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor       uuid := auth.uid();
  v_company     uuid;
  v_role        text;
  v_cat_worker  text;
  v_depot_check uuid;
  v_cat         uuid;
  v_product     text;
  v_source_id   uuid;
  v_source_qty  integer;
  v_damaged_id  uuid;
  v_report_id   uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Sasia duhet te jete me e madhe se 0';
  END IF;

  SELECT company_id, role, worker_category
    INTO v_company, v_role, v_cat_worker
  FROM profiles WHERE id = v_actor;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Perdoruesi nuk ka kompani' USING ERRCODE = '42501';
  END IF;

  IF v_role NOT IN ('depot_worker', 'company_admin', 'super_admin') THEN
    RAISE EXCEPTION 'Roli % nuk lejohet per raportim demtimi', v_role
      USING ERRCODE = '42501';
  END IF;
  IF v_role = 'depot_worker' AND v_cat_worker IS DISTINCT FROM 'depoist' THEN
    RAISE EXCEPTION 'Kjo veprim eshte vetem per depoist'
      USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_depot_check FROM depots
    WHERE id = p_depot_id AND company_id = v_company;
  IF v_depot_check IS NULL THEN
    RAISE EXCEPTION 'Depo nuk ekziston ne kete kompani';
  END IF;

  SELECT cp.category_id, cp.name
    INTO v_cat, v_product
    FROM category_products cp WHERE cp.id = p_category_product_id;
  IF v_cat IS NULL THEN
    RAISE EXCEPTION 'Produkti nuk u gjet';
  END IF;

  SELECT id, quantity INTO v_source_id, v_source_qty FROM stock
  WHERE company_id = v_company
    AND depot_id   = p_depot_id
    AND category_product_id = p_category_product_id
    AND condition  = p_condition_from
  LIMIT 1
  FOR UPDATE;

  IF v_source_id IS NULL OR v_source_qty < p_quantity THEN
    RAISE EXCEPTION 'Stoku nuk eshte i mjaftueshem ne gjendjen %', p_condition_from;
  END IF;

  INSERT INTO stock_damage_reports (
    company_id, depot_id, category_id, category_product_id, product_name,
    condition_from, quantity, reason, reported_by
  ) VALUES (
    v_company, p_depot_id, v_cat, p_category_product_id, v_product,
    p_condition_from, p_quantity, p_reason, v_actor
  ) RETURNING id INTO v_report_id;

  UPDATE stock SET quantity = quantity - p_quantity, updated_at = now()
  WHERE id = v_source_id;

  SELECT id INTO v_damaged_id FROM stock
  WHERE company_id = v_company
    AND depot_id   = p_depot_id
    AND category_product_id = p_category_product_id
    AND condition  = 'damaged'
  LIMIT 1
  FOR UPDATE;

  IF v_damaged_id IS NULL THEN
    INSERT INTO stock (
      company_id, depot_id, category_id, category_product_id,
      quantity, condition, updated_at, created_at
    ) VALUES (
      v_company, p_depot_id, v_cat, p_category_product_id,
      p_quantity, 'damaged', now(), now()
    );
  ELSE
    UPDATE stock SET quantity = quantity + p_quantity, updated_at = now()
    WHERE id = v_damaged_id;
  END IF;

  INSERT INTO stock_movements (
    company_id, depot_id, category_id, category_product_id,
    movement_type, quantity, condition_before, condition_after,
    notes, performed_by, created_at
  ) VALUES (
    v_company, p_depot_id, v_cat, p_category_product_id,
    'adjust', p_quantity, p_condition_from, 'damaged',
    'Raportim demtim' || CASE WHEN p_reason IS NULL OR p_reason = '' THEN '' ELSE ': ' || p_reason END,
    v_actor, now()
  );

  RETURN v_report_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.report_stock_damage(uuid, uuid, integer, text, text) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.report_stock_damage(uuid, uuid, integer, text, text) TO authenticated, service_role;

-- ============================================================
-- 3. worker_log_repair: add FOR UPDATE on stock reads
-- ============================================================
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
  LIMIT 1
  FOR UPDATE;

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
    LIMIT 1
    FOR UPDATE;

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

-- ============================================================
-- 4. email_verification_codes: add super_admin SELECT policy
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'email_verification_codes'
      AND policyname = 'Super admins can view verification codes'
  ) THEN
    CREATE POLICY "Super admins can view verification codes"
      ON public.email_verification_codes
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
            AND profiles.role = 'super_admin'
        )
      );
  END IF;
END $$;

-- ============================================================
-- 5. stripe_webhook_events: add super_admin SELECT policy
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'stripe_webhook_events'
      AND policyname = 'Super admins can view webhook events'
  ) THEN
    CREATE POLICY "Super admins can view webhook events"
      ON public.stripe_webhook_events
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
            AND profiles.role = 'super_admin'
        )
      );
  END IF;
END $$;
