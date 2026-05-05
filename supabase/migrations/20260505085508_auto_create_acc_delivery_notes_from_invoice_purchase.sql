/*
  # Auto-krijim i acc_delivery_notes nga Fatura/Blerja

  ## Permbledhje
  Triggerat e ri:
    - `acc_invoice_auto_delivery_note`: kur nje fature kalon ne status
      `sent`/`paid` (dhe eshte `invoice`), krijohet automatikisht nje
      acc_delivery_note me `kind='sale'`, `direction='outgoing'`, duke
      kopjuar artikujt nga `acc_invoice_items`. Shmang dyfishimin duke
      kontrolluar invoice_id+kind.
    - `acc_purchase_auto_delivery_note`: kur nje blerje kalon nga `draft`
      ne `received`/`paid`, krijon acc_delivery_note me
      `kind='purchase_receipt'`, `direction='incoming'`.

  ## Veshtrime
  - Nuk ndikon ne triggerat fizike te stokut (proces separat nga
    logjika e magazines; ruan ekran per aksion te metejshem).
  - Note-numrat: `DN-<INV>` ose `DN-<PUR>`.
  - Security definer me search_path=public.
*/

CREATE OR REPLACE FUNCTION public.acc_invoice_auto_delivery_note()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_dn_id uuid;
  v_exists boolean;
BEGIN
  IF NEW.invoice_type <> 'invoice' THEN
    RETURN NEW;
  END IF;

  IF NOT (COALESCE(OLD.status,'') IN ('draft') AND NEW.status IN ('sent','paid')) THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM acc_delivery_notes
    WHERE invoice_id = NEW.id AND kind = 'sale'
  ) INTO v_exists;

  IF v_exists THEN
    RETURN NEW;
  END IF;

  INSERT INTO acc_delivery_notes (
    company_id, created_by, contact_id, note_number, note_date, status,
    shipping_address, notes, invoice_id, kind, direction
  )
  SELECT
    NEW.company_id, NEW.created_by, NEW.contact_id,
    'DN-' || NEW.invoice_number, NEW.invoice_date, 'draft',
    COALESCE(c.address, ''), 'Auto nga fature ' || NEW.invoice_number,
    NEW.id, 'sale', 'outgoing'
  FROM (SELECT 1) x
  LEFT JOIN acc_contacts c ON c.id = NEW.contact_id
  RETURNING id INTO new_dn_id;

  INSERT INTO acc_delivery_note_items (delivery_note_id, product_id, description, quantity, unit)
  SELECT new_dn_id, ii.product_id, ii.description, ii.quantity, ii.unit
  FROM acc_invoice_items ii
  WHERE ii.invoice_id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_acc_invoice_auto_delivery_note ON acc_invoices;
CREATE TRIGGER trg_acc_invoice_auto_delivery_note
  AFTER UPDATE OF status ON acc_invoices
  FOR EACH ROW EXECUTE FUNCTION public.acc_invoice_auto_delivery_note();


CREATE OR REPLACE FUNCTION public.acc_purchase_auto_delivery_note()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_dn_id uuid;
  v_exists boolean;
BEGIN
  IF NOT (COALESCE(OLD.status,'') = 'draft' AND NEW.status IN ('received','paid')) THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM acc_delivery_notes
    WHERE invoice_id IS NULL
      AND kind = 'purchase_receipt'
      AND notes LIKE '%' || NEW.purchase_number || '%'
      AND company_id = NEW.company_id
  ) INTO v_exists;

  IF v_exists THEN
    RETURN NEW;
  END IF;

  INSERT INTO acc_delivery_notes (
    company_id, created_by, contact_id, note_number, note_date, status,
    shipping_address, notes, invoice_id, kind, direction
  )
  SELECT
    NEW.company_id, NEW.created_by, NEW.contact_id,
    'DN-' || NEW.purchase_number, NEW.purchase_date, 'draft',
    COALESCE(c.address, ''), 'Auto nga blerje ' || NEW.purchase_number,
    NULL, 'purchase_receipt', 'incoming'
  FROM (SELECT 1) x
  LEFT JOIN acc_contacts c ON c.id = NEW.contact_id
  RETURNING id INTO new_dn_id;

  INSERT INTO acc_delivery_note_items (delivery_note_id, product_id, description, quantity, unit)
  SELECT new_dn_id, pi.product_id, pi.description, pi.quantity, pi.unit
  FROM acc_purchase_items pi
  WHERE pi.purchase_id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_acc_purchase_auto_delivery_note ON acc_purchases;
CREATE TRIGGER trg_acc_purchase_auto_delivery_note
  AFTER UPDATE OF status ON acc_purchases
  FOR EACH ROW EXECUTE FUNCTION public.acc_purchase_auto_delivery_note();
