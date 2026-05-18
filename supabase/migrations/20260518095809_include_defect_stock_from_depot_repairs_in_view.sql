/*
  # Include defect items from depot_repairs in v_depot_stock_value view

  1. Changes
    - Recreates `v_depot_stock_value` with a UNION ALL
    - Original query: stock table rows (good, sorting, ready_a, etc.)
    - New addition: pending defective items from `depot_repairs` table
      - Calculated as: quantity_in - quantity_repaired - quantity_scrapped
      - Only includes rows where remaining > 0
      - Shows as condition = 'damaged'

  2. Purpose
    - When sorting reports defective items, they go to depot_repairs (not stock)
    - Dashboard, Stock page, and Reports all read from v_depot_stock_value
    - Without this change, defective items never appear (always 0)
    - Now defect count automatically decreases as repairs are completed

  3. Impact
    - Dashboard "Defekt" stat card shows real defect count
    - Stock page "Defekt" filter shows defective items pending repair
    - Reports "damaged" tab shows actual defective inventory
    - No frontend changes needed
*/

CREATE OR REPLACE VIEW public.v_depot_stock_value AS
-- Original stock rows (good, sorting, ready_a, etc.)
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
         s.category_product_id, cp.name, cp.base_price, cp.currency, s.condition

UNION ALL

-- Defective items pending repair from depot_repairs
SELECT
  dr.company_id,
  dr.depot_id,
  d.name                                       AS depot_name,
  dr.category_id,
  pc.name                                      AS category_name,
  dr.category_product_id,
  COALESCE(cp.name, dr.product_name)           AS product_name,
  COALESCE(cp.base_price, 0)::numeric(12,2)    AS unit_price,
  COALESCE(cp.currency, 'EUR')                 AS currency,
  'damaged'::text                              AS condition,
  SUM(dr.quantity_in - dr.quantity_repaired - dr.quantity_scrapped)::int AS quantity,
  (SUM(dr.quantity_in - dr.quantity_repaired - dr.quantity_scrapped) * COALESCE(cp.base_price, 0))::numeric(14,2) AS line_value
FROM public.depot_repairs dr
LEFT JOIN public.depots d ON d.id = dr.depot_id
LEFT JOIN public.product_categories pc ON pc.id = dr.category_id
LEFT JOIN public.category_products cp ON cp.id = dr.category_product_id
GROUP BY dr.company_id, dr.depot_id, d.name, dr.category_id, pc.name,
         dr.category_product_id, cp.name, dr.product_name, cp.base_price, cp.currency
HAVING SUM(dr.quantity_in - dr.quantity_repaired - dr.quantity_scrapped) > 0;
