/*
  # A-M1/A-M2 (targeted): keep delivery-note direction fields in sync

  A delivery note carries three fields that all encode the same movement
  direction:

    type       : 'delivery' | 'pickup'
    flow_role  : 'sender'   | 'receiver'  (+ 'internal_transfer')
    our_role   : 'consignor'| 'consignee' (+ 'carrier', CMR 3-party model)

  `auto_set_delivery_flow_defaults` only ever filled these when NULL and
  derived type -> flow_role -> our_role once. But the create form
  (`src/pages/company/DeliveryNotes.tsx`) writes `type` from the user's
  delivery/pickup toggle while `our_role` is sent from a state variable that
  defaults to 'consignor' and whose selector UI is currently disabled — so a
  note the user marks as **pickup** is still stored with `our_role='consignor'`.
  Result: the three fields drift apart (2 of 15 live rows already diverge),
  and any code reading `our_role` sees the opposite direction from what the
  stock engine (which routes off `type`) actually does.

  `type` is the field the user actually chooses and the one the stock trigger
  already trusts, so it is the canonical direction here. This rewrites the
  defaulter to always derive `our_role` and `flow_role` from `type` (not only
  when NULL), so they can never drift again. An explicit `our_role='carrier'`
  is preserved — `type` has no carrier value, and carrier notes never touch
  our stock (see 20260704120000). Non-standard `type` values are left
  untouched.

  This changes NO stock behaviour: the stock trigger keys off `type`, which is
  unchanged. It only corrects the derived `our_role`/`flow_role` so the CMR
  fields, exports, and UI agree with the actual movement. Existing rows are
  realigned in a backfill (fixing e.g. note "Paleck": pickup was stored as
  consignor -> corrected to consignee).

  Applied to prod via MCP; recorded here.
*/

CREATE OR REPLACE FUNCTION public.auto_set_delivery_flow_defaults()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  -- Canonical direction is `type`. Derive the CMR role and legacy flow_role
  -- from it on every write so the three fields cannot drift. Preserve an
  -- explicit carrier role (not expressible via `type`) and any non
  -- delivery/pickup type (e.g. internal transfers) unchanged.
  IF NEW.type IN ('delivery', 'pickup') AND COALESCE(NEW.our_role, '') <> 'carrier' THEN
    NEW.our_role := CASE NEW.type
      WHEN 'delivery' THEN 'consignor'
      WHEN 'pickup'   THEN 'consignee'
    END;
    NEW.flow_role := CASE NEW.type
      WHEN 'delivery' THEN 'sender'
      WHEN 'pickup'   THEN 'receiver'
    END;
  ELSIF NEW.flow_role IS NULL THEN
    -- Fallback for rows with a non-standard type: keep the old NULL-fill so
    -- internal_transfer / carrier notes still get a sensible flow_role.
    NEW.flow_role := CASE
      WHEN NEW.our_role = 'consignor' THEN 'sender'
      WHEN NEW.our_role = 'consignee' THEN 'receiver'
      ELSE NEW.flow_role
    END;
  END IF;

  IF NEW.owner_company_id IS NULL
     AND NEW.flow_role IN ('sender', 'receiver', 'internal_transfer') THEN
    NEW.owner_company_id := NEW.company_id;
  END IF;

  RETURN NEW;
END;
$function$;

-- Ensure the sync runs on both INSERT and UPDATE (edits must re-sync too).
DROP TRIGGER IF EXISTS trg_auto_set_delivery_flow_defaults ON public.delivery_notes;
CREATE TRIGGER trg_auto_set_delivery_flow_defaults
  BEFORE INSERT OR UPDATE ON public.delivery_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_set_delivery_flow_defaults();

-- Realign existing rows to the canonical `type` (carrier / non-standard left as-is).
UPDATE public.delivery_notes
SET
  our_role = CASE type WHEN 'delivery' THEN 'consignor' WHEN 'pickup' THEN 'consignee' ELSE our_role END,
  flow_role = CASE type WHEN 'delivery' THEN 'sender' WHEN 'pickup' THEN 'receiver' ELSE flow_role END
WHERE type IN ('delivery', 'pickup')
  AND COALESCE(our_role, '') <> 'carrier'
  AND (
    our_role IS DISTINCT FROM (CASE type WHEN 'delivery' THEN 'consignor' WHEN 'pickup' THEN 'consignee' END)
    OR flow_role IS DISTINCT FROM (CASE type WHEN 'delivery' THEN 'sender' WHEN 'pickup' THEN 'receiver' END)
  );
