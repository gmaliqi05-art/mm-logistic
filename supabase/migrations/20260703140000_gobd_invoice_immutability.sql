/*
  # GoBD B-C1: immutability of finalized invoices

  GoBD Unveränderbarkeit: once an invoice is issued it must not be silently
  altered or deleted — corrections happen through a credit note / Storno, not
  by editing the original. Today the app (InvoiceBuilder.save) re-saves an
  existing invoice with status='draft' and rewrites its line items, and the
  journal trigger then deletes + re-posts — so a booked invoice's number,
  amounts, VAT and journal could all change after the fact.

  This enforces immutability at the DB level (belt-and-braces beyond the
  app-side read-only guard shipped in the same PR):

  - A finalized invoice = status NOT IN ('draft','cancelled').
  - On UPDATE of a finalized invoice: block changes to any financial /
    identity field, and block reverting status back to 'draft'. Legitimate
    transitions still pass: status progression (sent → partial → overdue →
    paid), cancellation (→ 'cancelled' for a Storno), and non-financial fields
    (sent_at, paid_at, notes, payment_reference, document_url, …).
  - On DELETE of a finalized invoice: block entirely.
  - Line items (acc_invoice_items) of a finalized invoice: block
    INSERT/UPDATE/DELETE.

  Corrections remain possible: a credit note is a NEW invoice
  (invoice_type='credit_note', its own id/number), so it is never blocked.
  Drafts remain fully editable. Error messages are Albanian per project
  convention.
*/

-- 1. acc_invoices UPDATE/DELETE guard ----------------------------------------
CREATE OR REPLACE FUNCTION public.acc_invoices_enforce_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IS NOT NULL AND OLD.status NOT IN ('draft', 'cancelled') THEN
      RAISE EXCEPTION 'Fatura e leshuar % nuk mund te fshihet (GoBD). Perdorni nje nota kreditit / storno.',
        COALESCE(OLD.invoice_number, OLD.id::text);
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE: only guard rows that were already finalized.
  IF OLD.status IS NULL OR OLD.status IN ('draft', 'cancelled') THEN
    RETURN NEW;
  END IF;

  -- A finalized invoice can never go back to draft.
  IF NEW.status = 'draft' THEN
    RAISE EXCEPTION 'Fatura e leshuar % nuk mund te kthehet ne draft (GoBD).',
      COALESCE(OLD.invoice_number, OLD.id::text);
  END IF;

  -- Financial / identity fields are frozen once issued.
  IF NEW.invoice_number         IS DISTINCT FROM OLD.invoice_number
     OR NEW.invoice_date        IS DISTINCT FROM OLD.invoice_date
     OR NEW.invoice_type        IS DISTINCT FROM OLD.invoice_type
     OR NEW.company_id          IS DISTINCT FROM OLD.company_id
     OR NEW.contact_id          IS DISTINCT FROM OLD.contact_id
     OR NEW.currency            IS DISTINCT FROM OLD.currency
     OR NEW.subtotal            IS DISTINCT FROM OLD.subtotal
     OR NEW.vat_amount          IS DISTINCT FROM OLD.vat_amount
     OR NEW.discount            IS DISTINCT FROM OLD.discount
     OR NEW.total               IS DISTINCT FROM OLD.total
     OR NEW.reverse_charge      IS DISTINCT FROM OLD.reverse_charge
     OR NEW.intra_community_supply IS DISTINCT FROM OLD.intra_community_supply
     OR NEW.vat_override        IS DISTINCT FROM OLD.vat_override
     OR NEW.exchange_rate_to_eur IS DISTINCT FROM OLD.exchange_rate_to_eur
     OR NEW.exchange_rate       IS DISTINCT FROM OLD.exchange_rate
     OR NEW.delivery_note_id    IS DISTINCT FROM OLD.delivery_note_id
  THEN
    RAISE EXCEPTION 'Fatura e leshuar % nuk mund te ndryshohet (GoBD). Perdorni nje nota kreditit / storno.',
      COALESCE(OLD.invoice_number, OLD.id::text);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_acc_invoices_immutability ON public.acc_invoices;
CREATE TRIGGER trg_acc_invoices_immutability
BEFORE UPDATE OR DELETE ON public.acc_invoices
FOR EACH ROW EXECUTE FUNCTION public.acc_invoices_enforce_immutability();

-- 2. acc_invoice_items guard (items of a finalized invoice are frozen) --------
CREATE OR REPLACE FUNCTION public.acc_invoice_items_enforce_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_invoice_id uuid;
  v_status     text;
BEGIN
  v_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  SELECT status INTO v_status FROM acc_invoices WHERE id = v_invoice_id;

  IF v_status IS NOT NULL AND v_status NOT IN ('draft', 'cancelled') THEN
    RAISE EXCEPTION 'Artikujt e nje fature te leshuar nuk mund te ndryshohen (GoBD).';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_acc_invoice_items_immutability ON public.acc_invoice_items;
CREATE TRIGGER trg_acc_invoice_items_immutability
BEFORE INSERT OR UPDATE OR DELETE ON public.acc_invoice_items
FOR EACH ROW EXECUTE FUNCTION public.acc_invoice_items_enforce_immutability();
