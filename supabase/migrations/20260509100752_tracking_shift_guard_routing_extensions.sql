/*
  # Tracking Shift Guard, Truck Routing & Route Extensions

  1. Driver shift configuration
    - Adds `shift_end_hour` (smallint, default 17) and `shift_timezone` (text, default 'Europe/Berlin') on `profiles`.
    - Adds `tracking_last_confirmed_at` (timestamptz) on `profiles`.

  2. Tracking prompts
    - New table `tracking_prompts` — logs 17:00+ check-in prompts to drivers.
    - Columns: id, company_id, driver_id, delivery_note_id, sent_at, responded_at, response (still_working | finished | break | auto_stopped).

  3. Delivery notes — tracking state
    - Adds `tracking_paused` boolean default false, `tracking_auto_stopped_at` timestamptz.
    - Adds `planned_route_geojson` jsonb, `planned_toll_cost_eur` numeric, `planned_distance_km` numeric, `planned_duration_min` numeric for route planner output.

  4. Driver route plans
    - New table `driver_route_plans` — stores each computed route (origin/destination/alternatives, tolls breakdown).

  5. Route extension requests
    - New table `route_extension_requests` — driver asks company to extend/modify a delivery route.
    - Statuses: pending | accepted | rejected | cancelled.

  6. Country toll rates (HGV)
    - New table `country_toll_rates` seeded with base values for DE (Maut), CH (LSVA), AT (GO-Box), FR (péage), IT, NL, BE, PL.

  7. Security (RLS)
    - All new tables scoped to company via `private.get_user_company_id()`.
    - Drivers can INSERT into `tracking_prompts` (own) + responses; company staff read/update.
    - Drivers write own `driver_route_plans`, `route_extension_requests`; company admins read + act.
    - `country_toll_rates` is read-only reference data for authenticated users.
*/

-- 1. Profile columns ---------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='shift_end_hour') THEN
    ALTER TABLE profiles ADD COLUMN shift_end_hour smallint DEFAULT 17;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='shift_timezone') THEN
    ALTER TABLE profiles ADD COLUMN shift_timezone text DEFAULT 'Europe/Berlin';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='tracking_last_confirmed_at') THEN
    ALTER TABLE profiles ADD COLUMN tracking_last_confirmed_at timestamptz;
  END IF;
END $$;

-- 2. Delivery notes columns --------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='delivery_notes' AND column_name='tracking_paused') THEN
    ALTER TABLE delivery_notes ADD COLUMN tracking_paused boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='delivery_notes' AND column_name='tracking_auto_stopped_at') THEN
    ALTER TABLE delivery_notes ADD COLUMN tracking_auto_stopped_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='delivery_notes' AND column_name='planned_route_geojson') THEN
    ALTER TABLE delivery_notes ADD COLUMN planned_route_geojson jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='delivery_notes' AND column_name='planned_toll_cost_eur') THEN
    ALTER TABLE delivery_notes ADD COLUMN planned_toll_cost_eur numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='delivery_notes' AND column_name='planned_distance_km') THEN
    ALTER TABLE delivery_notes ADD COLUMN planned_distance_km numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='delivery_notes' AND column_name='planned_duration_min') THEN
    ALTER TABLE delivery_notes ADD COLUMN planned_duration_min numeric;
  END IF;
END $$;

-- 3. tracking_prompts --------------------------------------------------------
CREATE TABLE IF NOT EXISTS tracking_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  delivery_note_id uuid REFERENCES delivery_notes(id) ON DELETE SET NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  response text CHECK (response IN ('still_working','finished','break','auto_stopped')),
  reason text DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_tracking_prompts_company_sent ON tracking_prompts(company_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_tracking_prompts_driver_sent ON tracking_prompts(driver_id, sent_at DESC);

ALTER TABLE tracking_prompts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tracking_prompts_driver_select" ON tracking_prompts;
CREATE POLICY "tracking_prompts_driver_select" ON tracking_prompts FOR SELECT
  TO authenticated USING (driver_id = auth.uid());

DROP POLICY IF EXISTS "tracking_prompts_company_select" ON tracking_prompts;
CREATE POLICY "tracking_prompts_company_select" ON tracking_prompts FOR SELECT
  TO authenticated USING (company_id = private.get_user_company_id());

DROP POLICY IF EXISTS "tracking_prompts_driver_insert" ON tracking_prompts;
CREATE POLICY "tracking_prompts_driver_insert" ON tracking_prompts FOR INSERT
  TO authenticated WITH CHECK (driver_id = auth.uid() AND company_id = private.get_user_company_id());

DROP POLICY IF EXISTS "tracking_prompts_driver_update" ON tracking_prompts;
CREATE POLICY "tracking_prompts_driver_update" ON tracking_prompts FOR UPDATE
  TO authenticated USING (driver_id = auth.uid()) WITH CHECK (driver_id = auth.uid());

DROP POLICY IF EXISTS "tracking_prompts_company_update" ON tracking_prompts;
CREATE POLICY "tracking_prompts_company_update" ON tracking_prompts FOR UPDATE
  TO authenticated USING (company_id = private.get_user_company_id() AND private.get_user_role() IN ('company_admin','logistics','dispatcher','super_admin'))
  WITH CHECK (company_id = private.get_user_company_id());

-- 4. driver_route_plans ------------------------------------------------------
CREATE TABLE IF NOT EXISTS driver_route_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  delivery_note_id uuid REFERENCES delivery_notes(id) ON DELETE SET NULL,
  origin_address text DEFAULT '',
  destination_address text NOT NULL,
  origin_lat double precision,
  origin_lng double precision,
  destination_lat double precision,
  destination_lng double precision,
  vehicle_profile text DEFAULT 'driving-hgv',
  total_distance_km numeric DEFAULT 0,
  total_duration_min numeric DEFAULT 0,
  toll_cost_eur numeric DEFAULT 0,
  fuel_cost_eur numeric DEFAULT 0,
  total_cost_eur numeric DEFAULT 0,
  country_breakdown jsonb DEFAULT '[]'::jsonb,
  alternatives jsonb DEFAULT '[]'::jsonb,
  selected_option text DEFAULT 'cheapest',
  geojson jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_route_plans_company ON driver_route_plans(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_route_plans_driver ON driver_route_plans(driver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_route_plans_delivery ON driver_route_plans(delivery_note_id);

ALTER TABLE driver_route_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "driver_route_plans_select" ON driver_route_plans;
CREATE POLICY "driver_route_plans_select" ON driver_route_plans FOR SELECT
  TO authenticated USING (company_id = private.get_user_company_id());

DROP POLICY IF EXISTS "driver_route_plans_insert" ON driver_route_plans;
CREATE POLICY "driver_route_plans_insert" ON driver_route_plans FOR INSERT
  TO authenticated WITH CHECK (company_id = private.get_user_company_id() AND (driver_id = auth.uid() OR private.get_user_role() IN ('company_admin','logistics','dispatcher','super_admin')));

DROP POLICY IF EXISTS "driver_route_plans_update" ON driver_route_plans;
CREATE POLICY "driver_route_plans_update" ON driver_route_plans FOR UPDATE
  TO authenticated USING (company_id = private.get_user_company_id() AND (driver_id = auth.uid() OR private.get_user_role() IN ('company_admin','logistics','dispatcher','super_admin')))
  WITH CHECK (company_id = private.get_user_company_id());

DROP POLICY IF EXISTS "driver_route_plans_delete" ON driver_route_plans;
CREATE POLICY "driver_route_plans_delete" ON driver_route_plans FOR DELETE
  TO authenticated USING (company_id = private.get_user_company_id() AND (driver_id = auth.uid() OR private.get_user_role() IN ('company_admin','logistics','super_admin')));

-- 5. route_extension_requests ------------------------------------------------
CREATE TABLE IF NOT EXISTS route_extension_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  delivery_note_id uuid REFERENCES delivery_notes(id) ON DELETE SET NULL,
  requested_address text NOT NULL,
  reason text DEFAULT '',
  extra_km numeric DEFAULT 0,
  extra_minutes numeric DEFAULT 0,
  status text DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','cancelled')),
  decided_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_route_ext_company_status ON route_extension_requests(company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_route_ext_driver ON route_extension_requests(driver_id, created_at DESC);

ALTER TABLE route_extension_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "route_ext_select" ON route_extension_requests;
CREATE POLICY "route_ext_select" ON route_extension_requests FOR SELECT
  TO authenticated USING (company_id = private.get_user_company_id());

DROP POLICY IF EXISTS "route_ext_insert" ON route_extension_requests;
CREATE POLICY "route_ext_insert" ON route_extension_requests FOR INSERT
  TO authenticated WITH CHECK (driver_id = auth.uid() AND company_id = private.get_user_company_id());

DROP POLICY IF EXISTS "route_ext_update" ON route_extension_requests;
CREATE POLICY "route_ext_update" ON route_extension_requests FOR UPDATE
  TO authenticated
  USING (
    company_id = private.get_user_company_id()
    AND (private.get_user_role() IN ('company_admin','logistics','dispatcher','super_admin') OR driver_id = auth.uid())
  )
  WITH CHECK (company_id = private.get_user_company_id());

-- 6. country_toll_rates ------------------------------------------------------
CREATE TABLE IF NOT EXISTS country_toll_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text NOT NULL,
  country_name text NOT NULL,
  vehicle_class text NOT NULL DEFAULT 'hgv_40t',
  per_km_eur numeric NOT NULL DEFAULT 0,
  fixed_vignette_eur numeric NOT NULL DEFAULT 0,
  notes text DEFAULT '',
  effective_from date DEFAULT CURRENT_DATE,
  UNIQUE (country_code, vehicle_class)
);

ALTER TABLE country_toll_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "country_toll_rates_read" ON country_toll_rates;
CREATE POLICY "country_toll_rates_read" ON country_toll_rates FOR SELECT
  TO authenticated USING (true);

INSERT INTO country_toll_rates (country_code, country_name, vehicle_class, per_km_eur, fixed_vignette_eur, notes) VALUES
  ('DE', 'Germany',     'hgv_40t', 0.19,  0, 'LKW-Maut Euro VI base rate, autobahns & federal roads'),
  ('CH', 'Switzerland', 'hgv_40t', 0.33,  0, 'LSVA Schwerverkehrsabgabe per km (approx Euro VI 40t)'),
  ('AT', 'Austria',     'hgv_40t', 0.40,  0, 'GO-Box Maut average per km for 4+ axles'),
  ('FR', 'France',      'hgv_40t', 0.24,  0, 'Péage autoroute average for class 4'),
  ('IT', 'Italy',       'hgv_40t', 0.20,  0, 'Pedaggio autostradale class 5'),
  ('NL', 'Netherlands', 'hgv_40t', 0.15,  0, 'Eurovignette daily pro-rated'),
  ('BE', 'Belgium',     'hgv_40t', 0.18,  0, 'Viapass kilometer charge'),
  ('PL', 'Poland',      'hgv_40t', 0.13,  0, 'e-TOLL per km average'),
  ('CZ', 'Czechia',     'hgv_40t', 0.18,  0, 'MYTO CZ per km average'),
  ('SK', 'Slovakia',    'hgv_40t', 0.20,  0, 'MYTO SK per km average'),
  ('HU', 'Hungary',     'hgv_40t', 0.16,  0, 'HU-GO per km average'),
  ('SI', 'Slovenia',    'hgv_40t', 0.35,  0, 'DARS per km class R4'),
  ('HR', 'Croatia',     'hgv_40t', 0.22,  0, 'HAC per km class IV')
ON CONFLICT (country_code, vehicle_class) DO NOTHING;
