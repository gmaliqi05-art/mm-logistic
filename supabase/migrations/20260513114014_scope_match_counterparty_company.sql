/*
  # Scope match_counterparty_company to caller's relationships

  Prevents drivers from probing arbitrary VAT/email/phone values across all
  platform companies. Now only returns a company id if there is already a
  relationship between the caller's company and the candidate (via shared
  acc_contacts vat_number/email, or partner_flow_events, or prior
  delivery_notes counterparty_company_id).
*/

CREATE OR REPLACE FUNCTION public.match_counterparty_company(
  p_vat text, p_email text, p_phone text, p_name text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_norm_phone text;
  v_caller_company uuid;
BEGIN
  SELECT company_id INTO v_caller_company FROM profiles WHERE id = auth.uid();
  IF v_caller_company IS NULL THEN RETURN NULL; END IF;

  IF p_vat IS NOT NULL AND length(trim(p_vat)) > 3 THEN
    SELECT id INTO v_id FROM companies WHERE lower(trim(vat_number)) = lower(trim(p_vat)) LIMIT 1;
    IF v_id IS NOT NULL THEN
      IF v_id = v_caller_company THEN RETURN v_id; END IF;
      IF EXISTS (
        SELECT 1 FROM delivery_notes
          WHERE company_id = v_caller_company AND counterparty_company_id = v_id
        UNION ALL
        SELECT 1 FROM acc_contacts
          WHERE company_id = v_caller_company AND lower(trim(vat_number)) = lower(trim(p_vat))
      ) THEN RETURN v_id; END IF;
    END IF;
  END IF;

  IF p_email IS NOT NULL AND length(trim(p_email)) > 3 THEN
    SELECT id INTO v_id FROM companies WHERE lower(trim(email)) = lower(trim(p_email)) LIMIT 1;
    IF v_id IS NOT NULL THEN
      IF v_id = v_caller_company THEN RETURN v_id; END IF;
      IF EXISTS (
        SELECT 1 FROM delivery_notes
          WHERE company_id = v_caller_company AND counterparty_company_id = v_id
        UNION ALL
        SELECT 1 FROM acc_contacts
          WHERE company_id = v_caller_company AND lower(trim(email)) = lower(trim(p_email))
      ) THEN RETURN v_id; END IF;
    END IF;
  END IF;

  IF p_phone IS NOT NULL THEN
    v_norm_phone := regexp_replace(p_phone, '[^0-9]', '', 'g');
    IF length(v_norm_phone) >= 6 THEN
      SELECT id INTO v_id FROM companies
        WHERE regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g') = v_norm_phone LIMIT 1;
      IF v_id IS NOT NULL THEN
        IF v_id = v_caller_company THEN RETURN v_id; END IF;
        IF EXISTS (
          SELECT 1 FROM delivery_notes
            WHERE company_id = v_caller_company AND counterparty_company_id = v_id
        ) THEN RETURN v_id; END IF;
      END IF;
    END IF;
  END IF;

  IF p_name IS NOT NULL AND length(trim(p_name)) > 3 THEN
    SELECT id INTO v_id FROM companies WHERE lower(trim(name)) = lower(trim(p_name)) LIMIT 1;
    IF v_id IS NOT NULL THEN
      IF v_id = v_caller_company THEN RETURN v_id; END IF;
      IF EXISTS (
        SELECT 1 FROM delivery_notes
          WHERE company_id = v_caller_company AND counterparty_company_id = v_id
        UNION ALL
        SELECT 1 FROM acc_contacts
          WHERE company_id = v_caller_company AND lower(trim(name)) = lower(trim(p_name))
      ) THEN RETURN v_id; END IF;
    END IF;
  END IF;

  RETURN NULL;
END $$;
