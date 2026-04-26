/*
  # Depot worker categories + repair log

  Adds a `worker_category` column to `profiles` so companies can classify
  depot staff as either warehouse managers ("depoist") or repair workers
  ("reparature"). Adds a new `depot_repairs` table where repair workers
  can log pallet repair activity per category with before/after quantity
  and condition.

  1. Schema changes
    - profiles:
      - worker_category text (nullable) — 'depoist' | 'reparature' | null
    - depot_repairs (new):
      - id uuid PK
      - company_id uuid (FK companies)
      - depot_id uuid (FK depots)
      - worker_id uuid (FK profiles) — the repair worker who did it
      - category_id uuid (FK product_categories)
      - quantity_in integer
      - quantity_repaired integer
      - quantity_scrapped integer
      - notes text
      - logged_at timestamptz default now()
      - created_at timestamptz default now()

  2. Security
    - RLS enabled on depot_repairs
    - Policies restrict rows to same-company users:
      - SELECT: any authenticated user whose profile.company_id matches
      - INSERT/UPDATE/DELETE: only company_admin, accountant, or the
        worker whose worker_id matches auth.uid()
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='profiles' AND column_name='worker_category'
  ) THEN
    ALTER TABLE profiles ADD COLUMN worker_category text;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS depot_repairs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  depot_id uuid REFERENCES depots(id) ON DELETE SET NULL,
  worker_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  category_id uuid REFERENCES product_categories(id) ON DELETE SET NULL,
  quantity_in integer NOT NULL DEFAULT 0,
  quantity_repaired integer NOT NULL DEFAULT 0,
  quantity_scrapped integer NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  logged_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_depot_repairs_company_id ON depot_repairs(company_id);
CREATE INDEX IF NOT EXISTS idx_depot_repairs_depot_id ON depot_repairs(depot_id);
CREATE INDEX IF NOT EXISTS idx_depot_repairs_worker_id ON depot_repairs(worker_id);

ALTER TABLE depot_repairs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company users can view depot repairs" ON depot_repairs;
CREATE POLICY "Company users can view depot repairs"
  ON depot_repairs FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Admins or the worker can insert repairs" ON depot_repairs;
CREATE POLICY "Admins or the worker can insert repairs"
  ON depot_repairs FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (
      EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND p.role IN ('company_admin', 'accountant', 'depot_worker')
      )
    )
  );

DROP POLICY IF EXISTS "Admins or the worker can update repairs" ON depot_repairs;
CREATE POLICY "Admins or the worker can update repairs"
  ON depot_repairs FOR UPDATE
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (
      worker_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND p.role IN ('company_admin', 'accountant')
      )
    )
  )
  WITH CHECK (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Admins can delete repairs" ON depot_repairs;
CREATE POLICY "Admins can delete repairs"
  ON depot_repairs FOR DELETE
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('company_admin', 'accountant')
    )
  );
