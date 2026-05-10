/*
  # Create Partner Flow Events System

  1. Overview
     Creates infrastructure for the "Rrjedhat me partneret" unified partner flow report.
     Previously only staged in docs/PENDING_MIGRATION_flow_roles.sql, now activated.

  2. New Tables
     - `partner_flow_events` - cross-company flow audit trail
       Columns: id, company_id, partner_company_id, partner_contact_id, delivery_note_id,
       direction, role_of_partner, category_id, quantity, event_date, notes

  3. Modified Tables
     - `delivery_notes`: adds flow_role, counterparty_* fields, owner_company_id,
       origin/destination depot refs, touches_own_stock
     - `stock` and `stock_movements`: adds ownership ('own'|'held') + owner_company_id;
       stock_movements also gets delivery_note_id
     - `depots`: adds lat, lng, depot_type

  4. New Functions
     - `match_counterparty_company(vat, email, phone, name)` - matches external party to company
     - `emit_partner_flow_events()` - trigger function for delivery_notes status changes

  5. Triggers
     - `trg_emit_partner_flow_events` on delivery_notes AFTER INSERT OR UPDATE OF status

  6. Security
     - partner_flow_events has RLS with 4 separate policies (select/insert/update/delete)
     - Select allows both owning company and matched partner company to view
     - Insert/update/delete restricted to owning company only
*/

ALTER TABLE delivery_notes
  ADD COLUMN IF NOT EXISTS flow_role text,
  ADD COLUMN IF NOT EXISTS counterparty_company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS counterparty_contact_id uuid REFERENCES acc_contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS counterparty_name text,
  ADD COLUMN IF NOT EXISTS counterparty_vat text,
  ADD COLUMN IF NOT EXISTS counterparty_phone text,
  ADD COLUMN IF NOT EXISTS counterparty_email text,
  ADD COLUMN IF NOT EXISTS owner_company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origin_depot_id uuid REFERENCES depots(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS destination_depot_id uuid REFERENCES depots(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS touches_own_stock boolean DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints WHERE constraint_name = 'delivery_notes_flow_role_check') THEN
    ALTER TABLE delivery_notes ADD CONSTRAINT delivery_notes_flow_role_check
      CHECK (flow_role IS NULL OR flow_role IN ('sender','receiver','carrier_only','custodian_in','custodian_out','internal_transfer'));
  END IF;
END $$;

UPDATE delivery_notes SET flow_role = CASE
  WHEN type = 'delivery' THEN 'sender'
  WHEN type = 'pickup' THEN 'receiver'
  ELSE flow_role
END WHERE flow_role IS NULL;

UPDATE delivery_notes SET origin_depot_id = assigned_depot_id
  WHERE origin_depot_id IS NULL AND flow_role IN ('sender','custodian_out','internal_transfer');

UPDATE delivery_notes SET destination_depot_id = assigned_depot_id
  WHERE destination_depot_id IS NULL AND flow_role IN ('receiver','custodian_in');

UPDATE delivery_notes SET owner_company_id = company_id
  WHERE owner_company_id IS NULL AND flow_role IN ('sender','receiver','internal_transfer');

ALTER TABLE stock
  ADD COLUMN IF NOT EXISTS ownership text DEFAULT 'own',
  ADD COLUMN IF NOT EXISTS owner_company_id uuid REFERENCES companies(id) ON DELETE SET NULL;

ALTER TABLE stock_movements
  ADD COLUMN IF NOT EXISTS ownership text DEFAULT 'own',
  ADD COLUMN IF NOT EXISTS owner_company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivery_note_id uuid REFERENCES delivery_notes(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints WHERE constraint_name = 'stock_ownership_check') THEN
    ALTER TABLE stock ADD CONSTRAINT stock_ownership_check CHECK (ownership IN ('own','held'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints WHERE constraint_name = 'stock_movements_ownership_check') THEN
    ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_ownership_check CHECK (ownership IN ('own','held'));
  END IF;
END $$;

UPDATE stock SET owner_company_id = company_id WHERE owner_company_id IS NULL;
UPDATE stock_movements SET owner_company_id = company_id WHERE owner_company_id IS NULL;

ALTER TABLE depots
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lng double precision,
  ADD COLUMN IF NOT EXISTS depot_type text DEFAULT 'main';

CREATE TABLE IF NOT EXISTS partner_flow_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  partner_company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  partner_contact_id uuid REFERENCES acc_contacts(id) ON DELETE SET NULL,
  delivery_note_id uuid REFERENCES delivery_notes(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('in','out','carrier_in','carrier_out','custody_in','custody_out')),
  role_of_partner text CHECK (role_of_partner IN ('sender','receiver','owner')),
  category_id uuid REFERENCES product_categories(id) ON DELETE SET NULL,
  quantity integer NOT NULL DEFAULT 0,
  event_date timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pfe_company ON partner_flow_events(company_id);
CREATE INDEX IF NOT EXISTS idx_pfe_partner_company ON partner_flow_events(partner_company_id);
CREATE INDEX IF NOT EXISTS idx_pfe_delivery_note ON partner_flow_events(delivery_note_id);
CREATE INDEX IF NOT EXISTS idx_pfe_date ON partner_flow_events(event_date);

ALTER TABLE partner_flow_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members view own flow events" ON partner_flow_events;
CREATE POLICY "Company members view own flow events"
  ON partner_flow_events FOR SELECT TO authenticated
  USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    OR partner_company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Company admins insert flow events" ON partner_flow_events;
CREATE POLICY "Company admins insert flow events"
  ON partner_flow_events FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company admins update own flow events" ON partner_flow_events;
CREATE POLICY "Company admins update own flow events"
  ON partner_flow_events FOR UPDATE TO authenticated
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company admins delete own flow events" ON partner_flow_events;
CREATE POLICY "Company admins delete own flow events"
  ON partner_flow_events FOR DELETE TO authenticated
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE OR REPLACE FUNCTION public.match_counterparty_company(
  p_vat text, p_email text, p_phone text, p_name text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_norm_phone text;
BEGIN
  IF p_vat IS NOT NULL AND length(trim(p_vat)) > 3 THEN
    SELECT id INTO v_id FROM companies WHERE lower(trim(vat_number)) = lower(trim(p_vat)) LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;
  IF p_email IS NOT NULL AND length(trim(p_email)) > 3 THEN
    SELECT id INTO v_id FROM companies WHERE lower(trim(email)) = lower(trim(p_email)) LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;
  IF p_phone IS NOT NULL THEN
    v_norm_phone := regexp_replace(p_phone, '[^0-9]', '', 'g');
    IF length(v_norm_phone) >= 6 THEN
      SELECT id INTO v_id FROM companies
        WHERE regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g') = v_norm_phone LIMIT 1;
      IF v_id IS NOT NULL THEN RETURN v_id; END IF;
    END IF;
  END IF;
  IF p_name IS NOT NULL AND length(trim(p_name)) > 3 THEN
    SELECT id INTO v_id FROM companies WHERE lower(trim(name)) = lower(trim(p_name)) LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;
  RETURN NULL;
END $$;

REVOKE EXECUTE ON FUNCTION public.match_counterparty_company(text,text,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.match_counterparty_company(text,text,text,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.emit_partner_flow_events()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text;
  v_direction_own text;
  v_partner_role text;
  item record;
BEGIN
  v_role := NEW.flow_role;
  IF v_role IS NULL THEN RETURN NEW; END IF;
  IF (TG_OP = 'UPDATE') AND (NEW.status = OLD.status) THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('delivered','confirmed') THEN RETURN NEW; END IF;

  IF v_role = 'sender' THEN
    v_direction_own := 'out'; v_partner_role := 'receiver';
  ELSIF v_role = 'receiver' THEN
    v_direction_own := 'in'; v_partner_role := 'sender';
  ELSIF v_role = 'carrier_only' THEN
    v_direction_own := 'carrier_out'; v_partner_role := 'owner';
  ELSIF v_role = 'custodian_in' THEN
    v_direction_own := 'custody_in'; v_partner_role := 'owner';
  ELSIF v_role = 'custodian_out' THEN
    v_direction_own := 'custody_out'; v_partner_role := 'receiver';
  ELSE
    RETURN NEW;
  END IF;

  DELETE FROM partner_flow_events WHERE delivery_note_id = NEW.id AND company_id = NEW.company_id;

  FOR item IN SELECT category_id, quantity FROM delivery_note_items WHERE delivery_note_id = NEW.id LOOP
    INSERT INTO partner_flow_events
      (company_id, partner_company_id, partner_contact_id, delivery_note_id, direction, role_of_partner, category_id, quantity, event_date)
    VALUES
      (NEW.company_id, NEW.counterparty_company_id, NEW.counterparty_contact_id, NEW.id, v_direction_own, v_partner_role, item.category_id, coalesce(item.quantity,0), coalesce(NEW.delivered_at, now()));
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_emit_partner_flow_events ON delivery_notes;
CREATE TRIGGER trg_emit_partner_flow_events
AFTER INSERT OR UPDATE OF status ON delivery_notes
FOR EACH ROW EXECUTE FUNCTION public.emit_partner_flow_events();
