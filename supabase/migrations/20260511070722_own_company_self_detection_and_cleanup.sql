/*
  # Own-company self-detection for partner registration

  1. Problem
     - When the delivery partner name is a variant of our own company name
       (e.g. "SalPal", "SAL PAL", "Sal Pal / Enlirat Salihaj", "SALPAL"), the
       existing lowercase-trim comparison misses the match and we end up creating
       an acc_contact for ourselves and registering it as a partner.
     - A wrongly-registered contact "SAL PAL / Enlirat Salihaj" already exists and
       is linked to delivery_note e1b631f5 and its partner_flow_events.

  2. Fix - Helper function
     - Add `normalize_company_label(text)` that removes whitespace, punctuation,
       diacritics, and strips anything after a `/` slash so variants collapse to a
       single canonical token (e.g. "Sal Pal / Enlirat Salihaj" -> "salpal").
     - Add `is_own_company_name(company_id, candidate_name, candidate_vat)` that
       returns true when the candidate matches the company's own name or VAT after
       normalization (name prefix match included).

  3. Fix - Retroactive cleanup
     - For any acc_contacts row whose normalized name matches its company's own
       normalized name, unlink all delivery_notes (partner_id, counterparty_contact_id)
       and null out partner_contact_id in partner_flow_events.
     - Delete the acc_contacts row if it has no dependent invoices or transactions;
       otherwise soft-deactivate it and prefix the notes.

  4. Fix - Trigger hardening
     - Rewrite `auto_register_partner_from_delivery` to call `is_own_company_name`
       and short-circuit on match.
     - Add a BEFORE INSERT/UPDATE trigger on `acc_contacts` that rejects creating
       a contact whose name/VAT matches its company's own identity.

  5. Security
     - Functions marked IMMUTABLE where pure; SECURITY INVOKER for the rejector
       trigger so RLS applies.
*/

-- Step 1: Normalizer
CREATE OR REPLACE FUNCTION public.normalize_company_label(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(
    lower(
      COALESCE(
        NULLIF(
          split_part(COALESCE(p_text, ''), '/', 1),
          ''
        ),
        COALESCE(p_text, '')
      )
    ),
    '[^a-z0-9]+',
    '',
    'g'
  )
$$;

-- Step 2: Self-detection helper
CREATE OR REPLACE FUNCTION public.is_own_company_name(
  p_company_id uuid,
  p_candidate_name text,
  p_candidate_vat text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_own_name text;
  v_own_vat text;
  v_cand_name text;
  v_cand_vat text;
BEGIN
  IF p_company_id IS NULL THEN RETURN false; END IF;
  SELECT public.normalize_company_label(name),
         regexp_replace(lower(coalesce(vat_number,'')), '[^a-z0-9]+', '', 'g')
    INTO v_own_name, v_own_vat
    FROM companies WHERE id = p_company_id;

  v_cand_name := public.normalize_company_label(p_candidate_name);
  v_cand_vat := regexp_replace(lower(coalesce(p_candidate_vat,'')), '[^a-z0-9]+', '', 'g');

  IF v_own_name IS NOT NULL AND v_own_name <> '' AND v_cand_name <> '' THEN
    IF v_cand_name = v_own_name THEN RETURN true; END IF;
    -- prefix or contains match on the tokenized form
    IF position(v_own_name in v_cand_name) = 1 THEN RETURN true; END IF;
    IF position(v_cand_name in v_own_name) = 1 AND length(v_cand_name) >= 4 THEN RETURN true; END IF;
  END IF;

  IF v_own_vat IS NOT NULL AND v_own_vat <> '' AND v_cand_vat <> '' AND v_cand_vat = v_own_vat THEN
    RETURN true;
  END IF;

  RETURN false;
END $$;

-- Step 3: Retroactive cleanup
DO $$
DECLARE
  c RECORD;
  has_deps boolean;
BEGIN
  FOR c IN
    SELECT ac.id, ac.company_id, ac.name
    FROM acc_contacts ac
    WHERE public.is_own_company_name(ac.company_id, ac.name, ac.vat_number)
  LOOP
    -- Unlink from delivery_notes
    UPDATE delivery_notes
       SET partner_id = NULL,
           counterparty_contact_id = CASE WHEN counterparty_contact_id = c.id THEN NULL ELSE counterparty_contact_id END,
           auto_register_partner = false
     WHERE partner_id = c.id OR counterparty_contact_id = c.id;

    -- Null out partner_flow_events.partner_contact_id
    UPDATE partner_flow_events
       SET partner_contact_id = NULL
     WHERE partner_contact_id = c.id;

    -- Check dependencies
    SELECT (
      EXISTS(SELECT 1 FROM acc_invoices WHERE contact_id = c.id)
      OR EXISTS(SELECT 1 FROM acc_transactions WHERE contact_id = c.id)
    ) INTO has_deps;

    IF has_deps THEN
      UPDATE acc_contacts
         SET is_active = false,
             notes = COALESCE(NULLIF(notes,'') || E'\n', '') || '[AUTO] Kjo hyrje perputhet me kompanine vete; u caktivizua.'
       WHERE id = c.id;
    ELSE
      DELETE FROM acc_contacts WHERE id = c.id;
    END IF;
  END LOOP;
END $$;

-- Step 4: Rewrite auto-register trigger function
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
  IF NEW.partner_name IS NULL OR length(trim(NEW.partner_name)) = 0 THEN RETURN NEW; END IF;
  IF NEW.partner_id IS NOT NULL THEN RETURN NEW; END IF;

  -- Self-detection: bail out if the partner is our own company under any variant
  IF public.is_own_company_name(NEW.company_id, NEW.partner_name, NEW.counterparty_vat) THEN
    NEW.auto_register_partner := false;
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

-- Step 5: Guard against direct inserts into acc_contacts that would duplicate the own company
CREATE OR REPLACE FUNCTION public.reject_own_company_as_contact()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  IF NEW.company_id IS NULL THEN RETURN NEW; END IF;
  IF public.is_own_company_name(NEW.company_id, NEW.name, NEW.vat_number) THEN
    RAISE EXCEPTION 'Nuk mund te regjistroni kompanine tuaj (%) si kontakt', NEW.name
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_reject_own_company_as_contact ON acc_contacts;
CREATE TRIGGER trg_reject_own_company_as_contact
BEFORE INSERT OR UPDATE OF name, vat_number, company_id ON acc_contacts
FOR EACH ROW EXECUTE FUNCTION public.reject_own_company_as_contact();
