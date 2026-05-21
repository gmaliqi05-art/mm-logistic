/*
  # Backfill our_role on existing delivery_notes and set it for new rows

  `delivery_notes.our_role` (consignor / consignee / internal_transfer)
  was added later than `flow_role`, and the trigger
  `auto_set_delivery_flow_defaults` only populates `flow_role` +
  `owner_company_id`. As a result 9 of the 30 existing delivery_notes
  ended up with `our_role IS NULL` despite being fully processed
  (status=confirmed, stock_posted=true).

  `process_delivery_note_stock` checks `our_role` and bails out with
  `stock_post_error='our_role is null'` when it's missing, which masks
  legitimate problems and forces operators to fix rows by hand.

  This migration:
    1. Extends `auto_set_delivery_flow_defaults` so it also derives
       `our_role` from `flow_role` (sender -> consignor,
       receiver -> consignee, internal_transfer -> internal_transfer)
       when the column is left NULL on insert/update.
    2. Backfills the 9 historical NULL rows in a single UPDATE.

  No data shape changes — `our_role` keeps its existing enum-like
  values (consignor / consignee / internal_transfer).
*/

CREATE OR REPLACE FUNCTION public.auto_set_delivery_flow_defaults()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.flow_role IS NULL THEN
    NEW.flow_role := CASE
      WHEN NEW.type = 'delivery' THEN 'sender'
      WHEN NEW.type = 'pickup'   THEN 'receiver'
      ELSE NULL
    END;
  END IF;

  IF NEW.owner_company_id IS NULL AND NEW.flow_role IN ('sender', 'receiver', 'internal_transfer') THEN
    NEW.owner_company_id := NEW.company_id;
  END IF;

  IF NEW.our_role IS NULL THEN
    NEW.our_role := CASE
      WHEN NEW.flow_role = 'sender'              THEN 'consignor'
      WHEN NEW.flow_role = 'receiver'            THEN 'consignee'
      WHEN NEW.flow_role = 'internal_transfer'   THEN 'internal_transfer'
      ELSE NULL
    END;
  END IF;

  RETURN NEW;
END;
$$;

-- Backfill the 9 historical rows.
UPDATE delivery_notes
SET    our_role = CASE
         WHEN flow_role = 'sender'            THEN 'consignor'
         WHEN flow_role = 'receiver'          THEN 'consignee'
         WHEN flow_role = 'internal_transfer' THEN 'internal_transfer'
       END
WHERE  our_role IS NULL
  AND  flow_role IS NOT NULL;
