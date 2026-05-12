/*
  # Three-Party Logistics Model (CMR Convention)

  ## Purpose
  Restructure delivery_notes to support the standard CMR 3-party logistics model:
  Consignor (sender) -> Carrier (transporter) -> Consignee (receiver).

  The company using the platform can play any of these 3 roles in a single
  delivery, and the partner registration logic depends on which role.

  ## New columns on delivery_notes

  Consignor (sender of goods):
  - consignor_company_id, consignor_contact_id, consignor_name, consignor_vat,
    consignor_address, consignor_city, consignor_country

  Carrier (who physically transports):
  - carrier_company_id, carrier_contact_id, carrier_name, carrier_vat,
    carrier_vehicle_plate

  Consignee (receiver of goods):
  - consignee_company_id, consignee_contact_id, consignee_name, consignee_vat,
    consignee_address, consignee_city, consignee_country

  Our role in this delivery:
  - our_role: 'consignor' | 'carrier' | 'consignee' | 'custodian_in' |
              'custodian_out' | 'internal_transfer'

  Goods ownership (for custody / carrier_only cases):
  - goods_owner_company_id, goods_owner_contact_id
    (Who legally owns the goods being transported, even if we hold them)

  ## Backfill
  Existing delivery_notes are mapped:
  - type='delivery' -> our_role='consignor' (we send to customer)
  - type='pickup'   -> our_role='consignee' (we receive from supplier)
*/

ALTER TABLE delivery_notes
  -- Consignor fields
  ADD COLUMN IF NOT EXISTS consignor_company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS consignor_contact_id uuid REFERENCES acc_contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS consignor_name text,
  ADD COLUMN IF NOT EXISTS consignor_vat text,
  ADD COLUMN IF NOT EXISTS consignor_address text,
  ADD COLUMN IF NOT EXISTS consignor_city text,
  ADD COLUMN IF NOT EXISTS consignor_country text,

  -- Carrier fields
  ADD COLUMN IF NOT EXISTS carrier_company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS carrier_contact_id uuid REFERENCES acc_contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS carrier_name text,
  ADD COLUMN IF NOT EXISTS carrier_vat text,
  ADD COLUMN IF NOT EXISTS carrier_vehicle_plate text,

  -- Consignee fields
  ADD COLUMN IF NOT EXISTS consignee_company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS consignee_contact_id uuid REFERENCES acc_contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS consignee_name text,
  ADD COLUMN IF NOT EXISTS consignee_vat text,
  ADD COLUMN IF NOT EXISTS consignee_address text,
  ADD COLUMN IF NOT EXISTS consignee_city text,
  ADD COLUMN IF NOT EXISTS consignee_country text,

  -- Our role
  ADD COLUMN IF NOT EXISTS our_role text,

  -- Goods ownership (for custody and carrier_only)
  ADD COLUMN IF NOT EXISTS goods_owner_company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS goods_owner_contact_id uuid REFERENCES acc_contacts(id) ON DELETE SET NULL;

-- Constraint on our_role
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints
                 WHERE constraint_name = 'delivery_notes_our_role_check') THEN
    ALTER TABLE delivery_notes ADD CONSTRAINT delivery_notes_our_role_check
      CHECK (our_role IS NULL OR our_role IN (
        'consignor', 'carrier', 'consignee',
        'custodian_in', 'custodian_out', 'internal_transfer'
      ));
  END IF;
END $$;

-- Backfill our_role from existing type
UPDATE delivery_notes SET
  our_role = 'consignor',
  consignor_company_id = company_id,
  consignee_name = COALESCE(partner_name, ''),
  consignee_contact_id = partner_id,
  consignee_address = delivery_address
WHERE type = 'delivery' AND our_role IS NULL;

UPDATE delivery_notes SET
  our_role = 'consignee',
  consignee_company_id = company_id,
  consignor_name = COALESCE(partner_name, ''),
  consignor_contact_id = partner_id,
  consignor_address = pickup_address
WHERE type = 'pickup' AND our_role IS NULL;

-- Goods owner defaults
UPDATE delivery_notes SET
  goods_owner_company_id = company_id
WHERE goods_owner_company_id IS NULL
  AND our_role IN ('consignor', 'consignee', 'internal_transfer');

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_delivery_notes_our_role ON delivery_notes(our_role);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_consignor_contact ON delivery_notes(consignor_contact_id);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_consignee_contact ON delivery_notes(consignee_contact_id);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_goods_owner ON delivery_notes(goods_owner_contact_id);

-- View for easy 3-party display
CREATE OR REPLACE VIEW delivery_notes_3party_view AS
SELECT
  dn.id,
  dn.note_number,
  dn.company_id,
  dn.our_role,
  dn.status,
  dn.type, -- legacy
  dn.flow_role, -- legacy

  -- Resolved consignor info
  COALESCE(
    cc_consignor.name,
    comp_consignor.name,
    dn.consignor_name
  ) AS consignor_display_name,
  dn.consignor_address,
  dn.consignor_contact_id,

  -- Resolved carrier info
  COALESCE(
    cc_carrier.name,
    comp_carrier.name,
    dn.carrier_name
  ) AS carrier_display_name,

  -- Resolved consignee info
  COALESCE(
    cc_consignee.name,
    comp_consignee.name,
    dn.consignee_name
  ) AS consignee_display_name,
  dn.consignee_address,
  dn.consignee_contact_id,

  -- Goods owner
  COALESCE(
    cc_owner.name,
    comp_owner.name
  ) AS goods_owner_display_name,

  dn.created_at,
  dn.delivered_at,
  dn.delivery_date
FROM delivery_notes dn
LEFT JOIN acc_contacts cc_consignor ON cc_consignor.id = dn.consignor_contact_id
LEFT JOIN companies comp_consignor ON comp_consignor.id = dn.consignor_company_id
LEFT JOIN acc_contacts cc_carrier ON cc_carrier.id = dn.carrier_contact_id
LEFT JOIN companies comp_carrier ON comp_carrier.id = dn.carrier_company_id
LEFT JOIN acc_contacts cc_consignee ON cc_consignee.id = dn.consignee_contact_id
LEFT JOIN companies comp_consignee ON comp_consignee.id = dn.consignee_company_id
LEFT JOIN acc_contacts cc_owner ON cc_owner.id = dn.goods_owner_contact_id
LEFT JOIN companies comp_owner ON comp_owner.id = dn.goods_owner_company_id;

GRANT SELECT ON delivery_notes_3party_view TO authenticated;
