/*
  # Held Stock for Custody Operations

  ## Purpose
  When we play the role of 'custodian_in' or 'custodian_out', we hold goods
  that legally belong to another party (the goods_owner). These goods must
  NOT affect our own stock counts but must be tracked separately so we can:
  - Report how many of partner X's pallets we currently hold
  - Charge custody/storage fees
  - Return them correctly when needed

  ## New table held_stock
  Similar structure to `stock` but with mandatory `owner_contact_id`.
*/

CREATE TABLE IF NOT EXISTS held_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  depot_id uuid REFERENCES depots(id) ON DELETE SET NULL,
  category_id uuid REFERENCES product_categories(id) ON DELETE SET NULL,
  category_product_id uuid REFERENCES category_products(id) ON DELETE SET NULL,
  owner_contact_id uuid NOT NULL REFERENCES acc_contacts(id) ON DELETE RESTRICT,
  quantity numeric DEFAULT 0,
  condition text DEFAULT 'good',
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (company_id, depot_id, category_product_id, owner_contact_id, condition)
);

CREATE INDEX IF NOT EXISTS idx_held_stock_company ON held_stock(company_id);
CREATE INDEX IF NOT EXISTS idx_held_stock_owner ON held_stock(owner_contact_id);
CREATE INDEX IF NOT EXISTS idx_held_stock_depot ON held_stock(depot_id);

ALTER TABLE held_stock ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members read own held_stock" ON held_stock;
CREATE POLICY "Company members read own held_stock"
  ON held_stock FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company admins manage held_stock" ON held_stock;
CREATE POLICY "Company admins manage held_stock"
  ON held_stock FOR ALL TO authenticated
  USING (company_id IN (
    SELECT company_id FROM profiles
    WHERE id = auth.uid() AND role IN ('company_admin', 'depot_worker', 'accountant')
  ));

-- Trigger to keep updated_at fresh
CREATE OR REPLACE FUNCTION public.held_stock_touch_updated()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_held_stock_touch ON held_stock;
CREATE TRIGGER trg_held_stock_touch
  BEFORE UPDATE ON held_stock
  FOR EACH ROW EXECUTE FUNCTION public.held_stock_touch_updated();

-- Movement table for held_stock audit trail
CREATE TABLE IF NOT EXISTS held_stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  depot_id uuid REFERENCES depots(id) ON DELETE SET NULL,
  category_id uuid REFERENCES product_categories(id) ON DELETE SET NULL,
  category_product_id uuid REFERENCES category_products(id) ON DELETE SET NULL,
  owner_contact_id uuid NOT NULL REFERENCES acc_contacts(id) ON DELETE RESTRICT,
  delivery_note_id uuid REFERENCES delivery_notes(id) ON DELETE SET NULL,
  movement_type text NOT NULL CHECK (movement_type IN ('custody_in', 'custody_out')),
  quantity numeric NOT NULL,
  condition text DEFAULT 'good',
  performed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_held_stock_movements_company ON held_stock_movements(company_id);
CREATE INDEX IF NOT EXISTS idx_held_stock_movements_owner ON held_stock_movements(owner_contact_id);
CREATE INDEX IF NOT EXISTS idx_held_stock_movements_dn ON held_stock_movements(delivery_note_id);

ALTER TABLE held_stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members read own held_stock_movements" ON held_stock_movements;
CREATE POLICY "Company members read own held_stock_movements"
  ON held_stock_movements FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company admins insert held_stock_movements" ON held_stock_movements;
CREATE POLICY "Company admins insert held_stock_movements"
  ON held_stock_movements FOR INSERT TO authenticated
  WITH CHECK (company_id IN (
    SELECT company_id FROM profiles
    WHERE id = auth.uid() AND role IN ('company_admin', 'depot_worker', 'accountant')
  ));
