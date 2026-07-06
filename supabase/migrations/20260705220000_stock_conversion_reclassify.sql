/*
  # Stock class conversion / reclassification

  Operators buy e.g. "Klasse B" pallets, some of which are good enough to sell
  as "Klasse A". A "class" in this system is a `category_product` within a
  `category` (e.g. within "Euro Paletten": Klasse A / B / C). This adds a way
  to move a chosen quantity from one product (class) to another **within the
  same category**, at the **same condition**, in **either direction**
  (upgrade B→A or downgrade A→B/C) — decided with the owner.

  Model (mirrors the repair flow: a domain table + the stock_movements ledger):
    - `stock_conversions` — the audit record of each conversion.
    - `convert_stock(...)` RPC — atomic: validates, decrements the source stock,
      increments the target stock, writes the two paired `stock_movements`
      (exit from source class, entry to target class; net-zero within the
      category) and the `stock_conversions` row. performed_by = the caller
      (depot worker or company admin — never a driver, per the depot rule).

  SECURITY DEFINER with internal role gating, like report_stock_damage /
  worker_log_repair. Applied to prod via MCP; recorded here.
*/

CREATE TABLE IF NOT EXISTS public.stock_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  depot_id uuid NOT NULL REFERENCES depots(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES product_categories(id) ON DELETE CASCADE,
  from_category_product_id uuid REFERENCES category_products(id) ON DELETE SET NULL,
  to_category_product_id uuid REFERENCES category_products(id) ON DELETE SET NULL,
  condition text NOT NULL DEFAULT 'good',
  quantity integer NOT NULL CHECK (quantity > 0),
  reason text NOT NULL DEFAULT '',
  performed_by uuid REFERENCES profiles_private(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_conversions_company ON public.stock_conversions (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_conversions_depot ON public.stock_conversions (depot_id);

ALTER TABLE public.stock_conversions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members read conversions" ON public.stock_conversions;
CREATE POLICY "Company members read conversions"
  ON public.stock_conversions FOR SELECT TO authenticated
  USING (company_id = private.get_user_company_id() OR private.is_super_admin());

-- Writes go only through the SECURITY DEFINER RPC; no direct INSERT policy.

CREATE OR REPLACE FUNCTION public.convert_stock(
  p_depot_id uuid,
  p_category_id uuid,
  p_from_product_id uuid,
  p_to_product_id uuid,
  p_condition text DEFAULT 'good',
  p_quantity integer DEFAULT 0,
  p_reason text DEFAULT ''
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_role text;
  v_user_depot uuid;
  v_cond text;
  v_from_id uuid;
  v_from_qty integer;
  v_from_name text;
  v_to_name text;
  v_conv_id uuid;
BEGIN
  SELECT company_id, role, depot_id INTO v_company, v_role, v_user_depot
  FROM profiles_private WHERE id = auth.uid();

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Perdoruesi nuk u gjet';
  END IF;
  IF v_role NOT IN ('depot_worker', 'company_admin', 'accountant') THEN
    RAISE EXCEPTION 'Nuk keni te drejte per konvertim stoku';
  END IF;
  -- A depot worker may only convert within their own depot.
  IF v_role = 'depot_worker' AND v_user_depot IS NOT NULL AND v_user_depot <> p_depot_id THEN
    RAISE EXCEPTION 'Nuk mund te konvertoni stok ne nje depo tjeter';
  END IF;

  IF COALESCE(p_quantity, 0) <= 0 THEN
    RAISE EXCEPTION 'Sasia duhet te jete pozitive';
  END IF;
  IF p_from_product_id IS NULL OR p_to_product_id IS NULL OR p_from_product_id = p_to_product_id THEN
    RAISE EXCEPTION 'Zgjidhni dy klasa/produkte te ndryshme';
  END IF;

  v_cond := COALESCE(NULLIF(p_condition, ''), 'good');

  -- Both products must belong to the given category (same-category rule).
  PERFORM 1 FROM category_products WHERE id = p_from_product_id AND category_id = p_category_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Klasa burim nuk i perket kategorise';
  END IF;
  PERFORM 1 FROM category_products WHERE id = p_to_product_id AND category_id = p_category_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Klasa objektiv nuk i perket kategorise';
  END IF;

  -- Lock and read the source bucket.
  SELECT id, quantity INTO v_from_id, v_from_qty
  FROM stock
  WHERE company_id = v_company
    AND depot_id = p_depot_id
    AND category_id = p_category_id
    AND category_product_id = p_from_product_id
    AND condition = v_cond
  LIMIT 1
  FOR UPDATE;

  IF COALESCE(v_from_qty, 0) < p_quantity THEN
    RAISE EXCEPTION 'Stok i pamjaftueshem: ne dispozicion %, kerkohen %', COALESCE(v_from_qty, 0), p_quantity;
  END IF;

  -- Decrement source.
  UPDATE stock SET quantity = v_from_qty - p_quantity, updated_at = now() WHERE id = v_from_id;

  -- Increment target (upsert; stock has no unique constraint, so update-else-insert).
  UPDATE stock SET quantity = quantity + p_quantity, updated_at = now()
   WHERE company_id = v_company
     AND depot_id = p_depot_id
     AND category_id = p_category_id
     AND category_product_id = p_to_product_id
     AND condition = v_cond;
  IF NOT FOUND THEN
    INSERT INTO stock (company_id, depot_id, category_id, category_product_id, quantity, condition)
    VALUES (v_company, p_depot_id, p_category_id, p_to_product_id, p_quantity, v_cond);
  END IF;

  SELECT name INTO v_from_name FROM category_products WHERE id = p_from_product_id;
  SELECT name INTO v_to_name FROM category_products WHERE id = p_to_product_id;

  -- Ledger: exit from the source class, entry to the target class.
  INSERT INTO stock_movements (
    company_id, depot_id, category_id, category_product_id, movement_type, quantity,
    condition_before, condition_after, notes, performed_by
  ) VALUES
    (v_company, p_depot_id, p_category_id, p_from_product_id, 'exit', p_quantity, v_cond, v_cond,
     'Konvertim: ' || COALESCE(v_from_name, '?') || ' -> ' || COALESCE(v_to_name, '?'), auth.uid()),
    (v_company, p_depot_id, p_category_id, p_to_product_id, 'entry', p_quantity, v_cond, v_cond,
     'Konvertim: ' || COALESCE(v_from_name, '?') || ' -> ' || COALESCE(v_to_name, '?'), auth.uid());

  -- Audit row.
  INSERT INTO stock_conversions (
    company_id, depot_id, category_id, from_category_product_id, to_category_product_id,
    condition, quantity, reason, performed_by
  ) VALUES (
    v_company, p_depot_id, p_category_id, p_from_product_id, p_to_product_id,
    v_cond, p_quantity, COALESCE(p_reason, ''), auth.uid()
  ) RETURNING id INTO v_conv_id;

  RETURN v_conv_id;
END;
$$;

REVOKE ALL ON FUNCTION public.convert_stock(uuid, uuid, uuid, uuid, text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.convert_stock(uuid, uuid, uuid, uuid, text, integer, text) TO authenticated, service_role;
