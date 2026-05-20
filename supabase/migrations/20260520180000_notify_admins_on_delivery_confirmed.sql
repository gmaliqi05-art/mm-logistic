-- ============================================================================
-- Notify company admins when a delivery note hits 'confirmed' so they can
-- create the invoice
-- ----------------------------------------------------------------------------
-- Background
--   Audit issue #2 (HIGH) flagged that accounting and logistics are
--   decoupled: there's a "Krijo fature" button on a confirmed delivery
--   note that prefills /accounting/invoices/new?delivery_note_id=X, but
--   nothing tells the admin "hey, this delivery is ready to be billed".
--
--   Full auto-invoice creation is a business decision (pricing, VAT,
--   currency, bank account). This migration takes the middle ground:
--   the moment a delivery flips to 'confirmed', insert a notification
--   row for every active company_admin in the owning company. The bell
--   dropdown links to the existing invoice-creation flow. Admin
--   reviews and finalises - no surprise auto-invoices, but also no
--   forgotten-to-bill silently.
--
-- Why a trigger
--   We could put the notify in the React layer (in DeliveryReviewPanel
--   when status becomes 'confirmed'), and that already exists for the
--   driver side. But a delivery can ALSO flip to confirmed via:
--     - the partner_flow_events trigger paths
--     - manual admin override
--     - a future cron / background process
--   A trigger covers all sources in one place.
--
-- Idempotency
--   The trigger only fires on UPDATE OF status AND status IS DISTINCT
--   FROM OLD. So a save with no status change won't spam notifications.
--   It also explicitly checks NEW.status = 'confirmed', so flipping
--   between any other states is silent.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.notify_admins_on_delivery_confirmed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner_name text;
  v_message      text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF NEW.status <> 'confirmed' THEN
    RETURN NEW;
  END IF;
  IF NEW.company_id IS NULL THEN
    RETURN NEW;
  END IF;
  -- Only notify for sales-flow notes (we're the consignor). Pickups,
  -- carrier-only and custody don't get auto-billed.
  IF NEW.flow_role IS NOT NULL AND NEW.flow_role <> 'sender' THEN
    RETURN NEW;
  END IF;
  IF NEW.acc_invoice_id IS NOT NULL THEN
    -- Already invoiced. Nothing to do.
    RETURN NEW;
  END IF;

  v_partner_name := coalesce(
    NEW.consignee_name,
    NEW.counterparty_name,
    NEW.partner_name,
    'partneri'
  );
  v_message := 'Dergesa ' || coalesce(NEW.note_number, '') || ' u konfirmua. ' ||
               'Krijo faturen per ' || v_partner_name || '.';

  BEGIN
    INSERT INTO notifications (user_id, type, title, message, reference_id, data)
    SELECT
      p.id,
      'delivery',
      'Dergesa eshte gati per faturim',
      v_message,
      NEW.id,
      jsonb_build_object(
        'titleKey',   'notifications.templates.deliveryReadyForInvoice.title',
        'messageKey', 'notifications.templates.deliveryReadyForInvoice.body',
        'params',     jsonb_build_object(
          'number',  coalesce(NEW.note_number, ''),
          'partner', v_partner_name
        ),
        'action_url', '/company/invoices/new?delivery_note_id=' || NEW.id
      )
    FROM profiles p
    WHERE p.company_id = NEW.company_id
      AND p.role = 'company_admin'
      AND p.is_active = true;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_admins_on_delivery_confirmed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_admins_on_delivery_confirmed() FROM public;

DROP TRIGGER IF EXISTS trg_notify_admins_on_delivery_confirmed ON delivery_notes;
CREATE TRIGGER trg_notify_admins_on_delivery_confirmed
AFTER UPDATE OF status ON delivery_notes
FOR EACH ROW EXECUTE FUNCTION public.notify_admins_on_delivery_confirmed();
