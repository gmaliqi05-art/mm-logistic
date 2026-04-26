/*
  # Apliko Company Features Table

  1. Tabela e re
    - `company_features` - për override manual të feature-ve për kompani specifike
  
  2. Security
    - RLS enabled
    - Company admins mund të shohin vetëm features e tyre
    - Super admins mund të menaxhojnë të gjitha
*/

-- Company features manual override table
CREATE TABLE IF NOT EXISTS company_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  feature text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  enabled_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  enabled_at timestamptz DEFAULT now(),
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (company_id, feature)
);

ALTER TABLE company_features ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user is super admin
CREATE OR REPLACE FUNCTION is_super_admin_safe()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
  );
$$;

-- Company admins can view their own feature overrides
CREATE POLICY "Company admins can view own feature overrides"
  ON company_features FOR SELECT
  TO authenticated
  USING (company_id = get_user_company_id_safe());

-- Super admins can view all feature overrides
CREATE POLICY "Super admins can view all feature overrides"
  ON company_features FOR SELECT
  TO authenticated
  USING (is_super_admin_safe());

-- Super admins can insert feature overrides
CREATE POLICY "Super admins can insert feature overrides"
  ON company_features FOR INSERT
  TO authenticated
  WITH CHECK (is_super_admin_safe());

-- Super admins can update feature overrides
CREATE POLICY "Super admins can update feature overrides"
  ON company_features FOR UPDATE
  TO authenticated
  USING (is_super_admin_safe())
  WITH CHECK (is_super_admin_safe());

-- Super admins can delete feature overrides
CREATE POLICY "Super admins can delete feature overrides"
  ON company_features FOR DELETE
  TO authenticated
  USING (is_super_admin_safe());

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_company_features_company_id ON company_features(company_id);
CREATE INDEX IF NOT EXISTS idx_company_features_feature ON company_features(feature);
CREATE INDEX IF NOT EXISTS idx_company_features_enabled ON company_features(is_enabled) WHERE is_enabled = true;
