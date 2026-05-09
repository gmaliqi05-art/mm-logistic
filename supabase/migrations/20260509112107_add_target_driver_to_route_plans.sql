/*
  # Ad-hoc route plan assignment to a specific driver

  1. Add `target_driver_id` on `driver_route_plans` so the company can assign a
     computed route to a driver even when no delivery note exists yet.
  2. Index on (target_driver_id, created_at desc) for the driver's "my assigned
     routes" list.
  3. Extend RLS so a driver can SELECT plans where target_driver_id = auth.uid().
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='driver_route_plans' AND column_name='target_driver_id') THEN
    ALTER TABLE driver_route_plans ADD COLUMN target_driver_id uuid REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_driver_route_plans_target_driver
  ON driver_route_plans(target_driver_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_delivery_notes_driver_route_assigned
  ON delivery_notes(assigned_driver_id, route_assigned_at DESC);

DROP POLICY IF EXISTS "driver_route_plans_select" ON driver_route_plans;
CREATE POLICY "driver_route_plans_select" ON driver_route_plans FOR SELECT
  TO authenticated USING (
    company_id = private.get_user_company_id()
    OR driver_id = auth.uid()
    OR target_driver_id = auth.uid()
  );
