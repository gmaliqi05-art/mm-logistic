/*
  # Add role / worker_category gate to report_stock_damage

  Security audit (third pass) finding H2.

  report_stock_damage is SECURITY DEFINER and granted to
  `authenticated` with NO role check. RLS scopes the writes to the
  caller's tenant (via the company_id lookup at line 185), but
  inside the tenant any logged-in user — driver, accountant,
  reparature worker — can mark arbitrary `good` stock as `damaged`
  and corrupt the entire stock ledger. The intended caller is
  depot_worker with worker_category='depoist' (intake / sorting),
  plus company_admin and super_admin for ops cleanup.

  This migration re-creates the function body identical to the
  original (20260521130000) and inserts a role/worker_category
  guard right after the auth.uid() check. Also pins pg_temp last
  in search_path (matches the PR-D3 standard for new functions).

  Idempotent: CREATE OR REPLACE.
*/

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

  -- Role gate: only depot_worker (depoist subtype), company_admin
  -- or super_admin may report damage. Driver / accountant /
  -- reparature depot_worker / logistics_admin are rejected.
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

COMMENT ON FUNCTION public.report_stock_damage IS
  'Marks stock as damaged and records the movement. Restricted to '
  'depot_worker (depoist) / company_admin / super_admin. RLS via the '
  'profiles.company_id lookup at the top of the body; cross-tenant '
  'callers are rejected because the depot lookup will not find a '
  'match in their company.';
