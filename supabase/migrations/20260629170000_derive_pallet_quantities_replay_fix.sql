/*
  # Make derive_pallet_quantities_from_items reproducible from migrations (A-C2)

  The live function is already correct — it reads `NEW.partner_id`. But the
  last migration that defines its BODY (`20260512100400_pallet_account_by_goods_owner.sql`)
  still references `NEW.pallet_partner_contact_id`, a column that was DROPPED
  earlier in `20260508095640_unify_partner_on_delivery_notes.sql`. The two
  `20260517*` migrations only revoke/harden privileges, they don't redefine
  the body. So a **clean replay of the committed migration set from scratch**
  (a fresh environment, disaster recovery, `supabase db reset`) would end with
  a function that throws `record "new" has no field "pallet_partner_contact_id"`
  on every confirm/deliver.

  Production was hot-fixed out-of-band to the `partner_id` version, so PROD is
  fine — this migration simply codifies the correct live body so the committed
  migrations converge to production and clean replay works. No behavioural
  change to the running database.
*/

CREATE OR REPLACE FUNCTION public.derive_pallet_quantities_from_items()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_total_quantity integer;
BEGIN
  IF NEW.partner_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('confirmed','delivered') THEN
    RETURN NEW;
  END IF;

  -- Respect explicitly-entered pallet counts; only auto-derive when both are 0.
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
END $function$;
