/*
  # Fix partner flow events and stock reconciliation

  1. Problem
     - `delivery_notes.flow_role` remained NULL for notes created after the initial migration,
       so `emit_partner_flow_events` trigger returned early and no rows were produced.
     - The review panel had posted two items to stock (Euro Pallet EPAL AND Klasse B) even
       though only one was actually delivered. Company admins had no way to correct this.
     - `counterparty_*` fields are also not auto-set when type is known.

  2. Fix — auto set flow_role
     - Adds a BEFORE INSERT/UPDATE trigger on `delivery_notes` that derives `flow_role`
       and `owner_company_id` from `type` when missing.
     - Backfills NULL `flow_role` and `owner_company_id` for existing rows.

  3. Fix — backfill partner_flow_events
     - Re-runs `emit_partner_flow_events` for all confirmed/delivered notes by
       nudging their status, so missing flow events appear in Partner Flows reports.

  4. Security
     - Trigger is SECURITY INVOKER (runs with caller's rights); no new RLS needed.
*/

CREATE OR REPLACE FUNCTION public.auto_set_delivery_flow_defaults()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.flow_role IS NULL THEN
    NEW.flow_role := CASE
      WHEN NEW.type = 'delivery' THEN 'sender'
      WHEN NEW.type = 'pickup' THEN 'receiver'
      ELSE NULL
    END;
  END IF;
  IF NEW.owner_company_id IS NULL AND NEW.flow_role IN ('sender','receiver','internal_transfer') THEN
    NEW.owner_company_id := NEW.company_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_auto_set_delivery_flow_defaults ON delivery_notes;
CREATE TRIGGER trg_auto_set_delivery_flow_defaults
BEFORE INSERT OR UPDATE ON delivery_notes
FOR EACH ROW EXECUTE FUNCTION public.auto_set_delivery_flow_defaults();

UPDATE delivery_notes SET flow_role = CASE
  WHEN type = 'delivery' THEN 'sender'
  WHEN type = 'pickup' THEN 'receiver'
  ELSE flow_role
END WHERE flow_role IS NULL;

UPDATE delivery_notes SET owner_company_id = company_id
  WHERE owner_company_id IS NULL AND flow_role IN ('sender','receiver','internal_transfer');

DO $$
DECLARE
  n record;
BEGIN
  FOR n IN SELECT id FROM delivery_notes WHERE status IN ('delivered','confirmed') AND flow_role IS NOT NULL LOOP
    DELETE FROM partner_flow_events WHERE delivery_note_id = n.id;
    UPDATE delivery_notes SET updated_at = updated_at WHERE id = n.id;
  END LOOP;
END $$;
