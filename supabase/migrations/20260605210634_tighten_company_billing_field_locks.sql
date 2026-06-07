-- Migration: tighten enforce_company_billing_field_locks to also accept
-- auth.role() = 'service_role' explicitly, not just auth.uid() IS NULL.
--
-- M5-sec from the deep audit. The original (PR #148) trigger let through
-- any caller whose auth.uid() was NULL — which is service_role today, but
-- could also be any future custom JWT minted without a sub claim. The
-- audited enforce_profile_field_locks uses auth.role() = 'service_role'
-- as the explicit gate; bring this trigger in line so the policy is
-- consistent and resistant to non-service-role NULL-sub tokens.

CREATE OR REPLACE FUNCTION public.enforce_company_billing_field_locks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_role text;
BEGIN
  -- Allow updates that don't touch any locked column.
  IF NEW.accounting_enabled IS NOT DISTINCT FROM OLD.accounting_enabled
     AND NEW.is_active IS NOT DISTINCT FROM OLD.is_active THEN
    RETURN NEW;
  END IF;

  -- Service role used by edge functions (stripe-webhook, register-company,
  -- etc.) explicitly carries the 'service_role' JWT role; accept that
  -- channel directly.
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Defensive: an absent JWT (auth.uid() NULL) usually means service role
  -- in this codebase, but to avoid being fooled by a future JWT minted
  -- without a sub claim, require both the missing uid AND a non-user role
  -- ('anon' / 'service_role'). Plain user JWTs always have auth.uid()
  -- populated.
  IF auth.uid() IS NULL AND auth.role() IN ('service_role', 'anon') THEN
    RETURN NEW;
  END IF;

  v_role := private.get_user_role();
  IF v_role = 'super_admin' THEN
    RETURN NEW;
  END IF;

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
