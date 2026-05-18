/*
  # Create client-specific pricing and invoice reminder tracking

  1. New Tables
    - `acc_client_prices`
      - `id` (uuid, primary key)
      - `company_id` (uuid, FK to companies)
      - `contact_id` (uuid, FK to acc_contacts)
      - `product_id` (uuid) - references acc_products or category_products
      - `product_source` (text) - 'accounting' or 'stock'
      - `custom_price_net` (numeric 12,2) - the custom price for this client
      - `currency` (text, default 'EUR')
      - `notes` (text, nullable)
      - `is_active` (boolean, default true)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
      - UNIQUE constraint on (company_id, contact_id, product_id, product_source)

    - `acc_invoice_reminders`
      - `id` (uuid, primary key)
      - `invoice_id` (uuid, FK to acc_invoices)
      - `reminder_level` (int) - 0=due day, 1=+7days, 2=+14days
      - `sent_at` (timestamptz)
      - `email_delivery_id` (uuid, nullable)
      - `created_at` (timestamptz)
      - UNIQUE constraint on (invoice_id, reminder_level)

  2. Security
    - RLS enabled on both tables
    - acc_client_prices: company members can read/write own company data
    - acc_invoice_reminders: company members can read own company reminders

  3. Indexes
    - (contact_id, product_id, product_source) for fast price lookup
    - (invoice_id) for fast reminder lookup
*/

-- acc_client_prices
CREATE TABLE IF NOT EXISTS acc_client_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES acc_contacts(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  product_source text NOT NULL DEFAULT 'accounting' CHECK (product_source IN ('accounting', 'stock')),
  custom_price_net numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'EUR',
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, contact_id, product_id, product_source)
);

ALTER TABLE acc_client_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view client prices"
  ON acc_client_prices FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Company admins can insert client prices"
  ON acc_client_prices FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
        AND role IN ('company_admin', 'accountant', 'logistics_admin')
    )
  );

CREATE POLICY "Company admins can update client prices"
  ON acc_client_prices FOR UPDATE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
        AND role IN ('company_admin', 'accountant', 'logistics_admin')
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
        AND role IN ('company_admin', 'accountant', 'logistics_admin')
    )
  );

CREATE POLICY "Company admins can delete client prices"
  ON acc_client_prices FOR DELETE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
        AND role IN ('company_admin', 'accountant', 'logistics_admin')
    )
  );

CREATE INDEX IF NOT EXISTS idx_acc_client_prices_lookup
  ON acc_client_prices (contact_id, product_id, product_source)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_acc_client_prices_company
  ON acc_client_prices (company_id);

-- acc_invoice_reminders
CREATE TABLE IF NOT EXISTS acc_invoice_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES acc_invoices(id) ON DELETE CASCADE,
  reminder_level int NOT NULL DEFAULT 0 CHECK (reminder_level IN (0, 1, 2)),
  sent_at timestamptz NOT NULL DEFAULT now(),
  email_delivery_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invoice_id, reminder_level)
);

ALTER TABLE acc_invoice_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view invoice reminders"
  ON acc_invoice_reminders FOR SELECT
  TO authenticated
  USING (
    invoice_id IN (
      SELECT i.id FROM acc_invoices i
      WHERE i.company_id IN (
        SELECT company_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "System can insert invoice reminders"
  ON acc_invoice_reminders FOR INSERT
  TO authenticated
  WITH CHECK (
    invoice_id IN (
      SELECT i.id FROM acc_invoices i
      WHERE i.company_id IN (
        SELECT company_id FROM profiles WHERE id = auth.uid()
          AND role IN ('company_admin', 'accountant', 'logistics_admin')
      )
    )
  );

CREATE INDEX IF NOT EXISTS idx_acc_invoice_reminders_invoice
  ON acc_invoice_reminders (invoice_id);
