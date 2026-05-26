/*
  # Admin Subscription Actions Log

  1. New Tables
    - `admin_subscription_actions`
      - `id` (uuid, primary key)
      - `admin_id` (uuid, FK to profiles) - the super admin who performed the action
      - `company_id` (uuid, FK to companies) - the target company
      - `subscription_id` (uuid, FK to company_subscriptions) - the target subscription
      - `action` (text) - action type: activate, cancel, extend, change_plan
      - `old_status` (text) - previous status
      - `new_status` (text) - new status after action
      - `reason` (text) - admin-provided reason
      - `metadata` (jsonb) - additional details (e.g. extended period, plan change)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on `admin_subscription_actions` table
    - Only super_admin can read and insert
*/

CREATE TABLE IF NOT EXISTS admin_subscription_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES profiles(id),
  company_id uuid NOT NULL REFERENCES companies(id),
  subscription_id uuid REFERENCES company_subscriptions(id),
  action text NOT NULL DEFAULT '',
  old_status text NOT NULL DEFAULT '',
  new_status text NOT NULL DEFAULT '',
  reason text NOT NULL DEFAULT '',
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_sub_actions_company ON admin_subscription_actions(company_id);
CREATE INDEX IF NOT EXISTS idx_admin_sub_actions_admin ON admin_subscription_actions(admin_id);

ALTER TABLE admin_subscription_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view subscription actions"
  ON admin_subscription_actions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = 'super_admin'
    )
  );

CREATE POLICY "Super admins can insert subscription actions"
  ON admin_subscription_actions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = 'super_admin'
    )
  );
