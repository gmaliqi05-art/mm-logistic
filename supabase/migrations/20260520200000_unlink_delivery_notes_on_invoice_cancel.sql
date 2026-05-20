-- ============================================================================
-- Unlink delivery_note when its acc_invoice gets cancelled
-- ----------------------------------------------------------------------------
-- Background
--   delivery_notes.acc_invoice_id is set by the InvoiceBuilder prefill flow
--   (or by the create_invoice_from_delivery_note RPC). That link drives the
--   "Pa fatura" widget on the company dashboard and the unbilled-notes
--   panel on the accounting dashboard — once a delivery has a linked
--   invoice, both stop nagging.
--
--   But if the invoice later gets CANCELLED (e.g. issued in error, or
--   replaced with a credit note), the delivery_note keeps the stale
--   acc_invoice_id pointing at a cancelled row. The dashboards happily
--   treat the delivery as "billed" even though no valid invoice exists.
--   The admin has to manually re-link or remember to re-bill.
--
-- This migration
--   AFTER UPDATE OF status ON acc_invoices: when status flips TO 'cancelled'
--   from any non-cancelled value, clear acc_invoice_id and invoiced_at on
--   every delivery_note that pointed at it. Same trigger also fires
--   notifications to active company_admins so they don't miss it.
--
--   Idempotent. Exception-swallowing so a notification failure cannot
--   roll back the invoice cancellation.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.unlink_delivery_notes_on_invoice_cancelled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unlinked_count integer;
  v_note_numbers text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF NEW.status <> 'cancelled' OR OLD.status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  -- Collect the note numbers for the notification before we unlink them
  SELECT count(*), string_agg(coalesce(note_number, '?'), ', ')
    INTO v_unlinked_count, v_note_numbers
  FROM delivery_notes
  WHERE acc_invoice_id = NEW.id;

  IF v_unlinked_count = 0 THEN
    RETURN NEW;
  END IF;

  UPDATE delivery_notes
    SET acc_invoice_id = NULL,
        invoiced_at = NULL,
        updated_at = now()
    WHERE acc_invoice_id = NEW.id;

  -- Notify active company admins that the previously-billed deliveries
  -- are now back in the unbilled bucket
  BEGIN
    INSERT INTO notifications (user_id, type, title, message, reference_id, data)
    SELECT
      p.id,
      'system',
      'Fatura u anulua',
      'Fatura ' || coalesce(NEW.invoice_number, '?') || ' u anulua. ' ||
      v_unlinked_count || ' dergesa (' || v_note_numbers || ') jane perseri pa fature.',
      NEW.id,
      jsonb_build_object(
        'titleKey',   'notifications.templates.invoiceCancelledUnlink.title',
        'messageKey', 'notifications.templates.invoiceCancelledUnlink.body',
        'params',     jsonb_build_object(
          'invoice', coalesce(NEW.invoice_number, ''),
          'count',   v_unlinked_count::text,
          'notes',   v_note_numbers
        ),
        'action_url', '/company/delivery-notes'
      )
    FROM profiles p
    WHERE p.company_id = NEW.company_id
      AND p.role = 'company_admin'
      AND p.is_active = true;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'unlink_delivery_notes_on_invoice_cancelled notify failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.unlink_delivery_notes_on_invoice_cancelled() FROM public;

DROP TRIGGER IF EXISTS trg_unlink_delivery_notes_on_invoice_cancelled ON acc_invoices;
CREATE TRIGGER trg_unlink_delivery_notes_on_invoice_cancelled
AFTER UPDATE OF status ON acc_invoices
FOR EACH ROW EXECUTE FUNCTION public.unlink_delivery_notes_on_invoice_cancelled();

-- ----------------------------------------------------------------------------
-- One-time backfill: any delivery_note that currently points at a cancelled
-- invoice gets unlinked. Same scope and shape as the trigger, but without
-- the notification (those are historical and not actionable).
-- ----------------------------------------------------------------------------
UPDATE delivery_notes dn
  SET acc_invoice_id = NULL,
      invoiced_at = NULL,
      updated_at = now()
FROM acc_invoices ai
WHERE dn.acc_invoice_id = ai.id
  AND ai.status = 'cancelled';
