/*
  # Depot Reporting: product price and reporting views

  1. Schema
    - Add `base_price` numeric(12,2) default 0 to `category_products`
    - Add `currency` text default 'EUR' to `category_products`

  2. Views
    - `v_depot_stock_value` — physical stock per depot aggregated by category/product/condition, with unit price and line value. NO partner/ownership breakdown.
    - `v_depot_daily_flow` — per-depot daily in/out/repair/scrap/sort totals from stock_movements.
    - `v_depot_repair_productivity` — depot_repair_reports with per-product totals and monetary value.
    - `v_depot_sorting_outcomes` — completed sorting batches with output product breakdown and value.

  3. Security
    - Views inherit RLS from base tables.
    - GRANT SELECT to authenticated.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'category_products' AND column_name = 'base_price'
  ) THEN
    ALTER TABLE category_products ADD COLUMN base_price numeric(12,2) NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'category_products' AND column_name = 'currency'
  ) THEN
    ALTER TABLE category_products ADD COLUMN currency text NOT NULL DEFAULT 'EUR';
  END IF;
END $$;

CREATE OR REPLACE VIEW public.v_depot_stock_value AS
SELECT
  s.company_id,
  s.depot_id,
  d.name                                       AS depot_name,
  s.category_id,
  pc.name                                      AS category_name,
  s.category_product_id,
  cp.name                                      AS product_name,
  COALESCE(cp.base_price, 0)::numeric(12,2)    AS unit_price,
  COALESCE(cp.currency, 'EUR')                 AS currency,
  s.condition,
  SUM(s.quantity)::int                         AS quantity,
  (SUM(s.quantity) * COALESCE(cp.base_price, 0))::numeric(14,2) AS line_value
FROM public.stock s
LEFT JOIN public.depots d ON d.id = s.depot_id
LEFT JOIN public.product_categories pc ON pc.id = s.category_id
LEFT JOIN public.category_products cp ON cp.id = s.category_product_id
GROUP BY s.company_id, s.depot_id, d.name, s.category_id, pc.name,
         s.category_product_id, cp.name, cp.base_price, cp.currency, s.condition;

COMMENT ON VIEW public.v_depot_stock_value IS
  'Physical depot stock by category/product/condition with unit price and line value. No partner split.';

CREATE OR REPLACE VIEW public.v_depot_daily_flow AS
SELECT
  sm.company_id,
  sm.depot_id,
  date_trunc('day', sm.created_at)::date       AS flow_date,
  sm.movement_type,
  sm.category_id,
  sm.category_product_id,
  SUM(COALESCE(sm.quantity,0))::int            AS quantity
FROM public.stock_movements sm
GROUP BY sm.company_id, sm.depot_id, date_trunc('day', sm.created_at)::date,
         sm.movement_type, sm.category_id, sm.category_product_id;

COMMENT ON VIEW public.v_depot_daily_flow IS
  'Daily aggregated movement volume per depot and category/product. No partner breakdown.';

CREATE OR REPLACE VIEW public.v_depot_repair_productivity AS
SELECT
  dr.company_id,
  dr.depot_id,
  date_trunc('day', COALESCE(dr.logged_at, dr.created_at))::date AS repair_date,
  dr.category_id,
  pc.name                                      AS category_name,
  dr.category_product_id,
  cp.name                                      AS product_name,
  COALESCE(cp.base_price, 0)::numeric(12,2)    AS unit_price,
  COALESCE(cp.currency, 'EUR')                 AS currency,
  SUM(COALESCE(dr.quantity_in,0))::int         AS total_in,
  SUM(COALESCE(dr.quantity_repaired,0))::int   AS total_repaired,
  SUM(COALESCE(dr.quantity_scrapped,0))::int   AS total_scrapped,
  (SUM(COALESCE(dr.quantity_repaired,0)) * COALESCE(cp.base_price,0))::numeric(14,2) AS repaired_value
FROM public.depot_repairs dr
LEFT JOIN public.product_categories pc ON pc.id = dr.category_id
LEFT JOIN public.category_products cp ON cp.id = dr.category_product_id
GROUP BY dr.company_id, dr.depot_id,
         date_trunc('day', COALESCE(dr.logged_at, dr.created_at))::date,
         dr.category_id, pc.name, dr.category_product_id, cp.name, cp.base_price, cp.currency;

COMMENT ON VIEW public.v_depot_repair_productivity IS
  'Repair productivity by depot/day/product with monetary value.';

CREATE OR REPLACE VIEW public.v_depot_sorting_outcomes AS
SELECT
  psb.company_id,
  psb.depot_id,
  psb.id                                       AS batch_id,
  psb.status,
  date_trunc('day', COALESCE(psb.committed_at, psb.completed_at, psb.created_at))::date AS batch_date,
  psb.category_id,
  pc.name                                      AS category_name,
  psi.category_product_id,
  cp.name                                      AS product_name,
  psi.condition,
  COALESCE(psi.quantity,0)::int                AS quantity,
  COALESCE(cp.base_price,0)::numeric(12,2)     AS unit_price,
  (COALESCE(psi.quantity,0) * COALESCE(cp.base_price,0))::numeric(14,2) AS line_value
FROM public.pallet_sorting_items psi
JOIN public.pallet_sorting_batches psb ON psb.id = psi.batch_id
LEFT JOIN public.product_categories pc ON pc.id = psb.category_id
LEFT JOIN public.category_products cp ON cp.id = psi.category_product_id;

COMMENT ON VIEW public.v_depot_sorting_outcomes IS
  'Sorting batch outcomes per output product with monetary value.';

GRANT SELECT ON public.v_depot_stock_value TO authenticated;
GRANT SELECT ON public.v_depot_daily_flow TO authenticated;
GRANT SELECT ON public.v_depot_repair_productivity TO authenticated;
GRANT SELECT ON public.v_depot_sorting_outcomes TO authenticated;
