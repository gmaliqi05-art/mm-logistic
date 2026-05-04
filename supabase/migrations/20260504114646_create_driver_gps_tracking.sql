/*
  # Driver GPS Tracking Infrastructure

  1. New Tables
    - `driver_locations` - time-series of driver GPS pings
      - `id` (uuid pk)
      - `company_id` (uuid fk)
      - `driver_id` (uuid fk profiles)
      - `delivery_note_id` (uuid fk, nullable)
      - `lat`, `lng` (double precision)
      - `accuracy_m`, `heading_deg`, `speed_kmh` (numeric nullable)
      - `recorded_at` (timestamptz default now())

  2. Modified Tables
    - `delivery_notes` - add ETA/position columns
      - `current_lat`, `current_lng` (double precision nullable)
      - `estimated_arrival_at` (timestamptz nullable)
      - `distance_remaining_km` (numeric nullable)
      - `last_location_at` (timestamptz nullable)

  3. Security
    - RLS enabled on `driver_locations`
    - Drivers insert their own rows (auth.uid() = driver_id)
    - Drivers read their own recent rows
    - Company staff (admin/dispatcher/logistics/accountant) read company rows

  4. Indexes
    - (company_id, recorded_at desc)
    - (driver_id, recorded_at desc)
    - (delivery_note_id, recorded_at desc)
*/

CREATE TABLE IF NOT EXISTS driver_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  delivery_note_id uuid REFERENCES delivery_notes(id) ON DELETE SET NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  accuracy_m numeric,
  heading_deg numeric,
  speed_kmh numeric,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_locations_company_recorded
  ON driver_locations (company_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_locations_driver_recorded
  ON driver_locations (driver_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_locations_delivery_recorded
  ON driver_locations (delivery_note_id, recorded_at DESC);

ALTER TABLE driver_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers insert own location"
  ON driver_locations FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = driver_id
    AND company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Drivers read own locations"
  ON driver_locations FOR SELECT
  TO authenticated
  USING (auth.uid() = driver_id);

CREATE POLICY "Company staff read company driver locations"
  ON driver_locations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.company_id = driver_locations.company_id
        AND p.role IN ('company_admin','logistics','dispatcher','accountant','super_admin')
    )
  );

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='delivery_notes' AND column_name='current_lat') THEN
    ALTER TABLE delivery_notes ADD COLUMN current_lat double precision;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='delivery_notes' AND column_name='current_lng') THEN
    ALTER TABLE delivery_notes ADD COLUMN current_lng double precision;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='delivery_notes' AND column_name='estimated_arrival_at') THEN
    ALTER TABLE delivery_notes ADD COLUMN estimated_arrival_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='delivery_notes' AND column_name='distance_remaining_km') THEN
    ALTER TABLE delivery_notes ADD COLUMN distance_remaining_km numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='delivery_notes' AND column_name='last_location_at') THEN
    ALTER TABLE delivery_notes ADD COLUMN last_location_at timestamptz;
  END IF;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE driver_locations;
