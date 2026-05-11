/*
  # Company-centric reporting views

  1. Views (unified source of truth)
    - `v_company_stock_breakdown`: per-company stock broken down by depot/category/product/condition.
      Filters ownership='own' so the company sees only its own inventory.
    - `v_company_movements`: unified timeline combining stock_movements (delivery/manual/repair),
      pallet_sorting_items (sortings), depot_repairs (repair logs). Normalized schema.

  2. Security
    - Views inherit RLS from underlying tables. No SECURITY DEFINER.
*/

CREATE OR REPLACE VIEW public.v_company_stock_breakdown AS
SELECT
  s.company_id,
  s.depot_id,
  d.name                                 AS depot_name,
  s.category_id,
  pc.name                                AS category_name,
  s.category_product_id,
  cp.name                                AS product_name,
  s.condition,
  SUM(s.quantity)::int                   AS quantity
FROM public.stock s
LEFT JOIN public.depots d ON d.id = s.depot_id
LEFT JOIN public.product_categories pc ON pc.id = s.category_id
LEFT JOIN public.category_products cp ON cp.id = s.category_product_id
WHERE COALESCE(s.ownership,'own') = 'own'
GROUP BY s.company_id, s.depot_id, d.name, s.category_id, pc.name,
         s.category_product_id, cp.name, s.condition;

COMMENT ON VIEW public.v_company_stock_breakdown IS
  'Per-company stock grouped by depot/category/product/condition, own ownership only.';

CREATE OR REPLACE VIEW public.v_company_movements AS
SELECT
  sm.id::text                                              AS source_id,
  'stock_movement'::text                                   AS source_type,
  sm.movement_type                                         AS movement_type,
  sm.company_id                                            AS company_id,
  sm.depot_id                                              AS depot_id,
  sm.category_id                                           AS category_id,
  sm.category_product_id                                   AS category_product_id,
  sm.condition_after                                       AS condition,
  CASE WHEN sm.movement_type = 'exit'
       THEN -COALESCE(sm.quantity,0)
       ELSE  COALESCE(sm.quantity,0)
  END                                                      AS quantity_delta,
  dn.flow_role                                             AS flow_role,
  sm.delivery_note_id                                      AS delivery_note_id,
  sm.created_at                                            AS movement_date
FROM public.stock_movements sm
LEFT JOIN public.delivery_notes dn ON dn.id = sm.delivery_note_id

UNION ALL

SELECT
  psi.id::text                                             AS source_id,
  'sorting'::text                                          AS source_type,
  'entry'::text                                            AS movement_type,
  psb.company_id                                           AS company_id,
  psb.depot_id                                             AS depot_id,
  psb.category_id                                          AS category_id,
  psi.category_product_id                                  AS category_product_id,
  psi.condition                                            AS condition,
  COALESCE(psi.quantity,0)                                 AS quantity_delta,
  NULL::text                                               AS flow_role,
  psb.source_delivery_note_id                              AS delivery_note_id,
  COALESCE(psb.committed_at, psb.completed_at, psb.created_at) AS movement_date
FROM public.pallet_sorting_items psi
JOIN public.pallet_sorting_batches psb ON psb.id = psi.batch_id
WHERE psb.status = 'completed'

UNION ALL

SELECT
  dr.id::text                                              AS source_id,
  'repair'::text                                           AS source_type,
  'repair'::text                                           AS movement_type,
  dr.company_id                                            AS company_id,
  dr.depot_id                                              AS depot_id,
  dr.category_id                                           AS category_id,
  dr.category_product_id                                   AS category_product_id,
  'repaired'::text                                         AS condition,
  COALESCE(dr.quantity_repaired,0)                         AS quantity_delta,
  NULL::text                                               AS flow_role,
  dr.source_delivery_note_id                               AS delivery_note_id,
  COALESCE(dr.logged_at, dr.created_at)                    AS movement_date
FROM public.depot_repairs dr;

COMMENT ON VIEW public.v_company_movements IS
  'Unified per-company movements timeline: stock_movements + sorting + repair.';

GRANT SELECT ON public.v_company_stock_breakdown TO authenticated;
GRANT SELECT ON public.v_company_movements TO authenticated;
