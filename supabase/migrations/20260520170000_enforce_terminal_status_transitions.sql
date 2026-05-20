-- ============================================================================
-- Hard enforcement of terminal-status transitions on delivery_notes
-- and acc_invoices
-- ----------------------------------------------------------------------------
-- Background
--   Migration 20260520150000 added SOFT observability of status transitions
--   (log every change to audit_logs). That gave us visibility but the
--   state machine itself was still enforceable only in the UI - a raw
--   POST could still flip a 'completed' delivery back to 'draft' or
--   reopen a 'cancelled' invoice.
--
-- This migration
--   Adds a strict CHECK at the trigger level that blocks the obviously-
--   invalid transitions while staying permissive about everything else
--   (PR #6 audit explicitly said: be conservative, do not block legit
--   edge cases we have not enumerated yet).
--
-- What is blocked
--   delivery_notes:
--     completed  -> *     except cancelled    (cancelling a completed
--                                              delivery is allowed only
--                                              as a corrective entry)
--     cancelled  -> *     except draft        (re-opening a cancellation
--                                              is allowed only by going
--                                              back to draft for re-edit)
--   acc_invoices:
--     paid       -> *     except cancelled    (same shape; allows credit
--                                              note flow which reverses
--                                              a payment via cancellation)
--     cancelled  -> *     except draft        (same shape)
--
-- What is allowed
--   Every other transition. The 8-state delivery flow
--   (draft -> sent -> in_transit -> delivered -> pending_company_review
--    -> pending_stock_confirmation -> confirmed -> completed | cancelled)
--   and the parallel pending_company_review <-> in_transit reject path
--   are all unaffected.
--
-- Emergency bypass
--   A SET LOCAL "app.allow_status_jump" = 'true' inside a transaction
--   skips the check for that transaction only. Used by future
--   admin-only repair scripts. Default is NULL, which means enforce.
--   Service-role connections can opt in by issuing the SET LOCAL
--   before their UPDATE.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_delivery_note_status_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_bypass text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  v_bypass := current_setting('app.allow_status_jump', true);
  IF v_bypass = 'true' THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'completed' AND NEW.status <> 'cancelled' THEN
    RAISE EXCEPTION
      'delivery_notes: cannot transition from completed to %. Allowed: cancelled.',
      NEW.status
      USING ERRCODE = '23514';
  END IF;

  IF OLD.status = 'cancelled' AND NEW.status <> 'draft' THEN
    RAISE EXCEPTION
      'delivery_notes: cannot transition from cancelled to %. Allowed: draft (reactivate).',
      NEW.status
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_delivery_note_status_transition() FROM public;

DROP TRIGGER IF EXISTS trg_enforce_delivery_note_status ON delivery_notes;
CREATE TRIGGER trg_enforce_delivery_note_status
BEFORE UPDATE OF status ON delivery_notes
FOR EACH ROW EXECUTE FUNCTION public.enforce_delivery_note_status_transition();

-- ----------------------------------------------------------------------------
-- Same shape for acc_invoices. Paid and cancelled are the terminal states
-- under GoBD German bookkeeping rules; a paid invoice must not silently
-- revert to draft/sent because that would erase a financial event.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_invoice_status_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_bypass text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  v_bypass := current_setting('app.allow_status_jump', true);
  IF v_bypass = 'true' THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'paid' AND NEW.status <> 'cancelled' THEN
    RAISE EXCEPTION
      'acc_invoices: cannot transition from paid to %. Allowed: cancelled (issue credit note instead).',
      NEW.status
      USING ERRCODE = '23514';
  END IF;

  IF OLD.status = 'cancelled' AND NEW.status <> 'draft' THEN
    RAISE EXCEPTION
      'acc_invoices: cannot transition from cancelled to %. Allowed: draft (re-edit).',
      NEW.status
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_invoice_status_transition() FROM public;

DROP TRIGGER IF EXISTS trg_enforce_invoice_status ON acc_invoices;
CREATE TRIGGER trg_enforce_invoice_status
BEFORE UPDATE OF status ON acc_invoices
FOR EACH ROW EXECUTE FUNCTION public.enforce_invoice_status_transition();
