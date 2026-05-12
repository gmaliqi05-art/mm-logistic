/*
  # Pallet Account Routing by Goods Owner

  ## Purpose
  When we are 'carrier_only' or 'custodian_*', pallet account balances must be
  tracked against the GOODS OWNER (the partner paying us), not the consignee
  (which would be the client of our client).

  This fixes a bug where pallet balances were attributed to the wrong party
  in transport-only scenarios.
*/

CREATE OR REPLACE FUNCTION public.derive_pallet_quantities_from_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_quantity integer;
  v_partner_id uuid;
BEGIN
  -- Status must be confirmed/delivered to apply
  IF NEW.status NOT IN ('confirmed','delivered') THEN RETURN NEW; END IF;

  -- Determine which partner contact this delivery affects for pallet accounting
  v_partner_id := CASE
    WHEN NEW.our_role = 'consignor' THEN NEW.consignee_contact_id
    WHEN NEW.our_role = 'consignee' THEN NEW.consignor_contact_id
    WHEN NEW.our_role = 'carrier' THEN COALESCE(NEW.goods_owner_contact_id, NEW.consignor_contact_id)
    WHEN NEW.our_role IN ('custodian_in', 'custodian_out')
         THEN COALESCE(NEW.goods_owner_contact_id, NEW.consignor_contact_id, NEW.consignee_contact_id)
    ELSE NEW.pallet_partner_contact_id
  END;

  -- Sync legacy column for old triggers
  IF v_partner_id IS NOT NULL AND NEW.pallet_partner_contact_id IS NULL THEN
    NEW.pallet_partner_contact_id := v_partner_id;
  END IF;

  -- Only auto-derive quantities if not set manually
  IF COALESCE(NEW.pallets_delivered, 0) > 0 OR COALESCE(NEW.pallets_returned, 0) > 0 THEN
    RETURN NEW;
  END IF;

  IF v_partner_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Sum items
  SELECT COALESCE(SUM(quantity), 0) INTO v_total_quantity
  FROM delivery_note_items
  WHERE delivery_note_id = NEW.id AND category_id IS NOT NULL;

  IF v_total_quantity > 0 THEN
    -- Direction depends on our role:
    -- consignor: we deliver pallets to consignee (pallets_delivered +)
    -- consignee: we receive pallets (pallets_returned +)
    -- carrier (custody): track based on direction
    IF NEW.our_role = 'consignor' THEN
      NEW.pallets_delivered := v_total_quantity;
    ELSIF NEW.our_role = 'consignee' THEN
      NEW.pallets_returned := v_total_quantity;
    ELSIF NEW.our_role = 'custodian_in' THEN
      NEW.pallets_returned := v_total_quantity;  -- we received from partner
    ELSIF NEW.our_role = 'custodian_out' THEN
      NEW.pallets_delivered := v_total_quantity;  -- we released back
    -- carrier: no pallet account movement by default (transport only)
    END IF;
  END IF;

  RETURN NEW;
END $$;

-- Recreate trigger to ensure new function body is used
DROP TRIGGER IF EXISTS trg_derive_pallet_quantities ON delivery_notes;
CREATE TRIGGER trg_derive_pallet_quantities
  BEFORE UPDATE OF status ON delivery_notes
  FOR EACH ROW
  WHEN (NEW.status IN ('delivered','confirmed'))
  EXECUTE FUNCTION public.derive_pallet_quantities_from_items();
