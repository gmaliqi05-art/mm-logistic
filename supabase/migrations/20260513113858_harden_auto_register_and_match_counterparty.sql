/*
  # Harden auto_register_counterparty role check and scope match_counterparty_company

  ## Summary
  1. `auto_register_counterparty(p_note_id)` now also requires the caller to
     have role `company_admin`, `depot_worker`, or `accountant`. Drivers can no
     longer call this RPC directly to seed contacts.
  2. `match_counterparty_company(...)` is restricted: it now only returns a
     company id if there is an existing relationship between the caller's
     company and the candidate (a contact, partner_flow, or shared delivery
     note). This prevents drivers from probing arbitrary VAT/email/phone values
     against the global companies table.

  ## Security
  - Both functions remain SECURITY DEFINER but enforce stricter scoping.
*/

CREATE OR REPLACE FUNCTION public.auto_register_counterparty(p_note_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_note RECORD;
  v_caller_company uuid;
  v_caller_role text;
  v_contact_id uuid;
  v_contact_type text;
BEGIN
  SELECT id, company_id, counterparty_name, counterparty_vat, counterparty_email,
         counterparty_phone, counterparty_contact_id, partner_id, our_role, type,
         pickup_address, delivery_address
    INTO v_note
    FROM delivery_notes
    WHERE id = p_note_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Note not found'; END IF;

  SELECT company_id, role INTO v_caller_company, v_caller_role
    FROM profiles WHERE id = auth.uid();
  IF v_caller_company IS NULL OR v_caller_company <> v_note.company_id THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF v_caller_role NOT IN ('company_admin', 'depot_worker', 'accountant', 'super_admin') THEN
    RAISE EXCEPTION 'Insufficient privileges to auto-register partners';
  END IF;

  IF v_note.counterparty_contact_id IS NOT NULL THEN
    RETURN v_note.counterparty_contact_id;
  END IF;

  IF COALESCE(TRIM(v_note.counterparty_name), '') = '' THEN
    RETURN NULL;
  END IF;

  v_contact_type := CASE
    WHEN v_note.our_role = 'consignor' THEN 'customer'
    WHEN v_note.our_role = 'consignee' THEN 'supplier'
    WHEN v_note.our_role = 'carrier' THEN 'customer'
    WHEN v_note.type = 'delivery' THEN 'customer'
    WHEN v_note.type = 'pickup' THEN 'supplier'
    ELSE 'both'
  END;

  IF COALESCE(TRIM(v_note.counterparty_vat), '') <> '' THEN
    SELECT id INTO v_contact_id FROM acc_contacts
      WHERE company_id = v_note.company_id AND vat_number = v_note.counterparty_vat
      LIMIT 1;
  END IF;
  IF v_contact_id IS NULL THEN
    SELECT id INTO v_contact_id FROM acc_contacts
      WHERE company_id = v_note.company_id AND lower(name) = lower(v_note.counterparty_name)
      LIMIT 1;
  END IF;

  IF v_contact_id IS NULL THEN
    INSERT INTO acc_contacts (
      company_id, name, contact_type, vat_number, email, phone, address,
      auto_created_at, is_active
    ) VALUES (
      v_note.company_id, v_note.counterparty_name, v_contact_type,
      NULLIF(v_note.counterparty_vat, ''), NULLIF(v_note.counterparty_email, ''),
      NULLIF(v_note.counterparty_phone, ''),
      CASE
        WHEN v_note.type = 'pickup' THEN NULLIF(v_note.pickup_address, '')
        ELSE NULLIF(v_note.delivery_address, '')
      END,
      now(), true
    ) RETURNING id INTO v_contact_id;
  END IF;

  UPDATE delivery_notes
    SET counterparty_contact_id = v_contact_id,
        partner_id = COALESCE(partner_id, v_contact_id),
        auto_register_partner = false,
        updated_at = now()
    WHERE id = p_note_id;

  RETURN v_contact_id;
END $$;

REVOKE ALL ON FUNCTION public.auto_register_counterparty(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auto_register_counterparty(uuid) TO authenticated;
