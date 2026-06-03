-- Prevent company_admin from mutating billing-related fields on their own
-- company row. accounting_enabled and is_active must be flipped exclusively
-- by stripe-webhook (using service role) or by super_admin via the platform
-- console. Without this guard, a tenant could bypass payment by calling
-- PostgREST directly to set accounting_enabled = true on their company.
--
-- Mechanism: a BEFORE UPDATE trigger that runs as INVOKER. When the caller
-- is a company_admin (not super_admin, not service role) and they attempt to
-- change one of the locked columns, raise an exception. The service role
-- bypasses RLS entirely so this trigger does not affect edge functions.

CREATE OR REPLACE FUNCTION public.enforce_company_billing_field_locks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, private
AS $$
DECLARE
  v_role text;
BEGIN
  -- Allow updates that don't touch any locked column.
  IF NEW.accounting_enabled IS NOT DISTINCT FROM OLD.accounting_enabled
     AND NEW.is_active IS NOT DISTINCT FROM OLD.is_active THEN
    RETURN NEW;
  END IF;

  -- Service role (used by edge functions like stripe-webhook and
  -- register-company) has auth.uid() = NULL because there is no JWT user.
  -- Allow those calls through unconditionally — they are how the legitimate
  -- billing/activation paths set these fields.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  v_role := private.get_user_role();

  -- super_admin can change everything via the platform console.
  IF v_role = 'super_admin' THEN
    RETURN NEW;
  END IF;

  -- For anyone else, flag the attempt clearly. The Albanian phrasing matches
  -- the rest of the platform's error messages so it surfaces well in the UI.
  IF NEW.accounting_enabled IS DISTINCT FROM OLD.accounting_enabled THEN
    RAISE EXCEPTION 'accounting_enabled nuk mund te ndryshohet permes klientit; aktivizimi behet vetem pas pageses se konfirmuar.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    RAISE EXCEPTION 'is_active nuk mund te ndryshohet permes klientit; menaxhohet vetem nga super_admin ose nga sistemi i pagesave.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_company_billing_field_locks ON public.companies;
CREATE TRIGGER enforce_company_billing_field_locks
  BEFORE UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_company_billing_field_locks();

COMMENT ON FUNCTION public.enforce_company_billing_field_locks IS
  'Blocks non-super_admin / non-service-role updates to companies.accounting_enabled and companies.is_active. Service role calls (edge functions like stripe-webhook) bypass triggers via RLS bypass; super_admin is allowed explicitly.';
