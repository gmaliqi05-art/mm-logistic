/*
  # Internal-transfer flow role for own-company delivery notes

  1. Goal
     - When a delivery_note's partner matches our own company (under any name
       variant), we should still post stock normally but skip partner creation
       and label the note as `internal_transfer` so partner-flow reports ignore it.

  2. Changes
     - Update `auto_register_partner_from_delivery` so that when it detects the
       own-company case it also sets `partner_id`, `counterparty_contact_id`,
       `counterparty_company_id` to NULL and sets `flow_role='internal_transfer'`
       when no explicit role is set yet.
*/

CREATE OR REPLACE FUNCTION public.auto_register_partner_from_delivery()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_contact_id uuid;
  v_type text;
  v_at_final_status boolean;
  v_status_changed boolean;
BEGIN
  IF NEW.company_id IS NULL THEN RETURN NEW; END IF;

  -- Self-detection: if the partner is our own company, strip partner links and
  -- flag as internal transfer. Stock posting is unaffected and partner_flow
  -- reports will skip rows with null partner.
  IF NEW.partner_name IS NOT NULL
     AND public.is_own_company_name(NEW.company_id, NEW.partner_name, NEW.counterparty_vat) THEN
    NEW.auto_register_partner := false;
    NEW.partner_id := NULL;
    NEW.counterparty_contact_id := NULL;
    NEW.counterparty_company_id := NULL;
    IF NEW.flow_role IS NULL THEN
      NEW.flow_role := 'internal_transfer';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.partner_name IS NULL OR length(trim(NEW.partner_name)) = 0 THEN RETURN NEW; END IF;
  IF NEW.partner_id IS NOT NULL THEN RETURN NEW; END IF;

  v_at_final_status := NEW.status IN ('confirmed','delivered','pending_stock_confirmation');

  IF TG_OP = 'INSERT' THEN
    v_status_changed := v_at_final_status;
  ELSE
    v_status_changed := v_at_final_status AND (
      OLD.status IS DISTINCT FROM NEW.status
      OR OLD.partner_name IS DISTINCT FROM NEW.partner_name
      OR OLD.auto_register_partner IS DISTINCT FROM NEW.auto_register_partner
    );
  END IF;

  IF NOT (COALESCE(NEW.auto_register_partner, false) OR (v_at_final_status AND v_status_changed)) THEN
    RETURN NEW;
  END IF;

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
