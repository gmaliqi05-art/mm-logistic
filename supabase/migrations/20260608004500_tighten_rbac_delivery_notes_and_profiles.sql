/*
  # Tighten RBAC on delivery_notes and profiles

  Two RLS gaps identified by the cross-role audit:

  1. `delivery_notes.dnotes_update` only checks `company_id`. A depot worker
     could craft a manual PUT to update a delivery note assigned to a
     different depot in the same company. UI filters by `assigned_depot_id`,
     but RLS does not.

  2. `profiles.profiles_update_own` lets a user update any column of their
     own row. A depot worker with `worker_category = 'reparature'` could
     silently flip themselves to `'depoist'` (or change `role`, `depot_id`,
     `company_id`) and bypass the `<ProtectedRoute>` worker_category gate.

  Fixes:

  - Tighten `dnotes_update`: when the actor is a `depot_worker`, the row's
    `assigned_depot_id` must match the worker's `depot_id`.
  - Add a BEFORE UPDATE trigger on `profiles` that blocks self-modification
    of the locked columns (`role`, `worker_category`, `company_id`,
    `depot_id`, `is_active`). Super admins and the `manage-users` edge
    function (which uses the service role and bypasses RLS / triggers via
    `SECURITY DEFINER`) are unaffected.

  No data changes. Existing valid updates continue to work.
*/

-- 1. Replace dnotes_update with a depot-aware variant.
DROP POLICY IF EXISTS "dnotes_update" ON public.delivery_notes;

CREATE POLICY "dnotes_update" ON public.delivery_notes FOR UPDATE TO authenticated
  USING (
    (
      public.get_user_role() = 'super_admin'
    )
    OR (
      company_id = public.get_user_company_id()
      AND (
        public.get_user_role() <> 'depot_worker'
        OR assigned_depot_id IS NULL
        OR assigned_depot_id = (SELECT depot_id FROM public.profiles WHERE id = auth.uid())
      )
    )
  )
  WITH CHECK (
    (
      public.get_user_role() = 'super_admin'
    )
    OR (
      company_id = public.get_user_company_id()
      AND (
        public.get_user_role() <> 'depot_worker'
        OR assigned_depot_id IS NULL
        OR assigned_depot_id = (SELECT depot_id FROM public.profiles WHERE id = auth.uid())
      )
    )
  );

-- 2. Prevent self-modification of privileged columns on profiles.
CREATE OR REPLACE FUNCTION public.profiles_block_self_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- Only enforce when the row owner is updating their own profile.
  IF auth.uid() IS NULL OR auth.uid() <> NEW.id THEN
    RETURN NEW;
  END IF;

  -- Super admins bypass (their own profile changes are intentional).
  IF public.get_user_role() = 'super_admin' THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'profile.role can only be changed by an administrator';
  END IF;
  IF NEW.worker_category IS DISTINCT FROM OLD.worker_category THEN
    RAISE EXCEPTION 'profile.worker_category can only be changed by an administrator';
  END IF;
  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'profile.company_id is immutable for non-admins';
  END IF;
  IF NEW.depot_id IS DISTINCT FROM OLD.depot_id THEN
    RAISE EXCEPTION 'profile.depot_id can only be changed by an administrator';
  END IF;
  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    RAISE EXCEPTION 'profile.is_active can only be changed by an administrator';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_block_self_privilege_escalation ON public.profiles;
CREATE TRIGGER trg_profiles_block_self_privilege_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_block_self_privilege_escalation();
