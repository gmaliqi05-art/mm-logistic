-- ============================================================================
-- Generic audit-log trigger
-- ----------------------------------------------------------------------------
-- Background
--   The audit_logs table has existed since migration 20260207040657, but the
--   only writers are 14 hand-written logAudit() calls in the React code (in
--   pages/company/Depots.tsx, Drivers.tsx and DeliveryNotes.tsx). Every other
--   table change — stock movements, partner edits, vehicle compliance, invoice
--   edits — leaves no trail.
--
--   This migration adds a generic AFTER INSERT / UPDATE / DELETE trigger that
--   posts a row into audit_logs for any table we attach it to, capturing:
--     company_id   — pulled from NEW.company_id / OLD.company_id
--     user_id      — auth.uid() (NULL for service-role / cron writes)
--     action       — 'create' | 'update' | 'delete'
--     entity_type  — the table name (TG_TABLE_NAME)
--     entity_id    — the row's id column (NEW.id / OLD.id)
--     details      — a small JSONB diff (UPDATE) or the row keys (INSERT/DELETE)
--
--   To avoid duplicating the existing manual entries on depots / profiles /
--   delivery_notes (those code-path logs include extra context), we attach
--   the trigger ONLY to tables that currently have zero audit coverage.
--   The manual logAudit calls in the frontend keep working in parallel for
--   the few tables they cover.
--
-- Safety
--   - SECURITY DEFINER + search_path = public, the standard pattern in this
--     codebase (e.g. apply_repair_completion in migration 20260520120100).
--   - Exception-safe: if audit_logs insert fails for any reason (e.g. the
--     row has no company_id field), the trigger raises a WARNING and
--     swallows the error so business writes are not blocked.
--   - Re-runnable: every DROP TRIGGER IF EXISTS / CREATE OR REPLACE; the
--     migration is idempotent.
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
BEGIN
  -- Pick which row carries company_id / id for this operation
  IF TG_OP = 'DELETE' THEN
    v_action := 'delete';
    BEGIN v_company_id := (to_jsonb(OLD) ->> 'company_id')::uuid; EXCEPTION WHEN OTHERS THEN v_company_id := NULL; END;
    BEGIN v_entity_id  := (to_jsonb(OLD) ->> 'id')::uuid;          EXCEPTION WHEN OTHERS THEN v_entity_id  := NULL; END;
    v_details := jsonb_build_object('before', to_jsonb(OLD));
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update';
    BEGIN v_company_id := (to_jsonb(NEW) ->> 'company_id')::uuid; EXCEPTION WHEN OTHERS THEN v_company_id := NULL; END;
    BEGIN v_entity_id  := (to_jsonb(NEW) ->> 'id')::uuid;          EXCEPTION WHEN OTHERS THEN v_entity_id  := NULL; END;
    v_details := jsonb_build_object('changed', to_jsonb(NEW) - to_jsonb(OLD));
  ELSE
    v_action := 'create';
    BEGIN v_company_id := (to_jsonb(NEW) ->> 'company_id')::uuid; EXCEPTION WHEN OTHERS THEN v_company_id := NULL; END;
    BEGIN v_entity_id  := (to_jsonb(NEW) ->> 'id')::uuid;          EXCEPTION WHEN OTHERS THEN v_entity_id  := NULL; END;
    v_details := jsonb_build_object('after', to_jsonb(NEW));
  END IF;

  -- Without a company_id we cannot satisfy audit_logs RLS, and trying would
  -- error out and abort the original write. Skip silently.
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
-- Attach the trigger to tables that currently have no audit coverage.
-- Deliberately NOT applied to:
--   - depots, profiles, delivery_notes — already covered by manual
--     logAudit() calls that include user-friendly context (avoid dup rows)
--   - audit_logs itself — would recurse
--   - notifications, push_subscriptions, driver_locations — too high-volume
--     to keep an audit row per change; not security-sensitive
--   - chat_messages — already isolated by company in 20260207033230
-- ----------------------------------------------------------------------------

-- Stock movement / inventory changes — currently zero coverage
DROP TRIGGER IF EXISTS trg_audit_stock ON stock;
CREATE TRIGGER trg_audit_stock
AFTER INSERT OR UPDATE OR DELETE ON stock
FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes();

DROP TRIGGER IF EXISTS trg_audit_stock_movements ON stock_movements;
CREATE TRIGGER trg_audit_stock_movements
AFTER INSERT OR UPDATE OR DELETE ON stock_movements
FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes();

DROP TRIGGER IF EXISTS trg_audit_stock_alerts ON stock_alerts;
CREATE TRIGGER trg_audit_stock_alerts
AFTER INSERT OR UPDATE OR DELETE ON stock_alerts
FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes();

-- Fleet records & compliance — touches German legal obligations
DROP TRIGGER IF EXISTS trg_audit_vehicles ON vehicles;
CREATE TRIGGER trg_audit_vehicles
AFTER INSERT OR UPDATE OR DELETE ON vehicles
FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes();

DROP TRIGGER IF EXISTS trg_audit_vehicle_inspections ON vehicle_inspections;
CREATE TRIGGER trg_audit_vehicle_inspections
AFTER INSERT OR UPDATE OR DELETE ON vehicle_inspections
FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes();

DROP TRIGGER IF EXISTS trg_audit_vehicle_insurance ON vehicle_insurance;
CREATE TRIGGER trg_audit_vehicle_insurance
AFTER INSERT OR UPDATE OR DELETE ON vehicle_insurance
FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes();

DROP TRIGGER IF EXISTS trg_audit_vehicle_taxes ON vehicle_taxes;
CREATE TRIGGER trg_audit_vehicle_taxes
AFTER INSERT OR UPDATE OR DELETE ON vehicle_taxes
FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes();

DROP TRIGGER IF EXISTS trg_audit_driver_licenses ON driver_licenses;
CREATE TRIGGER trg_audit_driver_licenses
AFTER INSERT OR UPDATE OR DELETE ON driver_licenses
FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes();

DROP TRIGGER IF EXISTS trg_audit_driver_qualifications ON driver_qualifications;
CREATE TRIGGER trg_audit_driver_qualifications
AFTER INSERT OR UPDATE OR DELETE ON driver_qualifications
FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes();

DROP TRIGGER IF EXISTS trg_audit_driver_medical ON driver_medical;
CREATE TRIGGER trg_audit_driver_medical
AFTER INSERT OR UPDATE OR DELETE ON driver_medical
FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes();

-- Partner & B2B counterparty records
DROP TRIGGER IF EXISTS trg_audit_acc_contacts ON acc_contacts;
CREATE TRIGGER trg_audit_acc_contacts
AFTER INSERT OR UPDATE OR DELETE ON acc_contacts
FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes();

-- Accounting source records (invoices, payments) — financial trail
DROP TRIGGER IF EXISTS trg_audit_acc_invoices ON acc_invoices;
CREATE TRIGGER trg_audit_acc_invoices
AFTER INSERT OR UPDATE OR DELETE ON acc_invoices
FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes();

-- Pallet sorting and repairs
DROP TRIGGER IF EXISTS trg_audit_pallet_sorting_batches ON pallet_sorting_batches;
CREATE TRIGGER trg_audit_pallet_sorting_batches
AFTER INSERT OR UPDATE OR DELETE ON pallet_sorting_batches
FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes();

DROP TRIGGER IF EXISTS trg_audit_depot_repairs ON depot_repairs;
CREATE TRIGGER trg_audit_depot_repairs
AFTER INSERT OR UPDATE OR DELETE ON depot_repairs
FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes();
