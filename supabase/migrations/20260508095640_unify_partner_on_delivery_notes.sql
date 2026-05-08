/*
  # Unify partner reference on delivery_notes

  1. Changes
    - Backfill `delivery_notes.partner_id` from the legacy
      `pallet_partner_contact_id` column where `partner_id` is null.
    - Drop the duplicate `pallet_partner_contact_id` column.
    - Rewrite `auto_pallet_ledger_on_delivery()` and
      `derive_pallet_quantities_from_items()` to read `partner_id`.

  2. Triggers
    - Recreates `trg_derive_pallet_quantities` (BEFORE UPDATE OF status)
      and `trg_auto_pallet_ledger_on_delivery` (AFTER UPDATE OF status).

  3. Notes
    - `partner_id` is now the single source of truth for the partner
      linked to a delivery note. The pallet ledger and pallet quantity
      derivation both key off of `partner_id`.
*/

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'delivery_notes' AND column_name = 'pallet_partner_contact_id'
  ) THEN
    UPDATE delivery_notes
       SET partner_id = pallet_partner_contact_id
     WHERE partner_id IS NULL
       AND pallet_partner_contact_id IS NOT NULL;

    DROP TRIGGER IF EXISTS trg_auto_pallet_ledger_on_delivery ON delivery_notes;
    DROP TRIGGER IF EXISTS trg_derive_pallet_quantities ON delivery_notes;

    ALTER TABLE delivery_notes DROP COLUMN pallet_partner_contact_id;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.auto_pallet_ledger_on_delivery()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id uuid;
  v_partner uuid;
  v_type text;
BEGIN
  IF (NEW.status NOT IN ('delivered','confirmed')) OR NEW.pallet_ledger_applied THEN
    RETURN NEW;
  END IF;

  v_partner := NEW.partner_id;
  v_type := COALESCE(NEW.pallet_type, 'EPAL');

  IF v_partner IS NULL OR (COALESCE(NEW.pallets_delivered,0) = 0 AND COALESCE(NEW.pallets_returned,0) = 0) THEN
    RETURN NEW;
  END IF;

  INSERT INTO pallet_accounts (company_id, partner_contact_id, pallet_type)
  VALUES (NEW.company_id, v_partner, v_type)
  ON CONFLICT (company_id, partner_contact_id, pallet_type) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_account_id;

  IF v_account_id IS NULL THEN
    SELECT id INTO v_account_id FROM pallet_accounts
      WHERE company_id = NEW.company_id AND partner_contact_id = v_partner AND pallet_type = v_type;
  END IF;

  IF COALESCE(NEW.pallets_delivered,0) > 0 THEN
    INSERT INTO pallet_account_transactions
      (company_id, pallet_account_id, delivery_note_id, direction, quantity, pallet_type, reference, created_by)
    VALUES
      (NEW.company_id, v_account_id, NEW.id, 'out', NEW.pallets_delivered, v_type,
       COALESCE(NEW.note_number, NEW.id::text), NEW.assigned_driver_id);
  END IF;

  IF COALESCE(NEW.pallets_returned,0) > 0 THEN
    INSERT INTO pallet_account_transactions
      (company_id, pallet_account_id, delivery_note_id, direction, quantity, pallet_type, reference, created_by)
    VALUES
      (NEW.company_id, v_account_id, NEW.id, 'in', NEW.pallets_returned, v_type,
       COALESCE(NEW.note_number, NEW.id::text), NEW.assigned_driver_id);
  END IF;

  UPDATE delivery_notes SET pallet_ledger_applied = true WHERE id = NEW.id;

  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.derive_pallet_quantities_from_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_quantity integer;
BEGIN
  IF NEW.partner_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('confirmed','delivered') THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.pallets_delivered, 0) > 0 OR COALESCE(NEW.pallets_returned, 0) > 0 THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(quantity), 0)
    INTO v_total_quantity
    FROM delivery_note_items
   WHERE delivery_note_id = NEW.id
     AND category_id IS NOT NULL;

  IF v_total_quantity > 0 THEN
    IF NEW.type = 'delivery' THEN
      NEW.pallets_delivered := v_total_quantity;
    ELSIF NEW.type = 'pickup' THEN
      NEW.pallets_returned := v_total_quantity;
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_derive_pallet_quantities ON delivery_notes;
CREATE TRIGGER trg_derive_pallet_quantities
  BEFORE UPDATE OF status ON delivery_notes
  FOR EACH ROW
  WHEN (NEW.status IN ('delivered','confirmed'))
  EXECUTE FUNCTION derive_pallet_quantities_from_items();

DROP TRIGGER IF EXISTS trg_auto_pallet_ledger_on_delivery ON delivery_notes;
CREATE TRIGGER trg_auto_pallet_ledger_on_delivery
AFTER UPDATE OF status ON delivery_notes
FOR EACH ROW
WHEN (NEW.status IN ('delivered','confirmed'))
EXECUTE FUNCTION auto_pallet_ledger_on_delivery();
