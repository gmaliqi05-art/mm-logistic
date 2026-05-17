/*
  # Repair reports: unique constraint per worker per day

  1. Changes
    - Add unique partial index on (worker_id, report_date, company_id) WHERE scope='worker'
    - This enables UPSERT so multiple submissions in the same day update instead of
      creating duplicate rows

  2. Rationale
    - Workers may finalize/report multiple times during the day
    - Each subsequent report should update the previous one for that day
    - Prevents the company from seeing duplicate entries for same worker same day
*/

CREATE UNIQUE INDEX IF NOT EXISTS idx_depot_repair_reports_worker_day
  ON depot_repair_reports (worker_id, report_date, company_id)
  WHERE scope = 'worker' AND worker_id IS NOT NULL;
