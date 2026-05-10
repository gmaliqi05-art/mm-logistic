/*
  # Gate partner auto-registration to confirmation phase

  1. Changes
     - Rewrite `auto_register_partner_from_delivery` to:
       * NEVER create an acc_contact if the partner_name matches the company's own
         name or VAT (prevents registering ourselves as a partner).
       * Only fire during the confirmation status transition (not on initial driver
         scan insert), and only when `auto_register_partner = true` flag is set on
         the row by the review UI.
     - Add `auto_register_partner` boolean column on delivery_notes (default false).

  2. Security
     - SECURITY INVOKER, uses caller company; acc_contacts RLS prevents cross-company
       inserts.
*/

ALTER TABLE delivery_notes
  ADD COLUMN IF NOT EXISTS auto_register_partner boolean DEFAULT false;

CREATE OR REPLACE FUNCTION public.auto_register_partner_from_delivery()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_contact_id uuid;
  v_type text;
  v_own_name text;
  v_own_vat text;
  v_should_register boolean := false;
BEGIN
  IF NEW.company_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.partner_name IS NULL OR length(trim(NEW.partner_name)) = 0 THEN RETURN NEW; END IF;

  SELECT lower(trim(name)), lower(trim(coalesce(vat_number,'')))
    INTO v_own_name, v_own_vat
    FROM companies WHERE id = NEW.company_id;

  IF lower(trim(NEW.partner_name)) = v_own_name THEN RETURN NEW; END IF;
  IF NEW.counterparty_vat IS NOT NULL AND v_own_vat <> '' AND lower(trim(NEW.counterparty_vat)) = v_own_vat THEN
    RETURN NEW;
  END IF;

  IF NEW.partner_id IS NOT NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    v_should_register := coalesce(NEW.auto_register_partner, false)
                         AND NEW.status IN ('confirmed','delivered','pending_stock_confirmation');
  ELSE
    v_should_register :=
      (coalesce(NEW.auto_register_partner, false) AND NEW.status IN ('confirmed','delivered','pending_stock_confirmation')
       AND (OLD.auto_register_partner IS DISTINCT FROM NEW.auto_register_partner OR OLD.status IS DISTINCT FROM NEW.status))
      OR (NEW.partner_name IS DISTINCT FROM OLD.partner_name AND coalesce(NEW.auto_register_partner, false));
  END IF;

  IF NOT v_should_register THEN RETURN NEW; END IF;

  SELECT id INTO v_contact_id
    FROM acc_contacts
   WHERE company_id = NEW.company_id
     AND lower(trim(name)) = lower(trim(NEW.partner_name))
   LIMIT 1;

  IF v_contact_id IS NULL THEN
    v_type := CASE WHEN NEW.type = 'delivery' THEN 'customer'
                   WHEN NEW.type = 'pickup'   THEN 'supplier'
                   ELSE 'both' END;
    INSERT INTO acc_contacts (company_id, name, contact_type, vat_number, email, phone, address, is_active)
    VALUES (
      NEW.company_id,
      trim(NEW.partner_name),
      v_type,
      nullif(trim(coalesce(NEW.counterparty_vat,'')),''),
      nullif(trim(coalesce(NEW.counterparty_email,'')),''),
      nullif(trim(coalesce(NEW.counterparty_phone,'')),''),
      CASE WHEN NEW.type = 'delivery' THEN NEW.delivery_address ELSE NEW.pickup_address END,
      true
    )
    RETURNING id INTO v_contact_id;
  END IF;

  NEW.partner_id := v_contact_id;
  IF NEW.counterparty_contact_id IS NULL THEN
    NEW.counterparty_contact_id := v_contact_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_auto_register_partner_from_delivery ON delivery_notes;
CREATE TRIGGER trg_auto_register_partner_from_delivery
BEFORE INSERT OR UPDATE OF partner_name, partner_id, status, auto_register_partner, counterparty_vat ON delivery_notes
FOR EACH ROW EXECUTE FUNCTION public.auto_register_partner_from_delivery();
