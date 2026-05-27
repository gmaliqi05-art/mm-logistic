/*
  # Fix RLS: Allow depot workers to update repair reports and mark repairs as reported

  1. Modified Policies
    - `depot_repair_reports` UPDATE policy: Add `depot_worker` role so depot
      supervisors can update the daily company-scope report when clicking
      "Raporto te Admin"
    - `depot_repairs` UPDATE policy: Allow any depot_worker in the same company
      to set `reported_at` on repairs (not just the worker who did the repair
      or an admin). This is needed because the supervisor (depoist) marks
      all open repairs as reported, not the individual reparature workers.

  2. Important Notes
    - Previously both UPDATE policies silently blocked depot_worker access,
      causing "Raporto te Admin" to appear successful (no Supabase error)
      but not actually persist the report update or mark repairs as reported.
    - SELECT/INSERT policies for depot_repair_reports already allowed
      depot_worker, only UPDATE was missing.
*/

-- 1. Fix depot_repair_reports UPDATE: add depot_worker
DROP POLICY IF EXISTS "depot_repair_reports_update_combined" ON depot_repair_reports;

CREATE POLICY "depot_repair_reports_update_combined"
  ON depot_repair_reports
  FOR UPDATE
  TO authenticated
  USING (
    company_id IN (
      SELECT p.company_id FROM profiles p WHERE p.id = (SELECT auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role IN ('company_admin', 'accountant', 'depot_worker')
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT p.company_id FROM profiles p WHERE p.id = (SELECT auth.uid())
    )
  );

-- 2. Fix depot_repairs UPDATE: allow depot_worker to update reported_at
--    (not just the worker who did the repair or admins)
DROP POLICY IF EXISTS "Admins or the worker can update repairs" ON depot_repairs;

CREATE POLICY "Admins or depot workers can update repairs"
  ON depot_repairs
  FOR UPDATE
  TO authenticated
  USING (
    company_id IN (
      SELECT p.company_id FROM profiles p WHERE p.id = (SELECT auth.uid())
    )
    AND (
      worker_id = (SELECT auth.uid())
      OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = (SELECT auth.uid())
          AND p.role IN ('company_admin', 'accountant', 'depot_worker')
      )
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT p.company_id FROM profiles p WHERE p.id = (SELECT auth.uid())
    )
  );
