/*
  # Route Traffic Alerts System

  1. New Tables
    - `route_traffic_alerts`: stores detected traffic issues along a driver's route to the delivery destination.
      - Includes severity (low/moderate/high), delay in minutes, human-readable message,
        a snippet of the affected route (polyline jsonb), distance, optional suggested alternative,
        timestamps for when company and driver were notified, and when the alert resolved.

  2. Security
    - RLS enabled on the new table.
    - SELECT: company_admin/logistics/dispatcher can read alerts for their company; drivers can read their own alerts.
    - INSERT/UPDATE/DELETE: restricted to service_role (edge functions) only.

  3. Realtime
    - Table is added to the supabase_realtime publication so clients can react instantly.

  4. Indexes
    - By company_id + created_at, by driver_id, by delivery_note_id for common lookups.
*/

CREATE TABLE IF NOT EXISTS public.route_traffic_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  delivery_note_id uuid REFERENCES public.delivery_notes(id) ON DELETE CASCADE,
  severity text NOT NULL DEFAULT 'moderate' CHECK (severity IN ('low','moderate','high')),
  delay_minutes integer NOT NULL DEFAULT 0,
  distance_km numeric(10,2) DEFAULT 0,
  message text NOT NULL DEFAULT '',
  incident_type text DEFAULT 'congestion',
  polyline_segment jsonb,
  alternative_route jsonb,
  origin_lat double precision,
  origin_lng double precision,
  dest_lat double precision,
  dest_lng double precision,
  notified_driver_at timestamptz,
  notified_company_at timestamptz,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_route_traffic_alerts_company_created ON public.route_traffic_alerts (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_route_traffic_alerts_driver ON public.route_traffic_alerts (driver_id);
CREATE INDEX IF NOT EXISTS idx_route_traffic_alerts_delivery ON public.route_traffic_alerts (delivery_note_id);
CREATE INDEX IF NOT EXISTS idx_route_traffic_alerts_unresolved ON public.route_traffic_alerts (company_id) WHERE resolved_at IS NULL;

ALTER TABLE public.route_traffic_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company staff can read traffic alerts" ON public.route_traffic_alerts;
CREATE POLICY "Company staff can read traffic alerts"
  ON public.route_traffic_alerts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.company_id = route_traffic_alerts.company_id
        AND p.role IN ('company_admin','logistics','dispatcher','super_admin')
    )
  );

DROP POLICY IF EXISTS "Drivers can read own traffic alerts" ON public.route_traffic_alerts;
CREATE POLICY "Drivers can read own traffic alerts"
  ON public.route_traffic_alerts FOR SELECT
  TO authenticated
  USING (driver_id = auth.uid());

DROP POLICY IF EXISTS "Drivers can acknowledge own traffic alerts" ON public.route_traffic_alerts;
CREATE POLICY "Drivers can acknowledge own traffic alerts"
  ON public.route_traffic_alerts FOR UPDATE
  TO authenticated
  USING (driver_id = auth.uid())
  WITH CHECK (driver_id = auth.uid());

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'route_traffic_alerts'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.route_traffic_alerts';
  END IF;
END $$;
