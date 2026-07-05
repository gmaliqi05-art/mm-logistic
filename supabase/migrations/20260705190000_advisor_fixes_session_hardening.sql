/*
  # Advisor fixes for this session's new objects

  The Supabase security/performance advisors flagged three items introduced by
  the accounting/reconciliation work earlier in this session:

  1. `function_search_path_mutable` — `acc_bank_line_tx_score` (20260705180000)
     was created IMMUTABLE but without a pinned `search_path`. It references
     only built-ins, so pin it to a fixed, minimal path.

  2. `authenticated_security_definer_function_executable` — `suggest_bank_matches`
     is only ever invoked server-side by the `import-bank-statement` edge
     function (service_role); the frontend never calls it. Revoke the
     `authenticated` grant so it is not reachable via `/rest/v1/rpc`.

  3. `multiple_permissive_policies` — `acc_posting_accounts` (20260705160000)
     had a `FOR SELECT` policy and a `FOR ALL` policy, so two permissive
     policies overlapped on SELECT for `authenticated`. Replace the `FOR ALL`
     write policy with explicit INSERT/UPDATE/DELETE policies so exactly one
     policy governs SELECT. Behaviour is preserved (members read; admins /
     accountants write).

  Applied to prod via MCP; recorded here.
*/

-- 1. Pin the scoring helper's search_path (definition otherwise unchanged).
CREATE OR REPLACE FUNCTION public.acc_bank_line_tx_score(
  p_ref text, p_e2e text, p_cp_name text, p_cp_iban text, p_book date,
  t_ref text, t_desc text, t_notes text, t_date date, c_name text, c_iban text
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT LEAST(1.0,
    0.30
    + CASE
        WHEN (coalesce(p_ref, '') <> '' AND (
                strpos(lower(coalesce(t_ref, '')),   lower(p_ref)) > 0
             OR strpos(lower(coalesce(t_desc, '')),  lower(p_ref)) > 0
             OR strpos(lower(coalesce(t_notes, '')), lower(p_ref)) > 0))
          OR (coalesce(p_e2e, '') <> '' AND (
                strpos(lower(coalesce(t_ref, '')),  lower(p_e2e)) > 0
             OR strpos(lower(coalesce(t_desc, '')), lower(p_e2e)) > 0))
        THEN 0.45 ELSE 0 END
    + CASE
        WHEN coalesce(p_cp_iban, '') <> '' AND c_iban IS NOT NULL
             AND upper(replace(c_iban, ' ', '')) = upper(replace(p_cp_iban, ' ', ''))
          THEN 0.35
        WHEN coalesce(p_cp_name, '') <> '' AND coalesce(c_name, '') <> ''
             AND (strpos(lower(c_name), lower(p_cp_name)) > 0
               OR strpos(lower(p_cp_name), lower(c_name)) > 0)
          THEN 0.25
        ELSE 0 END
    + CASE
        WHEN t_date IS NOT NULL AND p_book IS NOT NULL AND abs(t_date - p_book) <= 2 THEN 0.15
        WHEN t_date IS NOT NULL AND p_book IS NOT NULL AND abs(t_date - p_book) <= 7 THEN 0.08
        ELSE 0 END
  )::numeric(3,2)
$$;

REVOKE ALL ON FUNCTION public.acc_bank_line_tx_score(text, text, text, text, date, text, text, text, date, text, text) FROM PUBLIC, anon, authenticated;

-- 2. suggest_bank_matches is server-side only.
REVOKE EXECUTE ON FUNCTION public.suggest_bank_matches(uuid) FROM authenticated;

-- 3. Split the acc_posting_accounts FOR ALL policy so SELECT has one policy.
DROP POLICY IF EXISTS "Company admins write posting map" ON public.acc_posting_accounts;

CREATE POLICY "Company admins insert posting map"
  ON public.acc_posting_accounts FOR INSERT TO authenticated
  WITH CHECK (
    private.is_super_admin()
    OR (company_id = private.get_user_company_id()
        AND private.get_user_role() IN ('company_admin', 'accountant'))
  );

CREATE POLICY "Company admins update posting map"
  ON public.acc_posting_accounts FOR UPDATE TO authenticated
  USING (
    private.is_super_admin()
    OR (company_id = private.get_user_company_id()
        AND private.get_user_role() IN ('company_admin', 'accountant'))
  )
  WITH CHECK (
    private.is_super_admin()
    OR (company_id = private.get_user_company_id()
        AND private.get_user_role() IN ('company_admin', 'accountant'))
  );

CREATE POLICY "Company admins delete posting map"
  ON public.acc_posting_accounts FOR DELETE TO authenticated
  USING (
    private.is_super_admin()
    OR (company_id = private.get_user_company_id()
        AND private.get_user_role() IN ('company_admin', 'accountant'))
  );
