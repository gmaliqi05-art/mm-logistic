/*
  # Create Audit Logs and Stock Alerts tables for Premium features

  1. New Tables
    - `audit_logs`
      - `id` (uuid, primary key)
      - `company_id` (uuid, FK -> companies)
      - `user_id` (uuid, FK -> profiles)
      - `action` (text) - e.g. 'create', 'update', 'delete'
      - `entity_type` (text) - e.g. 'delivery_note', 'stock', 'driver'
      - `entity_id` (uuid, nullable)
      - `details` (jsonb) - additional context
      - `created_at` (timestamptz)
    - `stock_alerts`
      - `id` (uuid, primary key)
      - `company_id` (uuid, FK -> companies)
      - `depot_id` (uuid, FK -> depots)
      - `category_id` (uuid, FK -> product_categories)
      - `alert_type` (text) - 'low_stock', 'out_of_stock', 'damaged_threshold'
      - `threshold` (integer) - trigger value
      - `is_active` (boolean)
      - `last_triggered_at` (timestamptz, nullable)
      - `created_at` / `updated_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - Company admins can manage their own company's data
    - Super admins can view all data

  3. Notes
    - These tables support Premium plan features
    - audit_logs tracks all important actions for compliance
    - stock_alerts enables automated low-stock monitoring
*/

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  user_id uuid NOT NULL REFERENCES profiles(id),
  action text NOT NULL DEFAULT '',
  entity_type text NOT NULL DEFAULT '',
  entity_id uuid,
  details jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_company_id ON audit_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins can view own audit logs"
  ON audit_logs FOR SELECT
  TO authenticated
  USING (company_id = get_user_company_id_safe());

CREATE POLICY "Company admins can insert own audit logs"
  ON audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (company_id = get_user_company_id_safe());

CREATE POLICY "Super admins can view all audit logs"
  ON audit_logs FOR SELECT
  TO authenticated
  USING (is_super_admin_safe());

CREATE TABLE IF NOT EXISTS stock_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  depot_id uuid NOT NULL REFERENCES depots(id),
  category_id uuid NOT NULL REFERENCES product_categories(id),
  alert_type text NOT NULL DEFAULT 'low_stock' CHECK (alert_type IN ('low_stock', 'out_of_stock', 'damaged_threshold')),
  threshold integer NOT NULL DEFAULT 10,
  is_active boolean DEFAULT true,
  last_triggered_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_alerts_company_id ON stock_alerts(company_id);

ALTER TABLE stock_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins can view own stock alerts"
  ON stock_alerts FOR SELECT
  TO authenticated
  USING (company_id = get_user_company_id_safe());

CREATE POLICY "Company admins can insert own stock alerts"
  ON stock_alerts FOR INSERT
  TO authenticated
  WITH CHECK (company_id = get_user_company_id_safe());

CREATE POLICY "Company admins can update own stock alerts"
  ON stock_alerts FOR UPDATE
  TO authenticated
  USING (company_id = get_user_company_id_safe())
  WITH CHECK (company_id = get_user_company_id_safe());

CREATE POLICY "Company admins can delete own stock alerts"
  ON stock_alerts FOR DELETE
  TO authenticated
  USING (company_id = get_user_company_id_safe());

CREATE POLICY "Super admins can view all stock alerts"
  ON stock_alerts FOR SELECT
  TO authenticated
  USING (is_super_admin_safe());
