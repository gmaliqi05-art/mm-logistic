/*
  # Super Admin Audit Logs and System Health Checks

  1. New Tables
    - `sa_audit_logs`: Records every super admin action (mutations on companies, plans, settings, payments, users, etc.)
      - `id` uuid primary key
      - `actor_id` uuid (auth.users)
      - `actor_email` text snapshot
      - `action` text (e.g., 'create', 'update', 'delete', 'toggle')
      - `entity_type` text (e.g., 'company', 'subscription_plan', 'platform_setting')
      - `entity_id` text (uuid or string id of the record)
      - `entity_label` text (human-readable label snapshot)
      - `details` jsonb (before/after diff or arbitrary metadata)
      - `ip_address` text optional
      - `created_at` timestamptz default now()
    - `system_health_checks`: Latest snapshot per check name written by a scheduled task or on-demand.
      - `id` uuid primary key
      - `check_name` text unique
      - `status` text ('ok', 'warning', 'error')
      - `latency_ms` integer
      - `message` text
      - `details` jsonb
      - `checked_at` timestamptz default now()

  2. Security
    - RLS enabled on both tables
    - Only super_admin can SELECT/INSERT into sa_audit_logs (no UPDATE/DELETE - immutable)
    - Only super_admin can SELECT system_health_checks; INSERT/UPDATE allowed to authenticated super_admin so client can run checks

  3. Indexes
    - sa_audit_logs(created_at desc), (actor_id), (entity_type, entity_id)
    - system_health_checks(check_name)
*/

CREATE TABLE IF NOT EXISTS sa_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text DEFAULT '',
  action text NOT NULL DEFAULT 'update',
  entity_type text NOT NULL DEFAULT '',
  entity_id text DEFAULT '',
  entity_label text DEFAULT '',
  details jsonb DEFAULT '{}'::jsonb,
  ip_address text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sa_audit_logs_created_at ON sa_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sa_audit_logs_actor ON sa_audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_sa_audit_logs_entity ON sa_audit_logs(entity_type, entity_id);

ALTER TABLE sa_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sa_audit_select" ON sa_audit_logs;
CREATE POLICY "sa_audit_select"
  ON sa_audit_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

DROP POLICY IF EXISTS "sa_audit_insert" ON sa_audit_logs;
CREATE POLICY "sa_audit_insert"
  ON sa_audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

CREATE TABLE IF NOT EXISTS system_health_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_name text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'ok',
  latency_ms integer DEFAULT 0,
  message text DEFAULT '',
  details jsonb DEFAULT '{}'::jsonb,
  checked_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_health_checks_name ON system_health_checks(check_name);

ALTER TABLE system_health_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "health_select_super_admin" ON system_health_checks;
CREATE POLICY "health_select_super_admin"
  ON system_health_checks FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

DROP POLICY IF EXISTS "health_insert_super_admin" ON system_health_checks;
CREATE POLICY "health_insert_super_admin"
  ON system_health_checks FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

DROP POLICY IF EXISTS "health_update_super_admin" ON system_health_checks;
CREATE POLICY "health_update_super_admin"
  ON system_health_checks FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );
