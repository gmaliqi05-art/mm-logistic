/*
  # Backfill partner contacts for existing delivery_notes and strengthen auto-register

  1. Problem
     - Delivery notes that were confirmed before the auto-register flag was enabled
       carry a free-text `partner_name` but no `partner_id` / `counterparty_contact_id`.
     - Reports "Partneret" and "Rrjedhat me partneret" rely on `acc_contacts` and
       `partner_flow_events.partner_contact_id`; partners with only a name string were
       therefore invisible in those views.

  2. Fix - Backfill
     - For every `delivery_notes` row with a non-empty `partner_name` and no partner
       link, find or create an `acc_contacts` row in the same company, matched case-
       insensitively by name. Skip when the name / VAT matches the company itself.
     - Populate `delivery_notes.partner_id` and `counterparty_contact_id` with the
       resolved contact id.
     - Backfill `partner_flow_events.partner_contact_id` from the delivery note link.

  3. Fix - Trigger hardening
     - Rewrite `auto_register_partner_from_delivery` so that ANY delivery note reaching
       a final status (`confirmed`, `delivered`, `pending_stock_confirmation`) with a
       `partner_name` and no existing partner link automatically registers a contact,
       even if `auto_register_partner` is false. This prevents future rows from leaking
       into the reports with null partner references.

  4. Data safety
     - Only creates rows where they do not exist. Name/VAT self-match check preserved.
     - Backfilling partner_flow_events is an UPDATE on rows that already exist.
*/

-- Step 1: Backfill acc_contacts and link delivery_notes
DO $$
DECLARE
  dn RECORD;
  v_contact_id uuid;
  v_type text;
  v_own_name text;
  v_own_vat text;
  v_clean_name text;
BEGIN
  FOR dn IN
    SELECT d.id, d.company_id, d.partner_name, d.counterparty_vat, d.counterparty_email,
           d.counterparty_phone, d.type, d.delivery_address, d.pickup_address
    FROM delivery_notes d
    WHERE d.partner_name IS NOT NULL
      AND length(trim(d.partner_name)) > 0
      AND d.partner_id IS NULL
      AND d.counterparty_contact_id IS NULL
  LOOP
    v_clean_name := trim(dn.partner_name);
    IF v_clean_name IS NULL OR length(v_clean_name) = 0 THEN CONTINUE; END IF;

    SELECT lower(trim(name)), lower(trim(coalesce(vat_number,'')))
      INTO v_own_name, v_own_vat
      FROM companies WHERE id = dn.company_id;

    IF lower(v_clean_name) = v_own_name THEN CONTINUE; END IF;
    IF dn.counterparty_vat IS NOT NULL AND v_own_vat <> '' AND lower(trim(dn.counterparty_vat)) = v_own_vat THEN
      CONTINUE;
    END IF;

    SELECT id INTO v_contact_id
      FROM acc_contacts
     WHERE company_id = dn.company_id
       AND lower(trim(name)) = lower(v_clean_name)
     LIMIT 1;

    IF v_contact_id IS NULL THEN
      v_type := CASE WHEN dn.type = 'delivery' THEN 'customer'
                     WHEN dn.type = 'pickup'   THEN 'supplier'
                     ELSE 'both' END;
      INSERT INTO acc_contacts (company_id, name, contact_type, vat_number, email, phone, address, is_active)
      VALUES (
        dn.company_id,
        v_clean_name,
        v_type,
        nullif(trim(coalesce(dn.counterparty_vat,'')),''),
        nullif(trim(coalesce(dn.counterparty_email,'')),''),
        nullif(trim(coalesce(dn.counterparty_phone,'')),''),
        CASE WHEN dn.type = 'delivery' THEN dn.delivery_address ELSE dn.pickup_address END,
        true
      )
      RETURNING id INTO v_contact_id;
    END IF;

    UPDATE delivery_notes
       SET partner_id = v_contact_id,
           counterparty_contact_id = COALESCE(counterparty_contact_id, v_contact_id)
     WHERE id = dn.id;
  END LOOP;
END $$;

-- Step 2: Backfill partner_flow_events.partner_contact_id from the linked delivery_note
UPDATE partner_flow_events pfe
SET partner_contact_id = dn.partner_id
FROM delivery_notes dn
WHERE pfe.delivery_note_id = dn.id
  AND pfe.partner_contact_id IS NULL
  AND pfe.partner_company_id IS NULL
  AND dn.partner_id IS NOT NULL;

-- Step 3: Rewrite auto_register_partner_from_delivery to always register at final status
CREATE OR REPLACE FUNCTION public.auto_register_partner_from_delivery()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_contact_id uuid;
  v_type text;
  v_own_name text;
  v_own_vat text;
  v_at_final_status boolean;
  v_status_changed boolean;
BEGIN
  IF NEW.company_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.partner_name IS NULL OR length(trim(NEW.partner_name)) = 0 THEN RETURN NEW; END IF;
  IF NEW.partner_id IS NOT NULL THEN RETURN NEW; END IF;

  SELECT lower(trim(name)), lower(trim(coalesce(vat_number,'')))
    INTO v_own_name, v_own_vat
    FROM companies WHERE id = NEW.company_id;

  IF lower(trim(NEW.partner_name)) = v_own_name THEN RETURN NEW; END IF;
  IF NEW.counterparty_vat IS NOT NULL AND v_own_vat <> '' AND lower(trim(NEW.counterparty_vat)) = v_own_vat THEN
    RETURN NEW;
  END IF;

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

  -- Register when: explicit flag set OR we are transitioning to a final status with a partner name
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

DROP TRIGGER IF EXISTS trg_auto_register_partner_from_delivery ON delivery_notes;
CREATE TRIGGER trg_auto_register_partner_from_delivery
BEFORE INSERT OR UPDATE OF partner_name, partner_id, status, auto_register_partner, counterparty_vat ON delivery_notes
FOR EACH ROW EXECUTE FUNCTION public.auto_register_partner_from_delivery();
