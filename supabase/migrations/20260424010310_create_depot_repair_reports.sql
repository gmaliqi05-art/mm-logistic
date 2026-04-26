/*
  # Depot repair daily reports

  Adds a table that stores finalized daily repair summaries so that the
  repair-worker page and the Puntor Reparature overview can display
  historical reports grouped by date.

  1. New tables
    - depot_repair_reports
      - id uuid PK
      - company_id uuid NOT NULL (FK companies, CASCADE)
      - depot_id uuid (FK depots, SET NULL)
      - worker_id uuid (FK profiles, SET NULL) — null when scope='company'
      - scope text CHECK in ('worker','company')
      - report_date date NOT NULL
      - total_quantity integer NOT NULL DEFAULT 0
      - entry_count integer NOT NULL DEFAULT 0
      - details jsonb NOT NULL DEFAULT '{}' — snapshot of entries /
        per-worker aggregates at the moment the report was finalized
      - created_by uuid (FK profiles)
      - created_at timestamptz NOT NULL DEFAULT now()

  2. Security
    - RLS enabled.
    - SELECT: any authenticated user from the same company.
    - INSERT: depot workers, company_admin, accountant from the same
      company; created_by must equal auth.uid().
    - UPDATE/DELETE: only company_admin/accountant.

  3. Indexes
    - (company_id, report_date desc), (worker_id, report_date desc).
*/

CREATE TABLE IF NOT EXISTS depot_repair_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  depot_id uuid REFERENCES depots(id) ON DELETE SET NULL,
  worker_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  scope text NOT NULL CHECK (scope IN ('worker', 'company')),
  report_date date NOT NULL,
  total_quantity integer NOT NULL DEFAULT 0,
  entry_count integer NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_depot_repair_reports_company_date
  ON depot_repair_reports(company_id, report_date DESC);
CREATE INDEX IF NOT EXISTS idx_depot_repair_reports_worker_date
  ON depot_repair_reports(worker_id, report_date DESC);
CREATE INDEX IF NOT EXISTS idx_depot_repair_reports_scope
  ON depot_repair_reports(company_id, scope, report_date DESC);

ALTER TABLE depot_repair_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company users view repair reports" ON depot_repair_reports;
CREATE POLICY "Company users view repair reports"
  ON depot_repair_reports FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Company staff insert repair reports" ON depot_repair_reports;
CREATE POLICY "Company staff insert repair reports"
  ON depot_repair_reports FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('company_admin', 'accountant', 'depot_worker')
    )
  );

DROP POLICY IF EXISTS "Admins update repair reports" ON depot_repair_reports;
CREATE POLICY "Admins update repair reports"
  ON depot_repair_reports FOR UPDATE
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('company_admin', 'accountant')
    )
  )
  WITH CHECK (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Admins delete repair reports" ON depot_repair_reports;
CREATE POLICY "Admins delete repair reports"
  ON depot_repair_reports FOR DELETE
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('company_admin', 'accountant')
    )
  );
