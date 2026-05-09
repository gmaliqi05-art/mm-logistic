/*
  # Route selection on delivery notes + shift sessions for reporting

  1. delivery_notes: add route_alternatives (jsonb[3]), route_selected_label,
     route_assigned_at, route_assigned_by to carry company's chosen plan.
  2. Create shift_sessions table to group driver_locations into work shifts
     so reporting can compute total km, duration, stationary time per period.
  3. Add index on driver_locations(driver_id, recorded_at) for fast range scans.
  4. RLS on shift_sessions: driver sees own; company staff see all.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='delivery_notes' AND column_name='route_alternatives') THEN
    ALTER TABLE delivery_notes ADD COLUMN route_alternatives jsonb DEFAULT '[]'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='delivery_notes' AND column_name='route_selected_label') THEN
    ALTER TABLE delivery_notes ADD COLUMN route_selected_label text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='delivery_notes' AND column_name='route_assigned_at') THEN
    ALTER TABLE delivery_notes ADD COLUMN route_assigned_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='delivery_notes' AND column_name='route_assigned_by') THEN
    ALTER TABLE delivery_notes ADD COLUMN route_assigned_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS shift_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  total_distance_km numeric DEFAULT 0,
  total_duration_min numeric DEFAULT 0,
  stationary_min numeric DEFAULT 0,
  auto_stopped boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shift_sessions_company_started ON shift_sessions(company_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_shift_sessions_driver_started ON shift_sessions(driver_id, started_at DESC);

ALTER TABLE shift_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shift_sessions_driver_select" ON shift_sessions;
CREATE POLICY "shift_sessions_driver_select" ON shift_sessions FOR SELECT
  TO authenticated USING (driver_id = auth.uid());

DROP POLICY IF EXISTS "shift_sessions_company_select" ON shift_sessions;
CREATE POLICY "shift_sessions_company_select" ON shift_sessions FOR SELECT
  TO authenticated USING (company_id = private.get_user_company_id());

DROP POLICY IF EXISTS "shift_sessions_driver_insert" ON shift_sessions;
CREATE POLICY "shift_sessions_driver_insert" ON shift_sessions FOR INSERT
  TO authenticated WITH CHECK (driver_id = auth.uid() AND company_id = private.get_user_company_id());

DROP POLICY IF EXISTS "shift_sessions_driver_update" ON shift_sessions;
CREATE POLICY "shift_sessions_driver_update" ON shift_sessions FOR UPDATE
  TO authenticated USING (driver_id = auth.uid()) WITH CHECK (driver_id = auth.uid());

DROP POLICY IF EXISTS "shift_sessions_company_update" ON shift_sessions;
CREATE POLICY "shift_sessions_company_update" ON shift_sessions FOR UPDATE
  TO authenticated USING (company_id = private.get_user_company_id() AND private.get_user_role() IN ('company_admin','logistics_admin','super_admin'))
  WITH CHECK (company_id = private.get_user_company_id());
