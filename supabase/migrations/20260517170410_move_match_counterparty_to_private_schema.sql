/*
  # Move match_counterparty_company cross-company lookup to private schema

  1. Problem
    - public.match_counterparty_company is SECURITY DEFINER and callable by authenticated
    - Security scanner flags this as a risk
    - The function needs cross-company access to match VAT/email/phone across all companies
    - Cannot work as SECURITY INVOKER because RLS restricts company visibility

  2. Solution
    - Move the full cross-company lookup logic to private.match_counterparty_company_internal
    - This function is SECURITY DEFINER but NOT exposed via PostgREST (private schema)
    - Replace the public function with SECURITY INVOKER wrapper that calls the private helper
    - The private helper contains all auth guards (auth.uid() check, relationship verification)

  3. Security
    - private schema functions are never exposed via PostgREST REST API
    - The private helper still verifies auth.uid() and checks pre-existing relationships
    - Only returns company IDs where caller has a documented business relationship
    - No raw company data (name, email, etc.) is exposed to callers
*/

-- Step 1: Create the private helper with full logic (SECURITY DEFINER, not exposed via API)
CREATE OR REPLACE FUNCTION private.match_counterparty_company_internal(
  p_vat text,
  p_email text,
  p_phone text,
  p_name text,
  p_caller_uid uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_norm_phone text;
  v_caller_company uuid;
BEGIN
  SELECT company_id INTO v_caller_company FROM profiles WHERE id = p_caller_uid;
  IF v_caller_company IS NULL THEN RETURN NULL; END IF;

  IF p_vat IS NOT NULL AND length(trim(p_vat)) > 3 THEN
    SELECT id INTO v_id FROM companies WHERE lower(trim(vat_number)) = lower(trim(p_vat)) LIMIT 1;
    IF v_id IS NOT NULL THEN
      IF v_id = v_caller_company THEN RETURN v_id; END IF;
      IF EXISTS (
        SELECT 1 FROM delivery_notes
        WHERE company_id = v_caller_company AND counterparty_company_id = v_id
        UNION ALL
        SELECT 1 FROM acc_contacts
        WHERE company_id = v_caller_company AND lower(trim(vat_number)) = lower(trim(p_vat))
      ) THEN RETURN v_id; END IF;
    END IF;
  END IF;

  IF p_email IS NOT NULL AND length(trim(p_email)) > 3 THEN
    SELECT id INTO v_id FROM companies WHERE lower(trim(email)) = lower(trim(p_email)) LIMIT 1;
    IF v_id IS NOT NULL THEN
      IF v_id = v_caller_company THEN RETURN v_id; END IF;
      IF EXISTS (
        SELECT 1 FROM delivery_notes
        WHERE company_id = v_caller_company AND counterparty_company_id = v_id
        UNION ALL
        SELECT 1 FROM acc_contacts
        WHERE company_id = v_caller_company AND lower(trim(email)) = lower(trim(p_email))
      ) THEN RETURN v_id; END IF;
    END IF;
  END IF;

  IF p_phone IS NOT NULL THEN
    v_norm_phone := regexp_replace(p_phone, '[^0-9]', '', 'g');
    IF length(v_norm_phone) >= 6 THEN
      SELECT id INTO v_id FROM companies
      WHERE regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g') = v_norm_phone LIMIT 1;
      IF v_id IS NOT NULL THEN
        IF v_id = v_caller_company THEN RETURN v_id; END IF;
        IF EXISTS (
          SELECT 1 FROM delivery_notes
          WHERE company_id = v_caller_company AND counterparty_company_id = v_id
        ) THEN RETURN v_id; END IF;
      END IF;
    END IF;
  END IF;

  IF p_name IS NOT NULL AND length(trim(p_name)) > 3 THEN
    SELECT id INTO v_id FROM companies WHERE lower(trim(name)) = lower(trim(p_name)) LIMIT 1;
    IF v_id IS NOT NULL THEN
      IF v_id = v_caller_company THEN RETURN v_id; END IF;
      IF EXISTS (
        SELECT 1 FROM delivery_notes
        WHERE company_id = v_caller_company AND counterparty_company_id = v_id
        UNION ALL
        SELECT 1 FROM acc_contacts
        WHERE company_id = v_caller_company AND lower(trim(name)) = lower(trim(p_name))
      ) THEN RETURN v_id; END IF;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

-- Revoke from all roles (only callable internally by other functions)
REVOKE EXECUTE ON FUNCTION private.match_counterparty_company_internal(text, text, text, text, uuid) FROM public, anon, authenticated;

-- Step 2: Replace public function with SECURITY INVOKER wrapper
DROP FUNCTION IF EXISTS public.match_counterparty_company(text, text, text, text);

CREATE FUNCTION public.match_counterparty_company(
  p_vat text,
  p_email text,
  p_phone text,
  p_name text
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN private.match_counterparty_company_internal(p_vat, p_email, p_phone, p_name, auth.uid());
END;
$$;

-- Only authenticated users can call
REVOKE EXECUTE ON FUNCTION public.match_counterparty_company(text, text, text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.match_counterparty_company(text, text, text, text) TO authenticated;
