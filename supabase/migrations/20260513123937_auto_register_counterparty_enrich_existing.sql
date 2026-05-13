/*
  # auto_register_counterparty: enrich existing contact with missing fields

  When an existing contact is matched, fill in any missing fields (vat_number,
  email, phone, address) from the delivery note + ai_extracted_json. This
  prevents creating duplicate contacts when a later document carries
  additional data the first one lacked.
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
  v_norm_phone text;
  v_ai jsonb;
  v_pick_from_consignor boolean;
  v_name text;
  v_vat text;
  v_email text;
  v_phone text;
  v_address text;
  v_existing RECORD;
BEGIN
  SELECT id, company_id, counterparty_name, counterparty_vat, counterparty_email,
         counterparty_phone, counterparty_contact_id, partner_id, our_role, type,
         flow_role, pickup_address, delivery_address, ai_extracted_json
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

  v_ai := COALESCE(v_note.ai_extracted_json, '{}'::jsonb);
  v_pick_from_consignor :=
    (v_note.type = 'pickup')
    OR (v_note.flow_role = 'receiver')
    OR (v_note.our_role = 'consignee');

  v_name := COALESCE(NULLIF(TRIM(v_note.counterparty_name), ''),
    CASE WHEN v_pick_from_consignor THEN v_ai->>'consignor_name' ELSE v_ai->>'consignee_name' END);
  v_vat := COALESCE(NULLIF(TRIM(v_note.counterparty_vat), ''),
    CASE WHEN v_pick_from_consignor THEN v_ai->>'consignor_vat' ELSE v_ai->>'consignee_vat' END);
  v_email := COALESCE(NULLIF(TRIM(v_note.counterparty_email), ''),
    CASE WHEN v_pick_from_consignor THEN v_ai->>'consignor_email' ELSE v_ai->>'consignee_email' END);
  v_phone := COALESCE(NULLIF(TRIM(v_note.counterparty_phone), ''),
    CASE WHEN v_pick_from_consignor THEN v_ai->>'consignor_phone' ELSE v_ai->>'consignee_phone' END);
  v_address := COALESCE(
    CASE WHEN v_pick_from_consignor THEN NULLIF(v_note.pickup_address, '') ELSE NULLIF(v_note.delivery_address, '') END,
    CASE WHEN v_pick_from_consignor THEN v_ai->>'consignor_address' ELSE v_ai->>'consignee_address' END);

  IF COALESCE(TRIM(v_name), '') = '' THEN
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

  IF COALESCE(TRIM(v_vat), '') <> '' THEN
    SELECT id INTO v_contact_id FROM acc_contacts
      WHERE company_id = v_note.company_id AND lower(trim(vat_number)) = lower(trim(v_vat))
      LIMIT 1;
  END IF;

  IF v_contact_id IS NULL AND COALESCE(TRIM(v_email), '') <> '' THEN
    SELECT id INTO v_contact_id FROM acc_contacts
      WHERE company_id = v_note.company_id AND lower(trim(email)) = lower(trim(v_email))
      LIMIT 1;
  END IF;

  IF v_contact_id IS NULL AND COALESCE(TRIM(v_phone), '') <> '' THEN
    v_norm_phone := regexp_replace(v_phone, '[^0-9]', '', 'g');
    IF length(v_norm_phone) >= 6 THEN
      SELECT id INTO v_contact_id FROM acc_contacts
        WHERE company_id = v_note.company_id
          AND regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g') = v_norm_phone
        LIMIT 1;
    END IF;
  END IF;

  IF v_contact_id IS NULL THEN
    SELECT id INTO v_contact_id FROM acc_contacts
      WHERE company_id = v_note.company_id AND lower(trim(name)) = lower(trim(v_name))
      LIMIT 1;
  END IF;

  IF v_contact_id IS NULL THEN
    INSERT INTO acc_contacts (
      company_id, name, contact_type, vat_number, email, phone, address,
      auto_created_at, is_active
    ) VALUES (
      v_note.company_id, v_name, v_contact_type,
      NULLIF(v_vat, ''), NULLIF(v_email, ''), NULLIF(v_phone, ''),
      NULLIF(v_address, ''),
      now(), true
    ) RETURNING id INTO v_contact_id;
  ELSE
    SELECT vat_number, email, phone, address INTO v_existing
      FROM acc_contacts WHERE id = v_contact_id;
    UPDATE acc_contacts SET
      vat_number = COALESCE(NULLIF(TRIM(vat_number), ''), NULLIF(TRIM(v_vat), '')),
      email = COALESCE(NULLIF(TRIM(email), ''), NULLIF(TRIM(v_email), '')),
      phone = COALESCE(NULLIF(TRIM(phone), ''), NULLIF(TRIM(v_phone), '')),
      address = COALESCE(NULLIF(TRIM(address), ''), NULLIF(TRIM(v_address), '')),
      updated_at = now()
    WHERE id = v_contact_id
      AND (
        (NULLIF(TRIM(v_existing.vat_number), '') IS NULL AND NULLIF(TRIM(v_vat), '') IS NOT NULL) OR
        (NULLIF(TRIM(v_existing.email), '') IS NULL AND NULLIF(TRIM(v_email), '') IS NOT NULL) OR
        (NULLIF(TRIM(v_existing.phone), '') IS NULL AND NULLIF(TRIM(v_phone), '') IS NOT NULL) OR
        (NULLIF(TRIM(v_existing.address), '') IS NULL AND NULLIF(TRIM(v_address), '') IS NOT NULL)
      );
  END IF;

  UPDATE delivery_notes
    SET counterparty_contact_id = v_contact_id,
        partner_id = COALESCE(partner_id, v_contact_id),
        counterparty_name = COALESCE(NULLIF(TRIM(counterparty_name), ''), v_name),
        counterparty_vat = COALESCE(NULLIF(TRIM(counterparty_vat), ''), NULLIF(v_vat, '')),
        counterparty_email = COALESCE(NULLIF(TRIM(counterparty_email), ''), NULLIF(v_email, '')),
        counterparty_phone = COALESCE(NULLIF(TRIM(counterparty_phone), ''), NULLIF(v_phone, '')),
        partner_name = COALESCE(NULLIF(TRIM(partner_name), ''), v_name),
        auto_register_partner = false,
        updated_at = now()
    WHERE id = p_note_id;

  RETURN v_contact_id;
END $$;

REVOKE ALL ON FUNCTION public.auto_register_counterparty(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auto_register_counterparty(uuid) TO authenticated;
