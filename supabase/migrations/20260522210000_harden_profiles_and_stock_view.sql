/*
  # Harden profiles UPDATE + remove SECURITY DEFINER from stock value view

  Closes two Supabase advisor findings flagged after the edge-function
  hardening in PR #45:

  A. CRITICAL — profiles RLS policy `profiles_update_combined` had
     WITH CHECK (true), letting any authenticated user run
       UPDATE profiles SET role = 'super_admin' WHERE id = auth.uid();
     and become a super_admin. The USING clause allowed self-update,
     and the empty WITH CHECK accepted the new row regardless of
     what role/company_id was set.

     FIX: BEFORE UPDATE trigger that locks `role`, `company_id`,
     `id` and `is_active` against changes by anyone except
     `service_role` and `super_admin`. company_admin can still
     deactivate/reactivate users in their own company (the path
     used by manage-users edge function).

  B. ERROR — view `public.v_depot_stock_value` was defined with
     SECURITY DEFINER, bypassing the RLS on stock/depots/etc.
     Recreated as a regular (security_invoker) view so the caller's
     RLS governs visibility. All four underlying tables already
     enforce tenant-scoped RLS.
*/

CREATE OR REPLACE FUNCTION public.enforce_profile_field_locks()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $fn$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF private.get_user_role() = 'super_admin' THEN
    RETURN NEW;
  END IF;

  IF OLD.role IS DISTINCT FROM NEW.role THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Roli nuk mund te ndryshohet permes UPDATE te drejtperdrejte. Perdorni manage-users.',
      ERRCODE = '42501';
  END IF;

  IF OLD.company_id IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION USING
      MESSAGE = 'company_id nuk mund te ndryshohet permes UPDATE te drejtperdrejte. Perdorni manage-users.',
      ERRCODE = '42501';
  END IF;

  IF OLD.id IS DISTINCT FROM NEW.id THEN
    RAISE EXCEPTION USING
      MESSAGE = 'id nuk mund te ndryshohet.',
      ERRCODE = '42501';
  END IF;

  IF OLD.is_active IS DISTINCT FROM NEW.is_active THEN
    IF private.get_user_role() = 'company_admin'
       AND OLD.company_id = private.get_user_company_id()
       AND NEW.company_id = private.get_user_company_id()
    THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION USING
      MESSAGE = 'is_active nuk mund te ndryshohet nga vete perdoruesi.',
      ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS profiles_lock_critical_fields ON public.profiles;

CREATE TRIGGER profiles_lock_critical_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_profile_field_locks();

COMMENT ON FUNCTION public.enforce_profile_field_locks IS
  'Trigger-only function. Do not expose via PostgREST. Blocks role/company_id/is_active changes by non-super-admins. Companion to the WITH CHECK clause on profiles_update_combined.';

-- ---------------------------------------------------------------
-- B. v_depot_stock_value: drop SECURITY DEFINER
-- ---------------------------------------------------------------

DROP VIEW IF EXISTS public.v_depot_stock_value;

CREATE VIEW public.v_depot_stock_value
WITH (security_invoker = on) AS
SELECT
  s.company_id,
  s.depot_id,
  d.name                                                                AS depot_name,
  s.category_id,
  pc.name                                                               AS category_name,
  s.category_product_id,
  cp.name                                                               AS product_name,
  (COALESCE(cp.base_price, 0::numeric))::numeric(12,2)                  AS unit_price,
  COALESCE(cp.currency, 'EUR'::text)                                    AS currency,
  s.condition,
  SUM(s.quantity)::integer                                              AS quantity,
  ((SUM(s.quantity))::numeric * COALESCE(cp.base_price, 0::numeric))::numeric(14,2) AS line_value
FROM stock s
LEFT JOIN depots             d  ON d.id  = s.depot_id
LEFT JOIN product_categories pc ON pc.id = s.category_id
LEFT JOIN category_products  cp ON cp.id = s.category_product_id
GROUP BY
  s.company_id, s.depot_id, d.name, s.category_id, pc.name,
  s.category_product_id, cp.name, cp.base_price, cp.currency, s.condition;

COMMENT ON VIEW public.v_depot_stock_value IS
  'Depot stock value rollup. security_invoker=on so RLS on the underlying tables governs visibility.';

GRANT SELECT ON public.v_depot_stock_value TO authenticated;
