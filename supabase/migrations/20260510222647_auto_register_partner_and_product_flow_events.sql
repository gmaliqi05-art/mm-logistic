/*
  # Auto-register partners + product-level partner flow events

  1. Purpose
     - Auto-create acc_contacts rows when a delivery_note is saved with a partner_name
       but no partner_id (previously partners remained unregistered unless user clicked
       "Register New Company").
     - Extend partner_flow_events with category_product_id so reports can show the
       specific product (not just category) moved for each partner.

  2. Changes
     A) New trigger `auto_register_partner_from_delivery` on delivery_notes BEFORE
        INSERT/UPDATE: if partner_id is NULL and partner_name is filled, tries to
        match an existing acc_contact by name (case-insensitive) for the same company;
        if none found, inserts a new acc_contact and assigns partner_id.
     B) Backfill existing delivery_notes where partner_id IS NULL but partner_name is
        set - creates contacts and links.
     C) ALTER partner_flow_events ADD COLUMN category_product_id uuid.
     D) Update emit_partner_flow_events to also write category_product_id.
     E) Backfill category_product_id from delivery_note_items for existing flow events.

  3. Security
     - Trigger runs SECURITY INVOKER (uses caller company). RLS on acc_contacts already
       restricts inserts to company scope so escalation is not possible.
*/

CREATE OR REPLACE FUNCTION public.auto_register_partner_from_delivery()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_contact_id uuid;
  v_type text;
BEGIN
  IF NEW.partner_id IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.partner_name IS NULL OR length(trim(NEW.partner_name)) = 0 THEN RETURN NEW; END IF;
  IF NEW.company_id IS NULL THEN RETURN NEW; END IF;

  SELECT id INTO v_contact_id
    FROM acc_contacts
   WHERE company_id = NEW.company_id
     AND lower(trim(name)) = lower(trim(NEW.partner_name))
   LIMIT 1;

  IF v_contact_id IS NULL THEN
    v_type := CASE WHEN NEW.type = 'delivery' THEN 'customer'
                   WHEN NEW.type = 'pickup'   THEN 'supplier'
                   ELSE 'both' END;
    INSERT INTO acc_contacts (company_id, name, contact_type, address, city, postal_code, country, is_active)
    VALUES (
      NEW.company_id,
      trim(NEW.partner_name),
      v_type,
      CASE WHEN NEW.type = 'delivery' THEN NEW.delivery_address ELSE NEW.pickup_address END,
      NULL, NULL, NULL, true
    )
    RETURNING id INTO v_contact_id;
  END IF;

  NEW.partner_id := v_contact_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_auto_register_partner_from_delivery ON delivery_notes;
CREATE TRIGGER trg_auto_register_partner_from_delivery
BEFORE INSERT OR UPDATE OF partner_name, partner_id ON delivery_notes
FOR EACH ROW EXECUTE FUNCTION public.auto_register_partner_from_delivery();

DO $$
DECLARE n record; v_id uuid; v_type text;
BEGIN
  FOR n IN SELECT id, company_id, partner_name, type, delivery_address, pickup_address
             FROM delivery_notes
            WHERE partner_id IS NULL
              AND partner_name IS NOT NULL
              AND length(trim(partner_name)) > 0
  LOOP
    SELECT id INTO v_id FROM acc_contacts
     WHERE company_id = n.company_id AND lower(trim(name)) = lower(trim(n.partner_name)) LIMIT 1;
    IF v_id IS NULL THEN
      v_type := CASE WHEN n.type = 'delivery' THEN 'customer'
                     WHEN n.type = 'pickup' THEN 'supplier'
                     ELSE 'both' END;
      INSERT INTO acc_contacts (company_id, name, contact_type, address, is_active)
      VALUES (n.company_id, trim(n.partner_name), v_type,
              CASE WHEN n.type = 'delivery' THEN n.delivery_address ELSE n.pickup_address END, true)
      RETURNING id INTO v_id;
    END IF;
    UPDATE delivery_notes SET partner_id = v_id WHERE id = n.id;
  END LOOP;
END $$;

-- Mirror partner_id onto counterparty_contact_id so flow events find partner
UPDATE delivery_notes SET counterparty_contact_id = partner_id
 WHERE counterparty_contact_id IS NULL AND partner_id IS NOT NULL;

UPDATE delivery_notes SET counterparty_name = partner_name
 WHERE counterparty_name IS NULL AND partner_name IS NOT NULL;

ALTER TABLE partner_flow_events
  ADD COLUMN IF NOT EXISTS category_product_id uuid REFERENCES category_products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pfe_category_product ON partner_flow_events(category_product_id);

CREATE OR REPLACE FUNCTION public.emit_partner_flow_events()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text;
  v_direction_own text;
  v_partner_role text;
  v_partner_company uuid;
  v_partner_contact uuid;
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

  v_partner_company := NEW.counterparty_company_id;
  v_partner_contact := coalesce(NEW.counterparty_contact_id, NEW.partner_id);

  DELETE FROM partner_flow_events WHERE delivery_note_id = NEW.id AND company_id = NEW.company_id;

  FOR item IN SELECT category_id, category_product_id, quantity FROM delivery_note_items WHERE delivery_note_id = NEW.id LOOP
    INSERT INTO partner_flow_events
      (company_id, partner_company_id, partner_contact_id, delivery_note_id, direction,
       role_of_partner, category_id, category_product_id, quantity, event_date)
    VALUES
      (NEW.company_id, v_partner_company, v_partner_contact, NEW.id, v_direction_own,
       v_partner_role, item.category_id, item.category_product_id, coalesce(item.quantity,0),
       coalesce(NEW.delivered_at, now()));
  END LOOP;
  RETURN NEW;
END $$;

-- Backfill existing events with category_product_id from delivery_note_items
UPDATE partner_flow_events pfe
   SET category_product_id = dni.category_product_id
  FROM delivery_note_items dni
 WHERE pfe.delivery_note_id = dni.delivery_note_id
   AND pfe.category_id = dni.category_id
   AND pfe.category_product_id IS NULL
   AND dni.category_product_id IS NOT NULL;

-- Also backfill partner_contact_id from partner_id where missing
UPDATE partner_flow_events pfe
   SET partner_contact_id = dn.partner_id
  FROM delivery_notes dn
 WHERE pfe.delivery_note_id = dn.id
   AND pfe.partner_contact_id IS NULL
   AND dn.partner_id IS NOT NULL;

-- Regenerate flow events for existing confirmed notes so they carry product info
DO $$
DECLARE n record;
BEGIN
  FOR n IN SELECT id, status FROM delivery_notes WHERE status IN ('delivered','confirmed') AND flow_role IS NOT NULL LOOP
    UPDATE delivery_notes SET status = 'pending_stock_confirmation' WHERE id = n.id;
    UPDATE delivery_notes SET status = n.status WHERE id = n.id;
  END LOOP;
END $$;
