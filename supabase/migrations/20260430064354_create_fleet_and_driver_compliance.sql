/*
  # Fleet & Driver Compliance System

  1. New Tables
    - `vehicles` - Kamionet (trucks) dhe rimorkiot (trailers) me te gjitha te dhenat e regjistrimit
      (Kennzeichen/targa, VIN, data e regjistrimit, pesha, Euro class, etj.)
    - `vehicle_inspections` - HU/TUV, AU, UVV, SP, Tachograph per cdo mjet
    - `vehicle_insurance` - Haftpflicht, Vollkasko, Ladungsversicherung
    - `vehicle_taxes` - Kfz-Steuer (taksa vjetore e mjetit)
    - `vehicle_assignments` - Lidhja shofer-mjet
    - `driver_licenses` - Patenta e shoferit me kategori (C, CE, B, etj.), afat
    - `driver_qualifications` - Kod 95 (BKrFQG), ADR, Fahrerkarte, Gabelstapler
    - `driver_medical` - Ekzaminimi G25 dhe te ngjashem
    - `compliance_reminders` - Gjendja e njoftimeve per secilin afat

  2. Security
    - RLS e aktivizuar per te gjitha tabelat
    - Te gjitha te dhenat filtrohen sipas company_id te perdoruesit
    - Vetem anetaret e kompanise mund te lexojne/modifikojne

  3. Notes
    - Sipas FeV § 24, aplikimi per rinovim patentash mund te behet 6 muaj perpara skadimit
    - Kod 95 sipas BKrFQG: 35 ore trajnim cdo 5 vjet
    - HU/TUV: 2 vjet per LKW
    - UVV: vjetore
    - SP (Sicherheitsprufung): 6 mujore per rimorkio > 10 tone
*/

-- VEHICLES
CREATE TABLE IF NOT EXISTS vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  depot_id uuid REFERENCES depots(id) ON DELETE SET NULL,
  vehicle_type text NOT NULL DEFAULT 'truck',
  brand text NOT NULL DEFAULT '',
  model text NOT NULL DEFAULT '',
  license_plate text NOT NULL DEFAULT '',
  vin text NOT NULL DEFAULT '',
  first_registration date,
  zb1_number text DEFAULT '',
  zb2_number text DEFAULT '',
  max_weight_kg integer DEFAULT 0,
  payload_kg integer DEFAULT 0,
  axles integer DEFAULT 0,
  euro_emission text DEFAULT '',
  fuel_type text DEFAULT '',
  engine_power_kw integer DEFAULT 0,
  color text DEFAULT '',
  status text NOT NULL DEFAULT 'active',
  photo_url text DEFAULT '',
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT vehicles_type_check CHECK (vehicle_type IN ('truck', 'trailer')),
  CONSTRAINT vehicles_status_check CHECK (status IN ('active', 'inactive', 'in_repair', 'sold'))
);

CREATE INDEX IF NOT EXISTS idx_vehicles_company ON vehicles(company_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_depot ON vehicles(depot_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_type ON vehicles(company_id, vehicle_type);

ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view vehicles"
  ON vehicles FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Company admins can insert vehicles"
  ON vehicles FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'logistics_admin')));

CREATE POLICY "Company admins can update vehicles"
  ON vehicles FOR UPDATE TO authenticated
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'logistics_admin')))
  WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'logistics_admin')));

CREATE POLICY "Company admins can delete vehicles"
  ON vehicles FOR DELETE TO authenticated
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'logistics_admin')));

-- VEHICLE INSPECTIONS
CREATE TABLE IF NOT EXISTS vehicle_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  inspection_type text NOT NULL,
  issued_date date,
  expiry_date date NOT NULL,
  provider text DEFAULT '',
  certificate_number text DEFAULT '',
  document_url text DEFAULT '',
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  CONSTRAINT inspections_type_check CHECK (inspection_type IN ('hu_tuv', 'au', 'uvv', 'sp', 'tacho', 'other'))
);

CREATE INDEX IF NOT EXISTS idx_inspections_vehicle ON vehicle_inspections(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_inspections_company_expiry ON vehicle_inspections(company_id, expiry_date);

ALTER TABLE vehicle_inspections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view inspections"
  ON vehicle_inspections FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Company admins can insert inspections"
  ON vehicle_inspections FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'logistics_admin')));
CREATE POLICY "Company admins can update inspections"
  ON vehicle_inspections FOR UPDATE TO authenticated
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'logistics_admin')))
  WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'logistics_admin')));
CREATE POLICY "Company admins can delete inspections"
  ON vehicle_inspections FOR DELETE TO authenticated
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'logistics_admin')));

-- VEHICLE INSURANCE
CREATE TABLE IF NOT EXISTS vehicle_insurance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  insurance_type text NOT NULL,
  provider text DEFAULT '',
  policy_number text DEFAULT '',
  start_date date,
  end_date date NOT NULL,
  premium_amount numeric(12, 2) DEFAULT 0,
  green_card_expiry date,
  document_url text DEFAULT '',
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  CONSTRAINT insurance_type_check CHECK (insurance_type IN ('haftpflicht', 'vollkasko', 'teilkasko', 'ladung', 'other'))
);

CREATE INDEX IF NOT EXISTS idx_insurance_vehicle ON vehicle_insurance(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_insurance_company_expiry ON vehicle_insurance(company_id, end_date);

ALTER TABLE vehicle_insurance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view insurance"
  ON vehicle_insurance FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Company admins can insert insurance"
  ON vehicle_insurance FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'logistics_admin')));
CREATE POLICY "Company admins can update insurance"
  ON vehicle_insurance FOR UPDATE TO authenticated
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'logistics_admin')))
  WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'logistics_admin')));
CREATE POLICY "Company admins can delete insurance"
  ON vehicle_insurance FOR DELETE TO authenticated
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'logistics_admin')));

-- VEHICLE TAXES
CREATE TABLE IF NOT EXISTS vehicle_taxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  tax_year integer NOT NULL,
  amount numeric(12, 2) DEFAULT 0,
  due_date date NOT NULL,
  paid_at date,
  document_url text DEFAULT '',
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_taxes_vehicle ON vehicle_taxes(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_taxes_company_due ON vehicle_taxes(company_id, due_date);

ALTER TABLE vehicle_taxes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view taxes"
  ON vehicle_taxes FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Company admins can insert taxes"
  ON vehicle_taxes FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'logistics_admin')));
CREATE POLICY "Company admins can update taxes"
  ON vehicle_taxes FOR UPDATE TO authenticated
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'logistics_admin')))
  WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'logistics_admin')));
CREATE POLICY "Company admins can delete taxes"
  ON vehicle_taxes FOR DELETE TO authenticated
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'logistics_admin')));

-- VEHICLE ASSIGNMENTS (driver <-> vehicle)
CREATE TABLE IF NOT EXISTS vehicle_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  is_primary boolean DEFAULT true,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assignments_vehicle ON vehicle_assignments(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_assignments_driver ON vehicle_assignments(driver_id);

ALTER TABLE vehicle_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view assignments"
  ON vehicle_assignments FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Company admins can insert assignments"
  ON vehicle_assignments FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'logistics_admin')));
CREATE POLICY "Company admins can update assignments"
  ON vehicle_assignments FOR UPDATE TO authenticated
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'logistics_admin')))
  WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'logistics_admin')));
CREATE POLICY "Company admins can delete assignments"
  ON vehicle_assignments FOR DELETE TO authenticated
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'logistics_admin')));

-- DRIVER LICENSES
CREATE TABLE IF NOT EXISTS driver_licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  license_number text NOT NULL DEFAULT '',
  license_categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  issued_date date,
  issued_country text DEFAULT 'DE',
  issuing_authority text DEFAULT '',
  expiry_date date NOT NULL,
  photo_front_url text DEFAULT '',
  photo_back_url text DEFAULT '',
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_licenses_driver ON driver_licenses(driver_id);
CREATE INDEX IF NOT EXISTS idx_licenses_company_expiry ON driver_licenses(company_id, expiry_date);

ALTER TABLE driver_licenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view driver licenses"
  ON driver_licenses FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Company admins can insert driver licenses"
  ON driver_licenses FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'logistics_admin')));
CREATE POLICY "Company admins can update driver licenses"
  ON driver_licenses FOR UPDATE TO authenticated
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'logistics_admin')))
  WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'logistics_admin')));
CREATE POLICY "Company admins can delete driver licenses"
  ON driver_licenses FOR DELETE TO authenticated
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'logistics_admin')));

-- DRIVER QUALIFICATIONS (Kod 95, ADR, etc.)
CREATE TABLE IF NOT EXISTS driver_qualifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  qualification_type text NOT NULL,
  number text DEFAULT '',
  issued_date date,
  expiry_date date NOT NULL,
  module_hours integer DEFAULT 0,
  issuing_authority text DEFAULT '',
  document_url text DEFAULT '',
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  CONSTRAINT qualification_type_check CHECK (qualification_type IN ('kod95', 'adr', 'fahrerkarte', 'gabelstapler', 'ladungssicherung', 'erste_hilfe', 'other'))
);

CREATE INDEX IF NOT EXISTS idx_quals_driver ON driver_qualifications(driver_id);
CREATE INDEX IF NOT EXISTS idx_quals_company_expiry ON driver_qualifications(company_id, expiry_date);

ALTER TABLE driver_qualifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view qualifications"
  ON driver_qualifications FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Company admins can insert qualifications"
  ON driver_qualifications FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'logistics_admin')));
CREATE POLICY "Company admins can update qualifications"
  ON driver_qualifications FOR UPDATE TO authenticated
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'logistics_admin')))
  WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'logistics_admin')));
CREATE POLICY "Company admins can delete qualifications"
  ON driver_qualifications FOR DELETE TO authenticated
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'logistics_admin')));

-- DRIVER MEDICAL
CREATE TABLE IF NOT EXISTS driver_medical (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  exam_type text NOT NULL DEFAULT 'g25',
  exam_date date,
  expiry_date date NOT NULL,
  doctor text DEFAULT '',
  document_url text DEFAULT '',
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_medical_driver ON driver_medical(driver_id);
CREATE INDEX IF NOT EXISTS idx_medical_company_expiry ON driver_medical(company_id, expiry_date);

ALTER TABLE driver_medical ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view medical"
  ON driver_medical FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Company admins can insert medical"
  ON driver_medical FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'logistics_admin')));
CREATE POLICY "Company admins can update medical"
  ON driver_medical FOR UPDATE TO authenticated
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'logistics_admin')))
  WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'logistics_admin')));
CREATE POLICY "Company admins can delete medical"
  ON driver_medical FOR DELETE TO authenticated
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'logistics_admin')));

-- COMPLIANCE REMINDERS
CREATE TABLE IF NOT EXISTS compliance_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  compliance_type text NOT NULL,
  expiry_date date NOT NULL,
  reminder_90d_sent boolean DEFAULT false,
  reminder_60d_sent boolean DEFAULT false,
  reminder_30d_sent boolean DEFAULT false,
  reminder_14d_sent boolean DEFAULT false,
  reminder_7d_sent boolean DEFAULT false,
  reminder_expired_sent boolean DEFAULT false,
  last_notified_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT reminders_entity_check CHECK (entity_type IN ('vehicle', 'driver')),
  CONSTRAINT reminders_compliance_unique UNIQUE (entity_type, entity_id, compliance_type)
);

CREATE INDEX IF NOT EXISTS idx_reminders_company_expiry ON compliance_reminders(company_id, expiry_date);

ALTER TABLE compliance_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view reminders"
  ON compliance_reminders FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Company admins can insert reminders"
  ON compliance_reminders FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'logistics_admin')));
CREATE POLICY "Company admins can update reminders"
  ON compliance_reminders FOR UPDATE TO authenticated
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'logistics_admin')))
  WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'logistics_admin')));
CREATE POLICY "Company admins can delete reminders"
  ON compliance_reminders FOR DELETE TO authenticated
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'logistics_admin')));
