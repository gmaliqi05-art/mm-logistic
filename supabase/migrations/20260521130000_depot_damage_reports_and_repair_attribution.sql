/*
  # Depot multi-worker logic: damage reports + repair attribution fix

  Two coordinated fixes to make the depot subsystem honour the
  user-clarified business rules:

  1. Only depoists (depot_workers with `worker_category='depoist'`)
     register repair completions or sorting outcomes via the depot
     UI. Reparature workers exist only as profile rows so the depoist
     can attribute work to them — they don't log in to the depot
     dashboard. The previous PR #19 set
     `depot_repairs.worker_id = auth.uid()` inside
     `apply_repair_completion`, which credited the depoist who pressed
     "Apply", not the reparature who actually did the work. We extend
     the RPC to take `p_worker_id uuid` and have the modal pass the
     picked reparature.

  2. Damaged-in-stock event needs a quick registration path. When an
     in-stock pallet (e.g. a `good` Klasse A) gets damaged on site,
     the depoist must log it: decrement `good` stock, increment
     `damaged` stock, attribute to the depoist. This migration adds:
       - `stock_damage_reports` table
       - `report_stock_damage(...)` SECURITY DEFINER function that
         inserts the report row, decrements/upserts stock atomically,
         and writes paired `stock_movements` for audit
       - basic RLS so the company can see their reports

  No view changes needed — `v_depot_daily_flow` already groups by
  `movement_type` and will include damage-related `adjust` rows.
*/

-- 1. apply_repair_completion: accept explicit worker_id ----------------------

CREATE OR REPLACE FUNCTION public.apply_repair_completion(
  p_repair_id uuid,
  p_repaired_qty integer,
  p_scrapped_qty integer,
  p_target_category_product_id uuid,
  p_worker_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
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

  -- Credit the reparature passed by the caller; fall back to the existing
  -- worker_id (if any) and then to auth.uid() as a last resort.
  v_credit := COALESCE(p_worker_id, v_repair.worker_id, v_actor);

  SELECT * INTO v_damaged_row FROM stock
  WHERE company_id = v_repair.company_id
    AND depot_id   = v_repair.depot_id
    AND category_id = v_repair.category_id
    AND condition  = 'damaged'
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 1;

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
    LIMIT 1;
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

-- 2. stock_damage_reports table ---------------------------------------------

CREATE TABLE IF NOT EXISTS public.stock_damage_reports (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES companies(id)            ON DELETE CASCADE,
  depot_id            uuid NOT NULL REFERENCES depots(id)               ON DELETE RESTRICT,
  category_id         uuid          REFERENCES product_categories(id)   ON DELETE SET NULL,
  category_product_id uuid          REFERENCES category_products(id)    ON DELETE SET NULL,
  product_name        text,
  condition_from      text NOT NULL DEFAULT 'good'
                       CHECK (condition_from IN ('good','ready_a','ready_b','ready_c','repaired','sorting')),
  quantity            integer NOT NULL CHECK (quantity > 0),
  reason              text,
  reported_by         uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sdr_company_depot_created
  ON public.stock_damage_reports(company_id, depot_id, created_at DESC);

ALTER TABLE public.stock_damage_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sdr_select ON public.stock_damage_reports;
CREATE POLICY sdr_select ON public.stock_damage_reports
  FOR SELECT TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS sdr_insert ON public.stock_damage_reports;
CREATE POLICY sdr_insert ON public.stock_damage_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND reported_by = auth.uid()
  );

-- 3. report_stock_damage RPC -------------------------------------------------

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
SET search_path TO 'public'
AS $$
DECLARE
  v_actor       uuid := auth.uid();
  v_company     uuid;
  v_depot_check uuid;
  v_cat         uuid;
  v_product     text;
  v_source_id   uuid;
  v_damaged_id  uuid;
  v_report_id   uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Sasia duhet te jete me e madhe se 0';
  END IF;

  SELECT company_id INTO v_company FROM profiles WHERE id = v_actor;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Perdoruesi nuk ka kompani';
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

  -- Locate source stock row (the bucket we are taking from).
  SELECT id INTO v_source_id FROM stock
  WHERE company_id = v_company
    AND depot_id   = p_depot_id
    AND category_product_id = p_category_product_id
    AND condition  = p_condition_from
  LIMIT 1;

  IF v_source_id IS NULL OR (SELECT quantity FROM stock WHERE id = v_source_id) < p_quantity THEN
    RAISE EXCEPTION 'Stoku nuk eshte i mjaftueshem ne gjendjen %', p_condition_from;
  END IF;

  -- Insert the report row first so it carries the canonical attribution.
  INSERT INTO stock_damage_reports (
    company_id, depot_id, category_id, category_product_id, product_name,
    condition_from, quantity, reason, reported_by
  ) VALUES (
    v_company, p_depot_id, v_cat, p_category_product_id, v_product,
    p_condition_from, p_quantity, p_reason, v_actor
  ) RETURNING id INTO v_report_id;

  -- Decrement source bucket.
  UPDATE stock SET quantity = quantity - p_quantity, updated_at = now()
  WHERE id = v_source_id;

  -- Increment damaged bucket (upsert).
  SELECT id INTO v_damaged_id FROM stock
  WHERE company_id = v_company
    AND depot_id   = p_depot_id
    AND category_product_id = p_category_product_id
    AND condition  = 'damaged'
  LIMIT 1;

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

  -- Two paired stock_movements: one OUT of source condition, one IN to damaged.
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
