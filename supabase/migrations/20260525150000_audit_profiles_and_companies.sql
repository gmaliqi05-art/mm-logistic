-- ============================================================================
-- Extend audit_row_changes() coverage to profiles + companies
-- ----------------------------------------------------------------------------
-- Background
--   The third-pass audit flagged a forensic gap: profiles and companies hold
--   the personal data that GDPR Art. 30 / Art. 17 require us to track. The
--   manual logAudit() calls in the React frontend cover only user-initiated
--   flows; service-role writes (edge functions, super-admin tooling, raw SQL
--   via the dashboard) leave no trail.
--
--   We piggy-back on the existing public.audit_row_changes() trigger from
--   migration 20260520140000, but companies need a special branch: the table
--   has no company_id column — its own id IS the tenant id. Without the
--   override, the trigger would skip every change because v_company_id
--   resolves to NULL.
--
-- Safety
--   - The function keeps SECURITY DEFINER + search_path = public.
--   - Failure is still swallowed via the inner BEGIN/EXCEPTION block so a
--     broken audit insert can never block a profile/company update.
--   - Duplicate rows are acceptable: the manual logAudit() calls add
--     friendly context; the trigger adds forensic completeness. We mark
--     the trigger rows with the table name in entity_type so they are
--     trivially filterable.
--   - Idempotent: DROP TRIGGER IF EXISTS + CREATE OR REPLACE FUNCTION.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.audit_row_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_entity_id  uuid;
  v_action     text;
  v_details    jsonb;
  v_row        jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_action  := 'delete';
    v_row     := to_jsonb(OLD);
    v_details := jsonb_build_object('before', v_row);
  ELSIF TG_OP = 'UPDATE' THEN
    v_action  := 'update';
    v_row     := to_jsonb(NEW);
    v_details := jsonb_build_object('changed', to_jsonb(NEW) - to_jsonb(OLD));
  ELSE
    v_action  := 'create';
    v_row     := to_jsonb(NEW);
    v_details := jsonb_build_object('after', v_row);
  END IF;

  BEGIN v_entity_id := (v_row ->> 'id')::uuid; EXCEPTION WHEN OTHERS THEN v_entity_id := NULL; END;

  -- Companies have no company_id column — the row's own id IS the tenant.
  -- Same for any row whose company_id is missing but whose id should be
  -- treated as the company scope.
  IF TG_TABLE_NAME = 'companies' THEN
    v_company_id := v_entity_id;
  ELSE
    BEGIN v_company_id := (v_row ->> 'company_id')::uuid; EXCEPTION WHEN OTHERS THEN v_company_id := NULL; END;
  END IF;

  IF v_company_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  BEGIN
    INSERT INTO audit_logs (company_id, user_id, action, entity_type, entity_id, details)
    VALUES (v_company_id, auth.uid(), v_action, TG_TABLE_NAME, v_entity_id, v_details);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'audit_row_changes(%): %', TG_TABLE_NAME, SQLERRM;
  END;

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.audit_row_changes() FROM public;

-- ----------------------------------------------------------------------------
-- Attach triggers for profiles + companies. The previous migration
-- (20260520140000) deliberately skipped profiles to avoid duplicate rows
-- next to the manual logAudit() calls; forensic completeness now takes
-- precedence over verbosity. Filterable by entity_type='profiles' /
-- 'companies' if a future report wants to dedupe.
-- ----------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_audit_profiles ON profiles;
CREATE TRIGGER trg_audit_profiles
AFTER INSERT OR UPDATE OR DELETE ON profiles
FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes();

DROP TRIGGER IF EXISTS trg_audit_companies ON companies;
CREATE TRIGGER trg_audit_companies
AFTER INSERT OR UPDATE OR DELETE ON companies
FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes();
