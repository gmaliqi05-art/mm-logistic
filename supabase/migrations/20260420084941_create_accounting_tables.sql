/*
  # Create Accounting Module Tables

  1. Schema Changes
    - Add 'accountant' to profiles role CHECK constraint

  2. New Tables
    - `acc_contacts` - Business partners (customers/suppliers)
      - `id` (uuid, PK)
      - `company_id` (uuid, FK to companies)
      - `name` (text)
      - `contact_type` (text: customer/supplier/both)
      - `address`, `city`, `postal_code`, `country` (text)
      - `vat_number`, `tax_number` (text)
      - `email`, `phone`, `website` (text)
      - `iban`, `bic`, `bank_name` (text)
      - `payment_days` (int, default 30)
      - `notes` (text)
      - `is_active` (bool)

    - `acc_product_categories` - Product categories for accounting
      - `id`, `company_id`, `name`, `description`, `sort_order`

    - `acc_products` - Product catalog
      - `id`, `company_id`, `name`, `description`, `sku`, `unit`
      - `price_net` (numeric), `vat_rate` (numeric)
      - `category_id` (FK), `image_url` (text)
      - `current_stock` (numeric), `min_stock` (numeric)
      - `is_active` (bool)

    - `acc_bank_accounts` - Company bank accounts
      - `id`, `company_id`, `name`, `iban`, `bic`, `bank_name`
      - `currency` (EUR/CHF), `opening_balance`, `is_default`, `is_active`

    - `acc_invoices` - Outgoing invoices
      - `id`, `company_id`, `created_by`, `contact_id`
      - `invoice_number`, `invoice_date`, `due_date`
      - `status` (draft/sent/paid/partial/overdue/cancelled)
      - `subtotal`, `vat_amount`, `total`, `discount`
      - `currency`, `notes`, `bank_account_id`
      - `invoice_type` (invoice/credit_note/proforma)

    - `acc_invoice_items` - Invoice line items
      - `id`, `invoice_id`, `product_id`, `description`
      - `quantity`, `unit`, `unit_price`, `vat_rate`
      - `line_discount`, `line_total`

    - `acc_purchases` - Incoming purchases
      - `id`, `company_id`, `created_by`, `contact_id`
      - `purchase_number`, `purchase_date`, `due_date`
      - `status` (draft/received/paid/overdue/cancelled)
      - `subtotal`, `vat_amount`, `total`
      - `currency`, `notes`, `external_invoice_number`, `bank_account_id`

    - `acc_purchase_items` - Purchase line items
      - Same structure as invoice items

    - `acc_expense_categories` - Expense categories (hierarchical)
      - `id`, `company_id`, `name`, `description`, `category_type`, `parent_id`

    - `acc_transactions` - Financial journal
      - `id`, `company_id`, `transaction_type` (income/expense/transfer)
      - `category_id`, `contact_id`, `invoice_id`, `purchase_id`
      - `bank_account_id`, `amount`, `currency`, `description`
      - `transaction_date`, `payment_method`, `reference_number`
      - `notes`, `created_by`

    - `acc_stock_movements` - Automatic stock tracking
      - `id`, `company_id`, `product_id`
      - `movement_type` (in/out/adjustment/return)
      - `quantity`, `unit_price`
      - `reference_type` (invoice/purchase/manual), `reference_id`
      - `notes`, `created_by`

    - `acc_delivery_notes` - Accounting delivery notes
      - `id`, `company_id`, `created_by`, `contact_id`
      - `note_number`, `note_date`, `status`
      - `shipping_address`, `notes`, `invoice_id`

    - `acc_delivery_note_items` - Delivery note items
      - `id`, `delivery_note_id`, `product_id`
      - `description`, `quantity`, `unit`, `image_url`

    - `acc_invoice_sequences` - Auto-numbering
      - `id`, `company_id`, `prefix`, `year`, `current_number`

  3. Security
    - RLS enabled on ALL tables
    - Policies: authenticated users can only access their company's data
    - Separate SELECT/INSERT/UPDATE/DELETE policies

  4. Indexes
    - company_id on all tables
    - contact_id, product_id, dates, status fields
*/

-- Step 1: Update profiles role constraint to include 'accountant'
DO $$
BEGIN
  ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
  ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
    CHECK (role = ANY (ARRAY['super_admin'::text, 'company_admin'::text, 'depot_worker'::text, 'driver'::text, 'accountant'::text]));
END $$;

-- Helper function to get user's company_id
CREATE OR REPLACE FUNCTION public.get_my_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM profiles WHERE id = auth.uid();
$$;

-- acc_contacts
CREATE TABLE IF NOT EXISTS acc_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  name text NOT NULL,
  contact_type text NOT NULL DEFAULT 'customer' CHECK (contact_type = ANY(ARRAY['customer','supplier','both'])),
  address text DEFAULT '',
  city text DEFAULT '',
  postal_code text DEFAULT '',
  country text DEFAULT 'DE',
  vat_number text DEFAULT '',
  tax_number text DEFAULT '',
  email text DEFAULT '',
  phone text DEFAULT '',
  website text DEFAULT '',
  iban text DEFAULT '',
  bic text DEFAULT '',
  bank_name text DEFAULT '',
  payment_days int DEFAULT 30,
  notes text DEFAULT '',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE acc_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "acc_contacts_select" ON acc_contacts FOR SELECT TO authenticated
  USING (company_id = get_my_company_id());
CREATE POLICY "acc_contacts_insert" ON acc_contacts FOR INSERT TO authenticated
  WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "acc_contacts_update" ON acc_contacts FOR UPDATE TO authenticated
  USING (company_id = get_my_company_id()) WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "acc_contacts_delete" ON acc_contacts FOR DELETE TO authenticated
  USING (company_id = get_my_company_id());

CREATE INDEX IF NOT EXISTS idx_acc_contacts_company ON acc_contacts(company_id);
CREATE INDEX IF NOT EXISTS idx_acc_contacts_type ON acc_contacts(contact_type);

-- acc_product_categories
CREATE TABLE IF NOT EXISTS acc_product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  name text NOT NULL,
  description text DEFAULT '',
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE acc_product_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "acc_pcat_select" ON acc_product_categories FOR SELECT TO authenticated
  USING (company_id = get_my_company_id());
CREATE POLICY "acc_pcat_insert" ON acc_product_categories FOR INSERT TO authenticated
  WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "acc_pcat_update" ON acc_product_categories FOR UPDATE TO authenticated
  USING (company_id = get_my_company_id()) WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "acc_pcat_delete" ON acc_product_categories FOR DELETE TO authenticated
  USING (company_id = get_my_company_id());

CREATE INDEX IF NOT EXISTS idx_acc_pcat_company ON acc_product_categories(company_id);

-- acc_products
CREATE TABLE IF NOT EXISTS acc_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  name text NOT NULL,
  description text DEFAULT '',
  sku text DEFAULT '',
  unit text DEFAULT 'pcs' CHECK (unit = ANY(ARRAY['pcs','kg','liter','hour','meter','package','set'])),
  price_net numeric(12,2) DEFAULT 0,
  vat_rate numeric(5,2) DEFAULT 19.00 CHECK (vat_rate = ANY(ARRAY[0.00, 7.00, 19.00])),
  category_id uuid REFERENCES acc_product_categories(id),
  image_url text DEFAULT '',
  current_stock numeric(12,2) DEFAULT 0,
  min_stock numeric(12,2) DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE acc_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "acc_products_select" ON acc_products FOR SELECT TO authenticated
  USING (company_id = get_my_company_id());
CREATE POLICY "acc_products_insert" ON acc_products FOR INSERT TO authenticated
  WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "acc_products_update" ON acc_products FOR UPDATE TO authenticated
  USING (company_id = get_my_company_id()) WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "acc_products_delete" ON acc_products FOR DELETE TO authenticated
  USING (company_id = get_my_company_id());

CREATE INDEX IF NOT EXISTS idx_acc_products_company ON acc_products(company_id);
CREATE INDEX IF NOT EXISTS idx_acc_products_category ON acc_products(category_id);
CREATE INDEX IF NOT EXISTS idx_acc_products_sku ON acc_products(company_id, sku);

-- acc_bank_accounts
CREATE TABLE IF NOT EXISTS acc_bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  name text NOT NULL,
  iban text DEFAULT '',
  bic text DEFAULT '',
  bank_name text DEFAULT '',
  currency text DEFAULT 'EUR' CHECK (currency = ANY(ARRAY['EUR','CHF'])),
  opening_balance numeric(12,2) DEFAULT 0,
  is_default boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE acc_bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "acc_bank_select" ON acc_bank_accounts FOR SELECT TO authenticated
  USING (company_id = get_my_company_id());
CREATE POLICY "acc_bank_insert" ON acc_bank_accounts FOR INSERT TO authenticated
  WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "acc_bank_update" ON acc_bank_accounts FOR UPDATE TO authenticated
  USING (company_id = get_my_company_id()) WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "acc_bank_delete" ON acc_bank_accounts FOR DELETE TO authenticated
  USING (company_id = get_my_company_id());

CREATE INDEX IF NOT EXISTS idx_acc_bank_company ON acc_bank_accounts(company_id);

-- acc_invoices
CREATE TABLE IF NOT EXISTS acc_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  created_by uuid NOT NULL REFERENCES profiles(id),
  contact_id uuid REFERENCES acc_contacts(id),
  invoice_number text NOT NULL DEFAULT '',
  invoice_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  status text NOT NULL DEFAULT 'draft' CHECK (status = ANY(ARRAY['draft','sent','paid','partial','overdue','cancelled'])),
  subtotal numeric(12,2) DEFAULT 0,
  vat_amount numeric(12,2) DEFAULT 0,
  total numeric(12,2) DEFAULT 0,
  discount numeric(12,2) DEFAULT 0,
  currency text DEFAULT 'EUR' CHECK (currency = ANY(ARRAY['EUR','CHF'])),
  notes text DEFAULT '',
  bank_account_id uuid REFERENCES acc_bank_accounts(id),
  invoice_type text DEFAULT 'invoice' CHECK (invoice_type = ANY(ARRAY['invoice','credit_note','proforma'])),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE acc_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "acc_inv_select" ON acc_invoices FOR SELECT TO authenticated
  USING (company_id = get_my_company_id());
CREATE POLICY "acc_inv_insert" ON acc_invoices FOR INSERT TO authenticated
  WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "acc_inv_update" ON acc_invoices FOR UPDATE TO authenticated
  USING (company_id = get_my_company_id()) WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "acc_inv_delete" ON acc_invoices FOR DELETE TO authenticated
  USING (company_id = get_my_company_id());

CREATE INDEX IF NOT EXISTS idx_acc_inv_company ON acc_invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_acc_inv_contact ON acc_invoices(contact_id);
CREATE INDEX IF NOT EXISTS idx_acc_inv_status ON acc_invoices(status);
CREATE INDEX IF NOT EXISTS idx_acc_inv_date ON acc_invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_acc_inv_number ON acc_invoices(company_id, invoice_number);

-- acc_invoice_items
CREATE TABLE IF NOT EXISTS acc_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES acc_invoices(id) ON DELETE CASCADE,
  product_id uuid REFERENCES acc_products(id),
  description text DEFAULT '',
  quantity numeric(12,2) DEFAULT 1,
  unit text DEFAULT 'pcs',
  unit_price numeric(12,2) DEFAULT 0,
  vat_rate numeric(5,2) DEFAULT 19.00,
  line_discount numeric(12,2) DEFAULT 0,
  line_total numeric(12,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE acc_invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "acc_inv_items_select" ON acc_invoice_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM acc_invoices i WHERE i.id = invoice_id AND i.company_id = get_my_company_id()));
CREATE POLICY "acc_inv_items_insert" ON acc_invoice_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM acc_invoices i WHERE i.id = invoice_id AND i.company_id = get_my_company_id()));
CREATE POLICY "acc_inv_items_update" ON acc_invoice_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM acc_invoices i WHERE i.id = invoice_id AND i.company_id = get_my_company_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM acc_invoices i WHERE i.id = invoice_id AND i.company_id = get_my_company_id()));
CREATE POLICY "acc_inv_items_delete" ON acc_invoice_items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM acc_invoices i WHERE i.id = invoice_id AND i.company_id = get_my_company_id()));

CREATE INDEX IF NOT EXISTS idx_acc_inv_items_invoice ON acc_invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_acc_inv_items_product ON acc_invoice_items(product_id);

-- acc_purchases
CREATE TABLE IF NOT EXISTS acc_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  created_by uuid NOT NULL REFERENCES profiles(id),
  contact_id uuid REFERENCES acc_contacts(id),
  purchase_number text NOT NULL DEFAULT '',
  purchase_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  status text NOT NULL DEFAULT 'draft' CHECK (status = ANY(ARRAY['draft','received','paid','overdue','cancelled'])),
  subtotal numeric(12,2) DEFAULT 0,
  vat_amount numeric(12,2) DEFAULT 0,
  total numeric(12,2) DEFAULT 0,
  currency text DEFAULT 'EUR' CHECK (currency = ANY(ARRAY['EUR','CHF'])),
  notes text DEFAULT '',
  external_invoice_number text DEFAULT '',
  bank_account_id uuid REFERENCES acc_bank_accounts(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE acc_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "acc_pur_select" ON acc_purchases FOR SELECT TO authenticated
  USING (company_id = get_my_company_id());
CREATE POLICY "acc_pur_insert" ON acc_purchases FOR INSERT TO authenticated
  WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "acc_pur_update" ON acc_purchases FOR UPDATE TO authenticated
  USING (company_id = get_my_company_id()) WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "acc_pur_delete" ON acc_purchases FOR DELETE TO authenticated
  USING (company_id = get_my_company_id());

CREATE INDEX IF NOT EXISTS idx_acc_pur_company ON acc_purchases(company_id);
CREATE INDEX IF NOT EXISTS idx_acc_pur_contact ON acc_purchases(contact_id);
CREATE INDEX IF NOT EXISTS idx_acc_pur_status ON acc_purchases(status);
CREATE INDEX IF NOT EXISTS idx_acc_pur_date ON acc_purchases(purchase_date);

-- acc_purchase_items
CREATE TABLE IF NOT EXISTS acc_purchase_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES acc_purchases(id) ON DELETE CASCADE,
  product_id uuid REFERENCES acc_products(id),
  description text DEFAULT '',
  quantity numeric(12,2) DEFAULT 1,
  unit text DEFAULT 'pcs',
  unit_price numeric(12,2) DEFAULT 0,
  vat_rate numeric(5,2) DEFAULT 19.00,
  line_total numeric(12,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE acc_purchase_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "acc_pur_items_select" ON acc_purchase_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM acc_purchases p WHERE p.id = purchase_id AND p.company_id = get_my_company_id()));
CREATE POLICY "acc_pur_items_insert" ON acc_purchase_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM acc_purchases p WHERE p.id = purchase_id AND p.company_id = get_my_company_id()));
CREATE POLICY "acc_pur_items_update" ON acc_purchase_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM acc_purchases p WHERE p.id = purchase_id AND p.company_id = get_my_company_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM acc_purchases p WHERE p.id = purchase_id AND p.company_id = get_my_company_id()));
CREATE POLICY "acc_pur_items_delete" ON acc_purchase_items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM acc_purchases p WHERE p.id = purchase_id AND p.company_id = get_my_company_id()));

CREATE INDEX IF NOT EXISTS idx_acc_pur_items_purchase ON acc_purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS idx_acc_pur_items_product ON acc_purchase_items(product_id);

-- acc_expense_categories
CREATE TABLE IF NOT EXISTS acc_expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  name text NOT NULL,
  description text DEFAULT '',
  category_type text DEFAULT 'expense' CHECK (category_type = ANY(ARRAY['income','expense','other'])),
  parent_id uuid REFERENCES acc_expense_categories(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE acc_expense_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "acc_ecat_select" ON acc_expense_categories FOR SELECT TO authenticated
  USING (company_id = get_my_company_id());
CREATE POLICY "acc_ecat_insert" ON acc_expense_categories FOR INSERT TO authenticated
  WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "acc_ecat_update" ON acc_expense_categories FOR UPDATE TO authenticated
  USING (company_id = get_my_company_id()) WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "acc_ecat_delete" ON acc_expense_categories FOR DELETE TO authenticated
  USING (company_id = get_my_company_id());

CREATE INDEX IF NOT EXISTS idx_acc_ecat_company ON acc_expense_categories(company_id);

-- acc_transactions
CREATE TABLE IF NOT EXISTS acc_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  transaction_type text NOT NULL CHECK (transaction_type = ANY(ARRAY['income','expense','transfer'])),
  category_id uuid REFERENCES acc_expense_categories(id),
  contact_id uuid REFERENCES acc_contacts(id),
  invoice_id uuid REFERENCES acc_invoices(id),
  purchase_id uuid REFERENCES acc_purchases(id),
  bank_account_id uuid REFERENCES acc_bank_accounts(id),
  amount numeric(12,2) NOT NULL DEFAULT 0,
  currency text DEFAULT 'EUR',
  description text DEFAULT '',
  transaction_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_method text DEFAULT '' CHECK (payment_method = ANY(ARRAY['','bank_transfer','cash','card','paypal','other'])),
  reference_number text DEFAULT '',
  notes text DEFAULT '',
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE acc_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "acc_txn_select" ON acc_transactions FOR SELECT TO authenticated
  USING (company_id = get_my_company_id());
CREATE POLICY "acc_txn_insert" ON acc_transactions FOR INSERT TO authenticated
  WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "acc_txn_update" ON acc_transactions FOR UPDATE TO authenticated
  USING (company_id = get_my_company_id()) WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "acc_txn_delete" ON acc_transactions FOR DELETE TO authenticated
  USING (company_id = get_my_company_id());

CREATE INDEX IF NOT EXISTS idx_acc_txn_company ON acc_transactions(company_id);
CREATE INDEX IF NOT EXISTS idx_acc_txn_date ON acc_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_acc_txn_type ON acc_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_acc_txn_invoice ON acc_transactions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_acc_txn_purchase ON acc_transactions(purchase_id);

-- acc_stock_movements
CREATE TABLE IF NOT EXISTS acc_stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  product_id uuid NOT NULL REFERENCES acc_products(id),
  movement_type text NOT NULL CHECK (movement_type = ANY(ARRAY['in','out','adjustment','return'])),
  quantity numeric(12,2) NOT NULL DEFAULT 0,
  unit_price numeric(12,2) DEFAULT 0,
  reference_type text DEFAULT '' CHECK (reference_type = ANY(ARRAY['','invoice','purchase','manual','credit_note'])),
  reference_id uuid,
  notes text DEFAULT '',
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE acc_stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "acc_sm_select" ON acc_stock_movements FOR SELECT TO authenticated
  USING (company_id = get_my_company_id());
CREATE POLICY "acc_sm_insert" ON acc_stock_movements FOR INSERT TO authenticated
  WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "acc_sm_update" ON acc_stock_movements FOR UPDATE TO authenticated
  USING (company_id = get_my_company_id()) WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "acc_sm_delete" ON acc_stock_movements FOR DELETE TO authenticated
  USING (company_id = get_my_company_id());

CREATE INDEX IF NOT EXISTS idx_acc_sm_company ON acc_stock_movements(company_id);
CREATE INDEX IF NOT EXISTS idx_acc_sm_product ON acc_stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_acc_sm_type ON acc_stock_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_acc_sm_ref ON acc_stock_movements(reference_type, reference_id);

-- acc_delivery_notes
CREATE TABLE IF NOT EXISTS acc_delivery_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  created_by uuid NOT NULL REFERENCES profiles(id),
  contact_id uuid REFERENCES acc_contacts(id),
  note_number text NOT NULL DEFAULT '',
  note_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'draft' CHECK (status = ANY(ARRAY['draft','sent','in_transit','delivered','confirmed'])),
  shipping_address text DEFAULT '',
  notes text DEFAULT '',
  invoice_id uuid REFERENCES acc_invoices(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE acc_delivery_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "acc_dn_select" ON acc_delivery_notes FOR SELECT TO authenticated
  USING (company_id = get_my_company_id());
CREATE POLICY "acc_dn_insert" ON acc_delivery_notes FOR INSERT TO authenticated
  WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "acc_dn_update" ON acc_delivery_notes FOR UPDATE TO authenticated
  USING (company_id = get_my_company_id()) WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "acc_dn_delete" ON acc_delivery_notes FOR DELETE TO authenticated
  USING (company_id = get_my_company_id());

CREATE INDEX IF NOT EXISTS idx_acc_dn_company ON acc_delivery_notes(company_id);
CREATE INDEX IF NOT EXISTS idx_acc_dn_contact ON acc_delivery_notes(contact_id);

-- acc_delivery_note_items
CREATE TABLE IF NOT EXISTS acc_delivery_note_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_note_id uuid NOT NULL REFERENCES acc_delivery_notes(id) ON DELETE CASCADE,
  product_id uuid REFERENCES acc_products(id),
  description text DEFAULT '',
  quantity numeric(12,2) DEFAULT 1,
  unit text DEFAULT 'pcs',
  image_url text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE acc_delivery_note_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "acc_dni_select" ON acc_delivery_note_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM acc_delivery_notes d WHERE d.id = delivery_note_id AND d.company_id = get_my_company_id()));
CREATE POLICY "acc_dni_insert" ON acc_delivery_note_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM acc_delivery_notes d WHERE d.id = delivery_note_id AND d.company_id = get_my_company_id()));
CREATE POLICY "acc_dni_update" ON acc_delivery_note_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM acc_delivery_notes d WHERE d.id = delivery_note_id AND d.company_id = get_my_company_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM acc_delivery_notes d WHERE d.id = delivery_note_id AND d.company_id = get_my_company_id()));
CREATE POLICY "acc_dni_delete" ON acc_delivery_note_items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM acc_delivery_notes d WHERE d.id = delivery_note_id AND d.company_id = get_my_company_id()));

CREATE INDEX IF NOT EXISTS idx_acc_dni_dn ON acc_delivery_note_items(delivery_note_id);

-- acc_invoice_sequences
CREATE TABLE IF NOT EXISTS acc_invoice_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  prefix text NOT NULL DEFAULT 'RE',
  year int NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::int,
  current_number int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(company_id, prefix, year)
);

ALTER TABLE acc_invoice_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "acc_seq_select" ON acc_invoice_sequences FOR SELECT TO authenticated
  USING (company_id = get_my_company_id());
CREATE POLICY "acc_seq_insert" ON acc_invoice_sequences FOR INSERT TO authenticated
  WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "acc_seq_update" ON acc_invoice_sequences FOR UPDATE TO authenticated
  USING (company_id = get_my_company_id()) WITH CHECK (company_id = get_my_company_id());

CREATE INDEX IF NOT EXISTS idx_acc_seq_company ON acc_invoice_sequences(company_id);

-- Function to get next invoice number
CREATE OR REPLACE FUNCTION get_next_acc_number(p_company_id uuid, p_prefix text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year int := EXTRACT(YEAR FROM CURRENT_DATE)::int;
  v_num int;
BEGIN
  INSERT INTO acc_invoice_sequences (company_id, prefix, year, current_number)
  VALUES (p_company_id, p_prefix, v_year, 1)
  ON CONFLICT (company_id, prefix, year)
  DO UPDATE SET current_number = acc_invoice_sequences.current_number + 1
  RETURNING current_number INTO v_num;

  RETURN p_prefix || '-' || v_year || '-' || LPAD(v_num::text, 4, '0');
END;
$$;

-- Storage policies for product images
DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('product-images', 'product-images', true)
  ON CONFLICT (id) DO NOTHING;
END $$;

CREATE POLICY "product_images_read" ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'product-images');

CREATE POLICY "product_images_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-images');

CREATE POLICY "product_images_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'product-images');

CREATE POLICY "product_images_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'product-images');
