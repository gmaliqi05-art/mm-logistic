/*
  # Fix Security Definer View and Function Vulnerabilities

  1. View Changes
    - `v_depot_stock_value`: Recreated with `security_invoker = true` (removes SECURITY DEFINER)

  2. Function Changes
    - `hr_create_attendance_for_leave`: Set immutable search_path, revoke public/anon/authenticated EXECUTE (trigger-only)
    - `hr_update_leave_balance`: Set immutable search_path, revoke public/anon/authenticated EXECUTE (trigger-only)
    - `sorting_batch_completed_notify`: Revoke public/anon/authenticated EXECUTE (trigger-only, already has search_path)
    - `seed_default_leave_types`: Switch to SECURITY INVOKER, set search_path, revoke from anon
    - `apply_repair_completion`: Revoke EXECUTE from anon (already has search_path)

  3. Security
    - Trigger functions are no longer callable via PostgREST RPC
    - View respects RLS of underlying tables
    - All functions have immutable search_path
*/

-- 1. Fix v_depot_stock_value view: recreate with security_invoker
DROP VIEW IF EXISTS public.v_depot_stock_value;

CREATE VIEW public.v_depot_stock_value WITH (security_invoker = true) AS
SELECT s.company_id,
    s.depot_id,
    d.name AS depot_name,
    s.category_id,
    pc.name AS category_name,
    s.category_product_id,
    cp.name AS product_name,
    COALESCE(cp.base_price, 0::numeric)::numeric(12,2) AS unit_price,
    COALESCE(cp.currency, 'EUR'::text) AS currency,
    s.condition,
    sum(s.quantity)::integer AS quantity,
    (sum(s.quantity)::numeric * COALESCE(cp.base_price, 0::numeric))::numeric(14,2) AS line_value
   FROM stock s
     LEFT JOIN depots d ON d.id = s.depot_id
     LEFT JOIN product_categories pc ON pc.id = s.category_id
     LEFT JOIN category_products cp ON cp.id = s.category_product_id
  GROUP BY s.company_id, s.depot_id, d.name, s.category_id, pc.name, s.category_product_id, cp.name, cp.base_price, cp.currency, s.condition
UNION ALL
SELECT dr.company_id,
    dr.depot_id,
    d.name AS depot_name,
    dr.category_id,
    pc.name AS category_name,
    dr.category_product_id,
    COALESCE(cp.name, dr.product_name) AS product_name,
    COALESCE(cp.base_price, 0::numeric)::numeric(12,2) AS unit_price,
    COALESCE(cp.currency, 'EUR'::text) AS currency,
    'damaged'::text AS condition,
    sum(dr.quantity_in - dr.quantity_repaired - dr.quantity_scrapped)::integer AS quantity,
    (sum(dr.quantity_in - dr.quantity_repaired - dr.quantity_scrapped)::numeric * COALESCE(cp.base_price, 0::numeric))::numeric(14,2) AS line_value
   FROM depot_repairs dr
     LEFT JOIN depots d ON d.id = dr.depot_id
     LEFT JOIN product_categories pc ON pc.id = dr.category_id
     LEFT JOIN category_products cp ON cp.id = dr.category_product_id
  GROUP BY dr.company_id, dr.depot_id, d.name, dr.category_id, pc.name, dr.category_product_id, cp.name, dr.product_name, cp.base_price, cp.currency
 HAVING sum(dr.quantity_in - dr.quantity_repaired - dr.quantity_scrapped) > 0;

-- 2. Fix hr_create_attendance_for_leave: set search_path, revoke execute
ALTER FUNCTION public.hr_create_attendance_for_leave() SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.hr_create_attendance_for_leave() FROM public;
REVOKE EXECUTE ON FUNCTION public.hr_create_attendance_for_leave() FROM anon;
REVOKE EXECUTE ON FUNCTION public.hr_create_attendance_for_leave() FROM authenticated;

-- 3. Fix hr_update_leave_balance: set search_path, revoke execute
ALTER FUNCTION public.hr_update_leave_balance() SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.hr_update_leave_balance() FROM public;
REVOKE EXECUTE ON FUNCTION public.hr_update_leave_balance() FROM anon;
REVOKE EXECUTE ON FUNCTION public.hr_update_leave_balance() FROM authenticated;

-- 4. Fix sorting_batch_completed_notify: revoke execute (already has search_path)
REVOKE EXECUTE ON FUNCTION public.sorting_batch_completed_notify() FROM public;
REVOKE EXECUTE ON FUNCTION public.sorting_batch_completed_notify() FROM anon;
REVOKE EXECUTE ON FUNCTION public.sorting_batch_completed_notify() FROM authenticated;

-- 5. Fix seed_default_leave_types: switch to SECURITY INVOKER, set search_path, revoke from anon
ALTER FUNCTION public.seed_default_leave_types(uuid) SECURITY INVOKER;
ALTER FUNCTION public.seed_default_leave_types(uuid) SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.seed_default_leave_types(uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.seed_default_leave_types(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.seed_default_leave_types(uuid) TO authenticated;

-- 6. Fix apply_repair_completion: revoke from anon (keep authenticated access)
REVOKE EXECUTE ON FUNCTION public.apply_repair_completion(uuid, integer, integer, uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.apply_repair_completion(uuid, integer, integer, uuid) FROM anon;
