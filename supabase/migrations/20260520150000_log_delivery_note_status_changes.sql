-- ============================================================================
-- Log delivery_notes status transitions to audit_logs
-- ----------------------------------------------------------------------------
-- Background
--   The generic audit_row_changes trigger (20260520140000) deliberately
--   skips delivery_notes because the React side already calls logAudit()
--   on create/delete and a couple of updates. But the status field on a
--   delivery note drives the whole logistics workflow (draft -> sent ->
--   in_transit -> delivered -> pending_company_review -> pending_stock_
--   confirmation -> completed | cancelled), and the audit report flagged
--   that the state machine is enforced only in the UI — a raw POST could
--   theoretically jump from 'draft' straight to 'completed'.
--
--   Rather than adding a hard CHECK that could break legitimate edge
--   cases we have not enumerated yet, this migration adds a SOFT
--   observability layer: every status change on delivery_notes is
--   logged to audit_logs with action='status_change' and a JSON detail
--   that includes both the old and new value plus the note_number for
--   easy grepping. Hard enforcement can be layered on later once we
--   know which transitions are actually safe to block.
--
-- Safety
--   - Only fires when OLD.status IS DISTINCT FROM NEW.status, so the
--     bulk re-saves the UI does (refresh, partial edits) don't flood
--     audit_logs with status-change rows that aren't really changes.
--   - SECURITY DEFINER so it can write to audit_logs even when the
--     caller's row-level policy on audit_logs is strict.
--   - Exception-swallowing: a downstream audit failure must never
--     prevent a legitimate delivery-note update from going through.
--   - Idempotent: DROP TRIGGER IF EXISTS + CREATE OR REPLACE FUNCTION.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.log_delivery_note_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.company_id IS NOT NULL THEN
    BEGIN
      INSERT INTO audit_logs (
        company_id, user_id, action, entity_type, entity_id, details
      ) VALUES (
        NEW.company_id,
        auth.uid(),
        'status_change',
        'delivery_notes',
        NEW.id,
        jsonb_build_object(
          'from', OLD.status,
          'to', NEW.status,
          'note_number', NEW.note_number,
          'assigned_driver_id', NEW.assigned_driver_id,
          'changed_at', now()
        )
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'log_delivery_note_status_change: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_delivery_note_status_change() FROM public;

DROP TRIGGER IF EXISTS trg_log_delivery_note_status ON delivery_notes;
CREATE TRIGGER trg_log_delivery_note_status
AFTER UPDATE OF status ON delivery_notes
FOR EACH ROW EXECUTE FUNCTION public.log_delivery_note_status_change();

-- ----------------------------------------------------------------------------
-- Same observability layer for acc_invoices.status. Even more important
-- here because invoices are financial documents and the regulator
-- (especially under DE GoBD) expects a clear trail of when a document
-- moved from draft -> sent -> paid / overdue / cancelled.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.log_invoice_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.company_id IS NOT NULL THEN
    BEGIN
      INSERT INTO audit_logs (
        company_id, user_id, action, entity_type, entity_id, details
      ) VALUES (
        NEW.company_id,
        auth.uid(),
        'status_change',
        'acc_invoices',
        NEW.id,
        jsonb_build_object(
          'from', OLD.status,
          'to', NEW.status,
          'invoice_number', NEW.invoice_number,
          'total', NEW.total,
          'currency', NEW.currency,
          'changed_at', now()
        )
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'log_invoice_status_change: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_invoice_status_change() FROM public;

DROP TRIGGER IF EXISTS trg_log_invoice_status ON acc_invoices;
CREATE TRIGGER trg_log_invoice_status
AFTER UPDATE OF status ON acc_invoices
FOR EACH ROW EXECUTE FUNCTION public.log_invoice_status_change();
