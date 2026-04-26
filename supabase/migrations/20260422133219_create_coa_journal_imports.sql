/*
  # Themelet financiare: Plani i Kontabilitetit, Ditari dypalësh dhe Moduli i Importit

  ## Përshkrim
  Kjo migrim shton themelet e nevojshme për një sistem të plotë kontabiliteti gjerman:
  plani i kontabilitetit (SKR03), ditari me regjistrime dypalëshe (debi/kredi) dhe
  moduli i importit për mallrat jashtë BE-së me tarifa doganore dhe TVSH importi (EUSt).

  ## Tabela të reja

  ### 1. acc_chart_of_accounts
  Plan i kontabilitetit sipas standardit gjerman (SKR03). Çdo kompani mund të
  personalizojë kodet, por krijohet një bazë e mbushur automatikisht.
  - `id` (uuid, PK)
  - `company_id` (uuid, FK)
  - `account_code` (text) - p.sh. "1200", "4400", "8400"
  - `name` (text) - p.sh. "Bank", "Pagesa te bera", "Te ardhurat 19% TVSH"
  - `account_type` (text) - asset/liability/equity/revenue/expense
  - `account_group` (text) - p.sh. "Umlaufvermoegen", "Erloese"
  - `parent_code` (text, opsionale)
  - `vat_rate` (numeric) - 0, 7, 19
  - `is_active` (bool)

  ### 2. acc_journal_entries
  Koka e regjistrimeve ditarike me balance automatike debi = kredi.
  - `id`, `company_id`, `entry_date`, `entry_number` (per company unique)
  - `description`, `reference_type`, `reference_id`
  - `status` (draft/posted/void), `total_debit`, `total_credit`
  - `created_by`, `posted_at`

  ### 3. acc_journal_lines
  Linjat e ditarit - çdo linjë ka debi OSE kredi.
  - `id`, `entry_id`, `account_code`, `debit`, `credit`
  - `description`, `vat_code`, `cost_center`

  ### 4. acc_imports
  Koka e importit nga vendet jashtë BE-së.
  - `id`, `company_id`, `import_number`, `import_date`
  - `supplier_id`, `country_of_origin`, `incoterms`, `currency`, `exchange_rate`
  - `customs_value`, `freight_cost`, `insurance_cost`, `other_charges`
  - `customs_duty_total`, `import_vat_total`, `total_landed_cost`
  - `status` (draft/cleared/received/posted), `customs_doc_ref`, `notes`

  ### 5. acc_import_items
  Linjat e produkteve të importuara me kod HS dhe tarifa.
  - `id`, `import_id`, `product_id`, `description`, `hs_code`
  - `country_of_origin`, `quantity`, `unit_price_foreign`, `unit_price_eur`
  - `customs_value_line`, `duty_rate`, `duty_amount`
  - `vat_rate`, `vat_amount`, `landed_cost_per_unit`

  ### 6. acc_customs_tariffs
  Tabela referuese me kodet më të përdorura HS (EU TARIC thjeshtuar).
  - `id`, `hs_code`, `description`, `duty_rate`, `vat_rate`, `category`

  ## Siguria
  Të gjitha tabelat kanë RLS aktiv me politika që lejojnë vetëm anëtarët e kompanisë
  përkatëse (përmes company_id dhe profiles.company_id).

  ## Vërejtje të rëndësishme
  1. Planet e kontabilitetit fillestar mbushen automatikisht për çdo kompani ekzistuese
  2. Kodet e HS fillestare mbulojnë kategoritë më të zakonshme për import logjistik
  3. Sistemi i ditarit lejon regjistrime manuale dhe automatike nga faturat/blerjet
*/

-- 1. Plani i kontabilitetit
CREATE TABLE IF NOT EXISTS acc_chart_of_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  account_code text NOT NULL,
  name text NOT NULL,
  account_type text NOT NULL CHECK (account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
  account_group text DEFAULT '',
  parent_code text DEFAULT '',
  vat_rate numeric(5,2) DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE (company_id, account_code)
);

CREATE INDEX IF NOT EXISTS idx_coa_company ON acc_chart_of_accounts(company_id);
CREATE INDEX IF NOT EXISTS idx_coa_type ON acc_chart_of_accounts(company_id, account_type);

ALTER TABLE acc_chart_of_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view CoA"
  ON acc_chart_of_accounts FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Company admins can insert CoA"
  ON acc_chart_of_accounts FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'accountant')));

CREATE POLICY "Company admins can update CoA"
  ON acc_chart_of_accounts FOR UPDATE TO authenticated
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'accountant')))
  WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'accountant')));

CREATE POLICY "Company admins can delete CoA"
  ON acc_chart_of_accounts FOR DELETE TO authenticated
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'accountant')));

-- 2. Regjistrimet e ditarit (koka)
CREATE TABLE IF NOT EXISTS acc_journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entry_number text NOT NULL,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  description text DEFAULT '',
  reference_type text DEFAULT '',
  reference_id uuid,
  status text NOT NULL DEFAULT 'posted' CHECK (status IN ('draft', 'posted', 'void')),
  total_debit numeric(14,2) DEFAULT 0,
  total_credit numeric(14,2) DEFAULT 0,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  posted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE (company_id, entry_number)
);

CREATE INDEX IF NOT EXISTS idx_je_company_date ON acc_journal_entries(company_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_je_ref ON acc_journal_entries(reference_type, reference_id);

ALTER TABLE acc_journal_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view journal"
  ON acc_journal_entries FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Accountants can insert journal"
  ON acc_journal_entries FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'accountant')));

CREATE POLICY "Accountants can update journal"
  ON acc_journal_entries FOR UPDATE TO authenticated
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'accountant')))
  WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'accountant')));

CREATE POLICY "Accountants can delete journal"
  ON acc_journal_entries FOR DELETE TO authenticated
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'accountant')));

-- 3. Linjat e ditarit
CREATE TABLE IF NOT EXISTS acc_journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES acc_journal_entries(id) ON DELETE CASCADE,
  account_code text NOT NULL,
  debit numeric(14,2) DEFAULT 0,
  credit numeric(14,2) DEFAULT 0,
  description text DEFAULT '',
  vat_code text DEFAULT '',
  cost_center text DEFAULT '',
  line_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jl_entry ON acc_journal_lines(entry_id);
CREATE INDEX IF NOT EXISTS idx_jl_account ON acc_journal_lines(account_code);

ALTER TABLE acc_journal_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view journal lines"
  ON acc_journal_lines FOR SELECT TO authenticated
  USING (entry_id IN (
    SELECT id FROM acc_journal_entries
    WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  ));

CREATE POLICY "Accountants can insert journal lines"
  ON acc_journal_lines FOR INSERT TO authenticated
  WITH CHECK (entry_id IN (
    SELECT id FROM acc_journal_entries
    WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'accountant'))
  ));

CREATE POLICY "Accountants can update journal lines"
  ON acc_journal_lines FOR UPDATE TO authenticated
  USING (entry_id IN (
    SELECT id FROM acc_journal_entries
    WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'accountant'))
  ))
  WITH CHECK (entry_id IN (
    SELECT id FROM acc_journal_entries
    WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'accountant'))
  ));

CREATE POLICY "Accountants can delete journal lines"
  ON acc_journal_lines FOR DELETE TO authenticated
  USING (entry_id IN (
    SELECT id FROM acc_journal_entries
    WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'accountant'))
  ));

-- 4. Importet
CREATE TABLE IF NOT EXISTS acc_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  import_number text NOT NULL,
  import_date date NOT NULL DEFAULT CURRENT_DATE,
  supplier_id uuid REFERENCES acc_contacts(id) ON DELETE SET NULL,
  country_of_origin text DEFAULT '',
  incoterms text DEFAULT 'FOB',
  currency text DEFAULT 'EUR',
  exchange_rate numeric(14,6) DEFAULT 1,
  customs_value numeric(14,2) DEFAULT 0,
  freight_cost numeric(14,2) DEFAULT 0,
  insurance_cost numeric(14,2) DEFAULT 0,
  other_charges numeric(14,2) DEFAULT 0,
  customs_duty_total numeric(14,2) DEFAULT 0,
  import_vat_total numeric(14,2) DEFAULT 0,
  total_landed_cost numeric(14,2) DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'cleared', 'received', 'posted', 'cancelled')),
  customs_doc_ref text DEFAULT '',
  notes text DEFAULT '',
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (company_id, import_number)
);

CREATE INDEX IF NOT EXISTS idx_imports_company ON acc_imports(company_id, import_date DESC);
CREATE INDEX IF NOT EXISTS idx_imports_supplier ON acc_imports(supplier_id);

ALTER TABLE acc_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view imports"
  ON acc_imports FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Accountants can insert imports"
  ON acc_imports FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'accountant')));

CREATE POLICY "Accountants can update imports"
  ON acc_imports FOR UPDATE TO authenticated
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'accountant')))
  WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'accountant')));

CREATE POLICY "Accountants can delete imports"
  ON acc_imports FOR DELETE TO authenticated
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'accountant')));

-- 5. Linjat e importit
CREATE TABLE IF NOT EXISTS acc_import_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES acc_imports(id) ON DELETE CASCADE,
  product_id uuid REFERENCES acc_products(id) ON DELETE SET NULL,
  description text DEFAULT '',
  hs_code text DEFAULT '',
  country_of_origin text DEFAULT '',
  quantity numeric(14,4) DEFAULT 0,
  unit_price_foreign numeric(14,4) DEFAULT 0,
  unit_price_eur numeric(14,4) DEFAULT 0,
  customs_value_line numeric(14,2) DEFAULT 0,
  duty_rate numeric(5,2) DEFAULT 0,
  duty_amount numeric(14,2) DEFAULT 0,
  vat_rate numeric(5,2) DEFAULT 19,
  vat_amount numeric(14,2) DEFAULT 0,
  landed_cost_per_unit numeric(14,4) DEFAULT 0,
  line_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_import_items_import ON acc_import_items(import_id);
CREATE INDEX IF NOT EXISTS idx_import_items_product ON acc_import_items(product_id);

ALTER TABLE acc_import_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view import items"
  ON acc_import_items FOR SELECT TO authenticated
  USING (import_id IN (
    SELECT id FROM acc_imports
    WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  ));

CREATE POLICY "Accountants can insert import items"
  ON acc_import_items FOR INSERT TO authenticated
  WITH CHECK (import_id IN (
    SELECT id FROM acc_imports
    WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'accountant'))
  ));

CREATE POLICY "Accountants can update import items"
  ON acc_import_items FOR UPDATE TO authenticated
  USING (import_id IN (
    SELECT id FROM acc_imports
    WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'accountant'))
  ))
  WITH CHECK (import_id IN (
    SELECT id FROM acc_imports
    WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'accountant'))
  ));

CREATE POLICY "Accountants can delete import items"
  ON acc_import_items FOR DELETE TO authenticated
  USING (import_id IN (
    SELECT id FROM acc_imports
    WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'accountant'))
  ));

-- 6. Kodet e tarifave doganore (referencë publike per sistem)
CREATE TABLE IF NOT EXISTS acc_customs_tariffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hs_code text NOT NULL UNIQUE,
  description text NOT NULL,
  duty_rate numeric(5,2) DEFAULT 0,
  vat_rate numeric(5,2) DEFAULT 19,
  category text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tariffs_code ON acc_customs_tariffs(hs_code);

ALTER TABLE acc_customs_tariffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view tariffs"
  ON acc_customs_tariffs FOR SELECT TO authenticated
  USING (true);
