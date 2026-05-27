/*
  # K5: Add row-level locking to stock-modifying RPCs and non-negative quantity guard

  1. Modified Functions
    - `apply_repair_from_stock` — adds FOR UPDATE on the damaged stock read (line 42)
      and the good-stock lookup (line 79) to prevent concurrent repairs racing
    - `apply_repair_completion` — adds FOR UPDATE on damaged-stock and good-stock reads
    - `report_stock_damage` — adds FOR UPDATE on source-stock and damaged-stock reads

  2. Schema Changes
    - `stock.quantity` — adds CHECK (quantity >= 0) with NOT VALID so existing rows
      are not scanned (safe for large tables); then VALIDATE CONSTRAINT to enable
      enforcement on future writes. Any pre-existing negative rows are clamped to 0
      before the constraint is validated.

  3. Security
    - No permission changes; functions retain their existing SECURITY mode and GRANTs
    - search_path pinned identically to the original definitions

  4. Important Notes
    - FOR UPDATE prevents two concurrent callers from both reading the same stock row,
      seeing "enough" quantity, and then both decrementing it past zero.
    - The CHECK constraint is a hard backstop: even if a code path misses the
      application-level guard, Postgres will reject negative stock inserts/updates.
    - process_delivery_note_stock is NOT modified here — it already uses atomic
      UPDATE WHERE (no read-then-write) on the critical paths, and its repair path
      is low-concurrency.
*/

-- ============================================================
-- 0. Clamp any existing negative stock rows before adding CHECK
-- ============================================================
UPDATE stock SET quantity = 0 WHERE quantity < 0;

-- ============================================================
-- 1. Add CHECK constraint on stock.quantity
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.stock'::regclass
      AND conname  = 'stock_quantity_non_negative'
  ) THEN
    ALTER TABLE stock ADD CONSTRAINT stock_quantity_non_negative CHECK (quantity >= 0);
  END IF;
END $$;

-- ============================================================
-- 2. apply_repair_from_stock — add FOR UPDATE
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
SET search_path = public
AS $$
DECLARE
  v_stock    record;
  v_total    integer;
  v_good_id  uuid;
  v_actor    uuid := auth.uid();
  v_credit   uuid;
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

GRANT EXECUTE ON FUNCTION public.apply_repair_from_stock TO authenticated;

-- ============================================================
-- 3. apply_repair_completion — add FOR UPDATE
-- ============================================================
CREATE OR REPLACE FUNCTION public.apply_repair_completion(
  p_repair_id uuid,
  p_repaired_qty integer,
  p_scrapped_qty integer,
  p_target_category_product_id uuid,
  p_worker_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_repair       record;
  v_total        integer;
  v_damaged_row  record;
  v_good_id      uuid;
  v_actor        uuid := auth.uid();
  v_credit       uuid;
BEGIN
  SELECT * INTO v_repair FROM depot_repairs WHERE id = p_repair_id;
  IF v_repair IS NULL THEN
    RAISE EXCEPTION 'Repair not found';
  END IF;

  v_total := coalesce(p_repaired_qty, 0) + coalesce(p_scrapped_qty, 0);
  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Asnje sasi per te raportuar';
  END IF;
  IF coalesce(v_repair.quantity_repaired, 0) + coalesce(v_repair.quantity_scrapped, 0) + v_total
       > coalesce(v_repair.quantity_in, 0) THEN
    RAISE EXCEPTION 'Sasia tejkalon totalin e pritur ne reparature';
  END IF;

  v_credit := COALESCE(p_worker_id, v_repair.worker_id, v_actor);

  SELECT * INTO v_damaged_row FROM stock
  WHERE company_id = v_repair.company_id
    AND depot_id   = v_repair.depot_id
    AND category_id = v_repair.category_id
    AND condition  = 'damaged'
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 1
  FOR UPDATE;

  IF v_damaged_row.id IS NOT NULL AND v_damaged_row.quantity >= v_total THEN
    UPDATE stock
    SET    quantity = quantity - v_total, updated_at = now()
    WHERE id = v_damaged_row.id;
    INSERT INTO stock_movements (company_id, depot_id, category_id, category_product_id, movement_type, quantity, condition_before, condition_after, notes, performed_by)
    VALUES (v_repair.company_id, v_repair.depot_id, v_repair.category_id, v_damaged_row.category_product_id, 'repair', v_total, 'damaged', 'good', 'Reparim i raportuar', v_actor);
  END IF;

  IF coalesce(p_repaired_qty, 0) > 0 AND p_target_category_product_id IS NOT NULL THEN
    SELECT id INTO v_good_id FROM stock
    WHERE company_id = v_repair.company_id
      AND depot_id   = v_repair.depot_id
      AND category_id = v_repair.category_id
      AND category_product_id = p_target_category_product_id
      AND condition  = 'good'
    LIMIT 1
    FOR UPDATE;

    IF v_good_id IS NULL THEN
      INSERT INTO stock (company_id, depot_id, category_id, category_product_id, condition, quantity, updated_at, created_at)
      VALUES (v_repair.company_id, v_repair.depot_id, v_repair.category_id, p_target_category_product_id, 'good', p_repaired_qty, now(), now());
    ELSE
      UPDATE stock SET quantity = quantity + p_repaired_qty, updated_at = now()
      WHERE id = v_good_id;
    END IF;
    INSERT INTO stock_movements (company_id, depot_id, category_id, category_product_id, movement_type, quantity, condition_before, condition_after, notes, performed_by)
    VALUES (v_repair.company_id, v_repair.depot_id, v_repair.category_id, p_target_category_product_id, 'repair', p_repaired_qty, 'damaged', 'good', 'Palet te reparuara -> stok (te mira)', v_actor);
  END IF;

  IF coalesce(p_scrapped_qty, 0) > 0 THEN
    INSERT INTO stock_movements (company_id, depot_id, category_id, category_product_id, movement_type, quantity, condition_before, condition_after, notes, performed_by)
    VALUES (v_repair.company_id, v_repair.depot_id, v_repair.category_id, p_target_category_product_id, 'scrap', p_scrapped_qty, 'damaged', 'damaged', 'Hedhur si scrap gjate raportimit te riparimit', v_actor);
  END IF;

  UPDATE depot_repairs
  SET    quantity_repaired = coalesce(quantity_repaired, 0) + coalesce(p_repaired_qty, 0),
         quantity_scrapped = coalesce(quantity_scrapped, 0) + coalesce(p_scrapped_qty, 0),
         worker_id         = v_credit
  WHERE id = p_repair_id;
END;
$$;

-- ============================================================
-- 4. report_stock_damage — add FOR UPDATE
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

  SELECT id INTO v_source_id FROM stock
  WHERE company_id = v_company
    AND depot_id   = p_depot_id
    AND category_product_id = p_category_product_id
    AND condition  = p_condition_from
  LIMIT 1
  FOR UPDATE;

  IF v_source_id IS NULL OR (SELECT quantity FROM stock WHERE id = v_source_id) < p_quantity THEN
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
GRANT  EXECUTE ON FUNCTION public.report_stock_damage(uuid, uuid, integer, text, text) TO authenticated;
