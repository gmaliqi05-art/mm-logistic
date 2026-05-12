/*
  # Add three-party logistics fields to acc_delivery_notes

  1. Changes
    - Add our_role, consignor_*, carrier_*, consignee_*, goods_owner_* columns
      to acc_delivery_notes mirroring delivery_notes for UI consistency

  2. Security
    - Existing RLS remains intact; only additive column changes
*/

ALTER TABLE acc_delivery_notes
  ADD COLUMN IF NOT EXISTS our_role text,
  ADD COLUMN IF NOT EXISTS consignor_company_id uuid,
  ADD COLUMN IF NOT EXISTS consignor_contact_id uuid,
  ADD COLUMN IF NOT EXISTS consignor_name text,
  ADD COLUMN IF NOT EXISTS consignor_vat text,
  ADD COLUMN IF NOT EXISTS consignor_address text,
  ADD COLUMN IF NOT EXISTS consignor_city text,
  ADD COLUMN IF NOT EXISTS consignor_country text,
  ADD COLUMN IF NOT EXISTS carrier_company_id uuid,
  ADD COLUMN IF NOT EXISTS carrier_contact_id uuid,
  ADD COLUMN IF NOT EXISTS carrier_name text,
  ADD COLUMN IF NOT EXISTS carrier_vat text,
  ADD COLUMN IF NOT EXISTS carrier_vehicle_plate text,
  ADD COLUMN IF NOT EXISTS consignee_company_id uuid,
  ADD COLUMN IF NOT EXISTS consignee_contact_id uuid,
  ADD COLUMN IF NOT EXISTS consignee_name text,
  ADD COLUMN IF NOT EXISTS consignee_vat text,
  ADD COLUMN IF NOT EXISTS consignee_address text,
  ADD COLUMN IF NOT EXISTS consignee_city text,
  ADD COLUMN IF NOT EXISTS consignee_country text,
  ADD COLUMN IF NOT EXISTS goods_owner_company_id uuid,
  ADD COLUMN IF NOT EXISTS goods_owner_contact_id uuid;
