/*
  # Partner Registration by Our Role (CMR Convention)

  ## Rule
  We register ONLY the party that has direct business relationship with us
  (pays us, we pay them, exchange pallets with them).

  - our_role='consignor': register CONSIGNEE as customer
  - our_role='consignee': register CONSIGNOR as supplier
  - our_role='carrier':   register CONSIGNOR as carrier_client (consignee NOT registered)
  - our_role='custodian_in/out': register goods_owner as custody_client
  - our_role='internal_transfer': register NONE

  This replaces the old auto_register_partner_from_delivery trigger.
*/

CREATE OR REPLACE FUNCTION public.auto_register_partner_from_delivery()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_contact_id uuid;
  v_partner_name text;
  v_partner_vat text;
  v_partner_address text;
  v_partner_city text;
  v_partner_country text;
  v_contact_type text;
  v_target_column text;  -- which field to set on delivery_notes
BEGIN
  IF NEW.company_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.our_role IS NULL THEN RETURN NEW; END IF;

  -- Decide which party to register based on our role
  IF NEW.our_role = 'consignor' THEN
    -- We send: consignee is our customer
    v_partner_name := NEW.consignee_name;
    v_partner_vat := NEW.consignee_vat;
    v_partner_address := NEW.consignee_address;
    v_partner_city := NEW.consignee_city;
    v_partner_country := NEW.consignee_country;
    v_contact_type := 'customer';
    v_target_column := 'consignee';

  ELSIF NEW.our_role = 'consignee' THEN
    -- We receive: consignor is our supplier
    v_partner_name := NEW.consignor_name;
    v_partner_vat := NEW.consignor_vat;
    v_partner_address := NEW.consignor_address;
    v_partner_city := NEW.consignor_city;
    v_partner_country := NEW.consignor_country;
    v_contact_type := 'supplier';
    v_target_column := 'consignor';

  ELSIF NEW.our_role = 'carrier' THEN
    -- We only transport: consignor is our paying client (they pay us for transport)
    -- DO NOT register consignee (that's the client of our client!)
    v_partner_name := NEW.consignor_name;
    v_partner_vat := NEW.consignor_vat;
    v_partner_address := NEW.consignor_address;
    v_partner_city := NEW.consignor_city;
    v_partner_country := NEW.consignor_country;
    v_contact_type := 'carrier_client';
    v_target_column := 'consignor';

  ELSIF NEW.our_role IN ('custodian_in', 'custodian_out') THEN
    -- We hold goods for owner: owner is our paying client
    IF NEW.our_role = 'custodian_in' THEN
      v_partner_name := COALESCE(NEW.consignor_name, '');
      v_partner_vat := COALESCE(NEW.consignor_vat, '');
      v_partner_address := COALESCE(NEW.consignor_address, '');
      v_partner_city := COALESCE(NEW.consignor_city, '');
      v_partner_country := COALESCE(NEW.consignor_country, '');
      v_target_column := 'consignor';
    ELSE
      v_partner_name := COALESCE(NEW.consignee_name, '');
      v_partner_vat := COALESCE(NEW.consignee_vat, '');
      v_partner_address := COALESCE(NEW.consignee_address, '');
      v_partner_city := COALESCE(NEW.consignee_city, '');
      v_partner_country := COALESCE(NEW.consignee_country, '');
      v_target_column := 'consignee';
    END IF;
    v_contact_type := 'custody_client';

  ELSE
    -- internal_transfer or unknown: register nothing
    RETURN NEW;
  END IF;

  -- No partner name = nothing to do
  IF v_partner_name IS NULL OR length(trim(v_partner_name)) = 0 THEN
    RETURN NEW;
  END IF;

  -- Don't register ourselves
  IF public.is_own_company_name(NEW.company_id, v_partner_name, v_partner_vat) THEN
    RETURN NEW;
  END IF;

  -- Find existing or create
  SELECT id INTO v_contact_id
  FROM acc_contacts
  WHERE company_id = NEW.company_id
    AND (
      (v_partner_vat IS NOT NULL AND length(trim(v_partner_vat)) > 3
       AND lower(trim(vat_number)) = lower(trim(v_partner_vat)))
      OR lower(trim(name)) = lower(trim(v_partner_name))
    )
  LIMIT 1;

  IF v_contact_id IS NULL THEN
    INSERT INTO acc_contacts (
      company_id, name, contact_type, vat_number,
      address, city, country, is_active
    )
    VALUES (
      NEW.company_id, trim(v_partner_name), v_contact_type,
      NULLIF(trim(v_partner_vat), ''),
      NULLIF(trim(v_partner_address), ''),
      NULLIF(trim(v_partner_city), ''),
      NULLIF(trim(v_partner_country), ''),
      true
    )
    RETURNING id INTO v_contact_id;
  END IF;

  -- Set the appropriate contact_id field
  IF v_target_column = 'consignor' THEN
    NEW.consignor_contact_id := v_contact_id;
  ELSIF v_target_column = 'consignee' THEN
    NEW.consignee_contact_id := v_contact_id;
  END IF;

  -- Legacy compatibility: also set partner_id for old reports
  NEW.partner_id := v_contact_id;

  -- For custodian/carrier: also set goods_owner if missing
  IF NEW.our_role IN ('carrier', 'custodian_in', 'custodian_out')
     AND NEW.goods_owner_contact_id IS NULL THEN
    NEW.goods_owner_contact_id := v_contact_id;
  END IF;

  RETURN NEW;
END $$;

-- Trigger remains the same; CREATE OR REPLACE FUNCTION updates body in place

-- Update acc_contacts contact_type constraint to allow new types
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.check_constraints
             WHERE constraint_name = 'acc_contacts_contact_type_check') THEN
    ALTER TABLE acc_contacts DROP CONSTRAINT acc_contacts_contact_type_check;
  END IF;
  ALTER TABLE acc_contacts ADD CONSTRAINT acc_contacts_contact_type_check
    CHECK (contact_type IN ('customer', 'supplier', 'both', 'carrier_client', 'custody_client'));
END $$;
