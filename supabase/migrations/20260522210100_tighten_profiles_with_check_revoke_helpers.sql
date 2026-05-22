/*
  # Tighten WITH CHECK on profiles_update_combined + revoke trigger helper

  Follow-up on harden_profiles_and_stock_view. The trigger blocks the
  privilege-escalation path at the row level, but the linter still
  flags the policy's `WITH CHECK (true)` as a smell. Replace it with
  a restrictive expression that mirrors USING — the trigger becomes
  belt-and-suspenders.

  Also revoke EXECUTE on `enforce_profile_field_locks` from anon and
  authenticated so it cannot be invoked via PostgREST (it is a
  trigger-only function).
*/

DROP POLICY IF EXISTS profiles_update_combined ON public.profiles;

CREATE POLICY profiles_update_combined ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (
    private.get_user_role() = 'super_admin'
    OR (
      private.get_user_role() = 'company_admin'
      AND company_id = private.get_user_company_id()
    )
    OR id = (SELECT auth.uid())
  )
  WITH CHECK (
    private.get_user_role() = 'super_admin'
    OR (
      private.get_user_role() = 'company_admin'
      AND company_id = private.get_user_company_id()
    )
    OR id = (SELECT auth.uid())
  );

REVOKE EXECUTE ON FUNCTION public.enforce_profile_field_locks() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_profile_field_locks() FROM anon;
REVOKE EXECUTE ON FUNCTION public.enforce_profile_field_locks() FROM authenticated;
