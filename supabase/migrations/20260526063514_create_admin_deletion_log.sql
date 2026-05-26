/*
  # Create admin deletion log for audit trail

  1. New Tables
    - `admin_deletion_log`
      - `id` (uuid, primary key)
      - `deleted_by` (uuid, the super admin who performed the deletion)
      - `deleted_user_id` (uuid, the user that was deleted)
      - `deleted_user_email` (text, preserved for reference after auth deletion)
      - `deleted_user_name` (text, preserved for reference)
      - `deleted_user_role` (text)
      - `deleted_company_id` (uuid, if company was also deleted)
      - `deleted_company_name` (text, preserved for reference)
      - `deletion_type` (text: user_only, user_and_company)
      - `tables_cleaned` (integer, number of tables that had data removed)
      - `created_at` (timestamptz)

  2. Security
    - RLS enabled, only super_admin can read
    - No insert/update/delete from frontend -- service role only
*/

CREATE TABLE IF NOT EXISTS admin_deletion_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deleted_by uuid,
  deleted_user_id uuid,
  deleted_user_email text NOT NULL DEFAULT '',
  deleted_user_name text NOT NULL DEFAULT '',
  deleted_user_role text NOT NULL DEFAULT '',
  deleted_company_id uuid,
  deleted_company_name text DEFAULT '',
  deletion_type text NOT NULL DEFAULT 'user_only'
    CHECK (deletion_type IN ('user_only', 'user_and_company')),
  tables_cleaned integer NOT NULL DEFAULT 0,
  details jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE admin_deletion_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view deletion logs"
  ON admin_deletion_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.role = 'super_admin'
    )
  );
