/*
  # Create Company Features Manual Override System

  1. New Table
    - `company_features`
      - `id` (uuid, primary key)
      - `company_id` (uuid, FK to companies) - which company
      - `feature` (text) - feature name/code
      - `is_enabled` (boolean) - manually enabled/disabled
      - `enabled_by` (uuid, FK to profiles) - super admin who enabled it
      - `enabled_at` (timestamptz) - when it was enabled
      - `notes` (text) - reason for manual override
      - `created_at`, `updated_at` (timestamptz)
      - UNIQUE constraint on (company_id, feature)

  2. Security
    - RLS enabled
    - Company admins can view their own feature overrides (read-only)
    - Super admins can view all and manage all

  3. Purpose
    - Allows super admin to manually grant/revoke specific features for specific companies
    - Overrides plan-based feature access
    - Useful for trials, partnerships, special deals, etc.
    - Audit trail of who enabled what and when
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

-- Helper function to check if user is super admin (reuse existing if available)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_super_admin_safe') THEN
    CREATE OR REPLACE FUNCTION is_super_admin_safe()
    RETURNS boolean
    LANGUAGE sql
    SECURITY DEFINER
    SET search_path = public
    AS $func$
      SELECT EXISTS (
        SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
      );
    $func$;
  END IF;
END $$;

-- Helper function to get user's company_id safely (reuse existing if available)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_user_company_id_safe') THEN
    CREATE OR REPLACE FUNCTION get_user_company_id_safe()
    RETURNS uuid
    LANGUAGE sql
    SECURITY DEFINER
    SET search_path = public
    AS $func$
      SELECT company_id FROM profiles WHERE id = auth.uid() LIMIT 1;
    $func$;
  END IF;
END $$;

-- Company admins can view their own feature overrides (read-only)
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
