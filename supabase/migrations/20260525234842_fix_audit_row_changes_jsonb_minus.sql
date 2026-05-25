/*
  # Fix audit_row_changes jsonb minus operator error

  1. Problem
    - The `audit_row_changes` function used `to_jsonb(NEW) - to_jsonb(OLD)` to compute changed fields
    - The `jsonb - jsonb` operator does not exist in PostgreSQL (only `jsonb - text` and `jsonb - text[]`)
    - This caused "operator does not exist: jsonb - jsonb" errors on every INSERT/UPDATE to profiles and companies tables
    - Registration was blocked because creating a profile/company triggered this broken audit function

  2. Fix
    - Replace the diff computation with storing both `before` and `after` snapshots for UPDATE operations
    - This avoids the unsupported operator entirely while still capturing audit information
    - INSERT and DELETE operations already worked correctly (they only use one snapshot)

  3. Affected triggers
    - `trg_audit_profiles` on `profiles` table
    - `trg_audit_companies` on `companies` table
*/

CREATE OR REPLACE FUNCTION public.audit_row_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
    v_details := jsonb_build_object('before', to_jsonb(OLD), 'after', v_row);
  ELSE
    v_action  := 'create';
    v_row     := to_jsonb(NEW);
    v_details := jsonb_build_object('after', v_row);
  END IF;

  BEGIN v_entity_id := (v_row ->> 'id')::uuid; EXCEPTION WHEN OTHERS THEN v_entity_id := NULL; END;

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
