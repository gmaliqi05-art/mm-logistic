/*
  # Chart of Accounts (COA) Template System

  1. New Tables
    - `coa_templates`: holds named templates (SKR03, EKR, PCG, PKL, KOSCOA, etc.) per country
      - id, country_code, template_code, name, description, language, is_default, created_at
    - `coa_template_accounts`: individual account rows per template
      - id, template_id, account_code, account_name, account_type, parent_code, vat_relevance, sort_order
    - `company_chart_of_accounts`: per-company COA instance (seeded from a template at registration)
      - id, company_id, account_code, account_name, account_type, parent_code, vat_relevance,
        is_active, source_template_id, sort_order, created_at, updated_at

  2. Indexes
    - unique (country_code, template_code) on templates
    - unique (template_id, account_code) on template accounts
    - unique (company_id, account_code) on company COA

  3. Security
    - Enable RLS on all three tables
    - Templates and template accounts are readable by all authenticated users (reference data)
    - company_chart_of_accounts: full CRUD for members of the same company
*/

CREATE TABLE IF NOT EXISTS coa_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text NOT NULL,
  template_code text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  language text NOT NULL DEFAULT 'en',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS coa_templates_country_code_unique
  ON coa_templates (country_code, template_code);

CREATE INDEX IF NOT EXISTS coa_templates_default_idx
  ON coa_templates (country_code, is_default);

CREATE TABLE IF NOT EXISTS coa_template_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES coa_templates(id) ON DELETE CASCADE,
  account_code text NOT NULL,
  account_name text NOT NULL,
  account_type text NOT NULL CHECK (account_type IN ('asset','liability','equity','income','expense','contra')),
  parent_code text,
  vat_relevance text NOT NULL DEFAULT 'none',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS coa_template_accounts_unique
  ON coa_template_accounts (template_id, account_code);

CREATE INDEX IF NOT EXISTS coa_template_accounts_template_idx
  ON coa_template_accounts (template_id, sort_order);

CREATE TABLE IF NOT EXISTS company_chart_of_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  account_code text NOT NULL,
  account_name text NOT NULL,
  account_type text NOT NULL CHECK (account_type IN ('asset','liability','equity','income','expense','contra')),
  parent_code text,
  vat_relevance text NOT NULL DEFAULT 'none',
  is_active boolean NOT NULL DEFAULT true,
  source_template_id uuid REFERENCES coa_templates(id) ON DELETE SET NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS company_coa_unique
  ON company_chart_of_accounts (company_id, account_code);

CREATE INDEX IF NOT EXISTS company_coa_company_idx
  ON company_chart_of_accounts (company_id, sort_order);

ALTER TABLE coa_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE coa_template_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_chart_of_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read COA templates" ON coa_templates;
CREATE POLICY "Authenticated can read COA templates"
  ON coa_templates FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated can read COA template accounts" ON coa_template_accounts;
CREATE POLICY "Authenticated can read COA template accounts"
  ON coa_template_accounts FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Company members read own COA" ON company_chart_of_accounts;
CREATE POLICY "Company members read own COA"
  ON company_chart_of_accounts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.company_id = company_chart_of_accounts.company_id
    )
  );

DROP POLICY IF EXISTS "Company admins insert COA" ON company_chart_of_accounts;
CREATE POLICY "Company admins insert COA"
  ON company_chart_of_accounts FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.company_id = company_chart_of_accounts.company_id
        AND p.role IN ('company_admin','accountant')
    )
  );

DROP POLICY IF EXISTS "Company admins update COA" ON company_chart_of_accounts;
CREATE POLICY "Company admins update COA"
  ON company_chart_of_accounts FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.company_id = company_chart_of_accounts.company_id
        AND p.role IN ('company_admin','accountant')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.company_id = company_chart_of_accounts.company_id
        AND p.role IN ('company_admin','accountant')
    )
  );

DROP POLICY IF EXISTS "Company admins delete COA" ON company_chart_of_accounts;
CREATE POLICY "Company admins delete COA"
  ON company_chart_of_accounts FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.company_id = company_chart_of_accounts.company_id
        AND p.role IN ('company_admin','accountant')
    )
  );

CREATE OR REPLACE FUNCTION seed_company_coa(p_company_id uuid, p_country_code text)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_template_id uuid;
  v_count int;
BEGIN
  SELECT id INTO v_template_id
  FROM coa_templates
  WHERE upper(country_code) = upper(p_country_code)
    AND is_default = true
  LIMIT 1;

  IF v_template_id IS NULL THEN
    RETURN 0;
  END IF;

  INSERT INTO company_chart_of_accounts (
    company_id, account_code, account_name, account_type, parent_code,
    vat_relevance, source_template_id, sort_order
  )
  SELECT
    p_company_id, a.account_code, a.account_name, a.account_type, a.parent_code,
    a.vat_relevance, a.template_id, a.sort_order
  FROM coa_template_accounts a
  WHERE a.template_id = v_template_id
  ON CONFLICT (company_id, account_code) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION seed_company_coa(uuid, text) TO service_role;
