/*
  # Auto-register counterparty RPC

  ## Summary
  Adds `auto_register_counterparty(p_note_id)` which creates an `acc_contacts`
  record from the snapshot stored on a delivery note (counterparty_name, vat,
  email, phone, address) and links it back via counterparty_contact_id +
  partner_id. Idempotent: if a contact with the same VAT already exists for the
  company, it reuses that one. If the note already has a contact link, returns
  early.

  ## Tables touched
  - `acc_contacts`: insert
  - `delivery_notes`: update counterparty_contact_id, partner_id, auto_register_partner

  ## Security
  - SECURITY DEFINER, locked to the caller's company by checking auth.uid()
    against the note's company.
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

  SELECT company_id INTO v_caller_company FROM profiles WHERE id = auth.uid();
  IF v_caller_company IS NULL OR v_caller_company <> v_note.company_id THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  IF v_note.counterparty_contact_id IS NOT NULL THEN
    RETURN v_note.counterparty_contact_id;
  END IF;

  IF COALESCE(TRIM(v_note.counterparty_name), '') = '' THEN
    RETURN NULL;
  END IF;

  -- Decide contact type from our_role: if we send (consignor), partner is customer; if we receive, partner is supplier.
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
