/*
  # EPAL Pallet Account Ledger

  1. New Tables
    - `pallet_accounts` - one balance per (company, partner contact, pallet_type)
      - `id` uuid pk
      - `company_id` uuid fk
      - `partner_contact_id` uuid fk acc_contacts
      - `pallet_type` text default 'EPAL'
      - `opening_balance` integer default 0 (positive = partner owes us)
      - `current_balance` integer default 0
      - `last_movement_at` timestamptz nullable
      - `notes` text default ''
      - timestamps
      - UNIQUE (company_id, partner_contact_id, pallet_type)

    - `pallet_account_transactions` - immutable ledger rows
      - `id` uuid pk
      - `company_id` uuid fk
      - `pallet_account_id` uuid fk
      - `delivery_note_id` uuid fk nullable
      - `transaction_date` date default today
      - `direction` text check in ('in','out','adjustment')
      - `quantity` integer (signed for adjustments, positive for in/out)
      - `pallet_type` text default 'EPAL'
      - `condition` text nullable ('A','B','C','Defekt')
      - `reference` text
      - `notes` text
      - `created_by` uuid fk profiles

  2. Modified Tables
    - `delivery_notes` add pallet exchange columns:
      - `pallets_delivered`, `pallets_returned` int default 0
      - `pallet_type` text default 'EPAL'
      - `pallet_exchange_note` text default ''

  3. Security
    - RLS enabled on both new tables
    - Company staff (admin/accountant/logistics) read and write company rows
    - Transactions immutable (no UPDATE/DELETE policies — only INSERT + SELECT)

  4. Triggers
    - `apply_pallet_transaction` AFTER INSERT recalculates current_balance
    - `auto_pallet_ledger_on_delivery` AFTER UPDATE OF status on delivery_notes
      creates in/out rows when status -> 'delivered' or 'confirmed'
*/

CREATE TABLE IF NOT EXISTS pallet_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  partner_contact_id uuid NOT NULL REFERENCES acc_contacts(id) ON DELETE CASCADE,
  pallet_type text NOT NULL DEFAULT 'EPAL',
  opening_balance integer NOT NULL DEFAULT 0,
  current_balance integer NOT NULL DEFAULT 0,
  last_movement_at timestamptz,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, partner_contact_id, pallet_type)
);

CREATE INDEX IF NOT EXISTS idx_pallet_accounts_company ON pallet_accounts (company_id);
CREATE INDEX IF NOT EXISTS idx_pallet_accounts_partner ON pallet_accounts (partner_contact_id);

CREATE TABLE IF NOT EXISTS pallet_account_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  pallet_account_id uuid NOT NULL REFERENCES pallet_accounts(id) ON DELETE CASCADE,
  delivery_note_id uuid REFERENCES delivery_notes(id) ON DELETE SET NULL,
  transaction_date date NOT NULL DEFAULT CURRENT_DATE,
  direction text NOT NULL CHECK (direction IN ('in','out','adjustment')),
  quantity integer NOT NULL,
  pallet_type text NOT NULL DEFAULT 'EPAL',
  condition text CHECK (condition IS NULL OR condition IN ('A','B','C','Defekt')),
  reference text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pallet_txn_account_date ON pallet_account_transactions (pallet_account_id, transaction_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pallet_txn_company ON pallet_account_transactions (company_id);
CREATE INDEX IF NOT EXISTS idx_pallet_txn_delivery ON pallet_account_transactions (delivery_note_id);

ALTER TABLE pallet_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pallet_account_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company staff read pallet accounts"
  ON pallet_accounts FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
      AND p.company_id = pallet_accounts.company_id
      AND p.role IN ('company_admin','accountant','logistics','dispatcher','super_admin'))
  );

CREATE POLICY "Company staff insert pallet accounts"
  ON pallet_accounts FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
      AND p.company_id = pallet_accounts.company_id
      AND p.role IN ('company_admin','accountant','logistics','super_admin'))
  );

CREATE POLICY "Company staff update pallet accounts"
  ON pallet_accounts FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
      AND p.company_id = pallet_accounts.company_id
      AND p.role IN ('company_admin','accountant','logistics','super_admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
      AND p.company_id = pallet_accounts.company_id
      AND p.role IN ('company_admin','accountant','logistics','super_admin'))
  );

CREATE POLICY "Company staff read pallet transactions"
  ON pallet_account_transactions FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
      AND p.company_id = pallet_account_transactions.company_id
      AND p.role IN ('company_admin','accountant','logistics','dispatcher','super_admin'))
  );

CREATE POLICY "Company staff insert pallet transactions"
  ON pallet_account_transactions FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
      AND p.company_id = pallet_account_transactions.company_id
      AND p.role IN ('company_admin','accountant','logistics','super_admin'))
  );

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='delivery_notes' AND column_name='pallets_delivered') THEN
    ALTER TABLE delivery_notes ADD COLUMN pallets_delivered integer DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='delivery_notes' AND column_name='pallets_returned') THEN
    ALTER TABLE delivery_notes ADD COLUMN pallets_returned integer DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='delivery_notes' AND column_name='pallet_type') THEN
    ALTER TABLE delivery_notes ADD COLUMN pallet_type text DEFAULT 'EPAL';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='delivery_notes' AND column_name='pallet_exchange_note') THEN
    ALTER TABLE delivery_notes ADD COLUMN pallet_exchange_note text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='delivery_notes' AND column_name='pallet_partner_contact_id') THEN
    ALTER TABLE delivery_notes ADD COLUMN pallet_partner_contact_id uuid REFERENCES acc_contacts(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='delivery_notes' AND column_name='pallet_ledger_applied') THEN
    ALTER TABLE delivery_notes ADD COLUMN pallet_ledger_applied boolean DEFAULT false;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION apply_pallet_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  delta integer;
BEGIN
  IF NEW.direction = 'in' THEN
    delta := NEW.quantity;
  ELSIF NEW.direction = 'out' THEN
    delta := -NEW.quantity;
  ELSE
    delta := NEW.quantity;
  END IF;

  UPDATE pallet_accounts
  SET current_balance = current_balance + delta,
      last_movement_at = now(),
      updated_at = now()
  WHERE id = NEW.pallet_account_id;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_apply_pallet_transaction ON pallet_account_transactions;
CREATE TRIGGER trg_apply_pallet_transaction
AFTER INSERT ON pallet_account_transactions
FOR EACH ROW EXECUTE FUNCTION apply_pallet_transaction();

CREATE OR REPLACE FUNCTION auto_pallet_ledger_on_delivery()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id uuid;
  v_partner uuid;
  v_type text;
BEGIN
  IF (NEW.status NOT IN ('delivered','confirmed')) OR NEW.pallet_ledger_applied THEN
    RETURN NEW;
  END IF;

  v_partner := NEW.pallet_partner_contact_id;
  v_type := COALESCE(NEW.pallet_type, 'EPAL');

  IF v_partner IS NULL OR (COALESCE(NEW.pallets_delivered,0) = 0 AND COALESCE(NEW.pallets_returned,0) = 0) THEN
    RETURN NEW;
  END IF;

  INSERT INTO pallet_accounts (company_id, partner_contact_id, pallet_type)
  VALUES (NEW.company_id, v_partner, v_type)
  ON CONFLICT (company_id, partner_contact_id, pallet_type) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_account_id;

  IF v_account_id IS NULL THEN
    SELECT id INTO v_account_id FROM pallet_accounts
      WHERE company_id = NEW.company_id AND partner_contact_id = v_partner AND pallet_type = v_type;
  END IF;

  IF COALESCE(NEW.pallets_delivered,0) > 0 THEN
    INSERT INTO pallet_account_transactions
      (company_id, pallet_account_id, delivery_note_id, direction, quantity, pallet_type, reference, created_by)
    VALUES
      (NEW.company_id, v_account_id, NEW.id, 'out', NEW.pallets_delivered, v_type,
       COALESCE(NEW.note_number, NEW.id::text), NEW.assigned_driver_id);
  END IF;

  IF COALESCE(NEW.pallets_returned,0) > 0 THEN
    INSERT INTO pallet_account_transactions
      (company_id, pallet_account_id, delivery_note_id, direction, quantity, pallet_type, reference, created_by)
    VALUES
      (NEW.company_id, v_account_id, NEW.id, 'in', NEW.pallets_returned, v_type,
       COALESCE(NEW.note_number, NEW.id::text), NEW.assigned_driver_id);
  END IF;

  UPDATE delivery_notes SET pallet_ledger_applied = true WHERE id = NEW.id;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_auto_pallet_ledger_on_delivery ON delivery_notes;
CREATE TRIGGER trg_auto_pallet_ledger_on_delivery
AFTER UPDATE OF status ON delivery_notes
FOR EACH ROW
WHEN (NEW.status IN ('delivered','confirmed'))
EXECUTE FUNCTION auto_pallet_ledger_on_delivery();
