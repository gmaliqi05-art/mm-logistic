/*
  # Auto-derive pallet_delivered / pallet_returned from delivery_note_items

  1. New Function
    - `derive_pallet_quantities_from_items()` - BEFORE UPDATE trigger on
      `delivery_notes` that fills `pallets_delivered` / `pallets_returned`
      from the sum of `delivery_note_items.quantity` (where `category_id`
      is set) whenever the note transitions to `confirmed` or `delivered`
      and no manual value has been entered.

  2. New Trigger
    - `trg_derive_pallet_quantities` BEFORE UPDATE OF status on
      `delivery_notes`. Runs before the existing
      `trg_auto_pallet_ledger_on_delivery` AFTER trigger so the ledger
      sees the derived values.

  3. Notes
    - Single source of truth for pallet counts becomes the items table.
    - Trigger is a no-op when `pallet_partner_contact_id` is null or when
      the user has already entered non-zero values.
*/

CREATE OR REPLACE FUNCTION public.derive_pallet_quantities_from_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_quantity integer;
BEGIN
  IF NEW.pallet_partner_contact_id IS NULL THEN
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
