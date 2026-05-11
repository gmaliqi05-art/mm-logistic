/*
  # Driver Identity Documents

  1. New Table
    - `driver_identity_documents` stores ID cards, passports, residence permits and work visas for drivers.
      Two-sided scan support via photo_front_url and photo_back_url.
      Holder fields (full name, DOB, nationality) captured for accurate company reporting.
      Visa fields (category, work permit number) for work-visa holders.

  2. New Columns
    - `driver_qualifications.photo_front_url` and `photo_back_url` for two-sided Kod95/ADR scans
    - `driver_licenses.holder_full_name`, `holder_date_of_birth`, `holder_nationality` for audit
    - `profiles.residency_status` to mark citizen / permanent_resident / work_visa_holder

  3. Security
    - RLS enabled
    - Company admins and logistics admins manage docs of drivers in their company
    - Drivers read their own docs
*/

CREATE TABLE IF NOT EXISTS driver_identity_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  residency_status text NOT NULL DEFAULT 'citizen',
  document_number text NOT NULL DEFAULT '',
  issuing_country text NOT NULL DEFAULT '',
  issuing_authority text NOT NULL DEFAULT '',
  issued_date date,
  expiry_date date,
  holder_full_name text NOT NULL DEFAULT '',
  holder_date_of_birth date,
  holder_nationality text NOT NULL DEFAULT '',
  visa_category text NOT NULL DEFAULT '',
  visa_work_permit_number text NOT NULL DEFAULT '',
  photo_front_url text NOT NULL DEFAULT '',
  photo_back_url text NOT NULL DEFAULT '',
  mrz_raw text NOT NULL DEFAULT '',
  extracted_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT drv_id_doc_type_chk CHECK (document_type IN ('national_id','passport','residence_permit','work_visa')),
  CONSTRAINT drv_id_residency_chk CHECK (residency_status IN ('citizen','permanent_resident','work_visa_holder'))
);

CREATE INDEX IF NOT EXISTS idx_drv_id_doc_driver ON driver_identity_documents(driver_id);
CREATE INDEX IF NOT EXISTS idx_drv_id_doc_company ON driver_identity_documents(company_id);
CREATE INDEX IF NOT EXISTS idx_drv_id_doc_expiry ON driver_identity_documents(expiry_date);

ALTER TABLE driver_identity_documents ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='driver_identity_documents' AND policyname='drv_id_doc_select_company') THEN
    CREATE POLICY "drv_id_doc_select_company"
      ON driver_identity_documents FOR SELECT TO authenticated
      USING (
        company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
        AND (
          driver_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
              AND p.role IN ('company_admin','logistics_admin')
          )
        )
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='driver_identity_documents' AND policyname='drv_id_doc_insert_admin') THEN
    CREATE POLICY "drv_id_doc_insert_admin"
      ON driver_identity_documents FOR INSERT TO authenticated
      WITH CHECK (
        company_id IN (
          SELECT company_id FROM profiles
          WHERE id = auth.uid() AND role IN ('company_admin','logistics_admin')
        )
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='driver_identity_documents' AND policyname='drv_id_doc_update_admin') THEN
    CREATE POLICY "drv_id_doc_update_admin"
      ON driver_identity_documents FOR UPDATE TO authenticated
      USING (
        company_id IN (
          SELECT company_id FROM profiles
          WHERE id = auth.uid() AND role IN ('company_admin','logistics_admin')
        )
      )
      WITH CHECK (
        company_id IN (
          SELECT company_id FROM profiles
          WHERE id = auth.uid() AND role IN ('company_admin','logistics_admin')
        )
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='driver_identity_documents' AND policyname='drv_id_doc_delete_admin') THEN
    CREATE POLICY "drv_id_doc_delete_admin"
      ON driver_identity_documents FOR DELETE TO authenticated
      USING (
        company_id IN (
          SELECT company_id FROM profiles
          WHERE id = auth.uid() AND role IN ('company_admin','logistics_admin')
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='driver_qualifications' AND column_name='photo_front_url') THEN
    ALTER TABLE driver_qualifications ADD COLUMN photo_front_url text NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='driver_qualifications' AND column_name='photo_back_url') THEN
    ALTER TABLE driver_qualifications ADD COLUMN photo_back_url text NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='driver_licenses' AND column_name='holder_full_name') THEN
    ALTER TABLE driver_licenses ADD COLUMN holder_full_name text NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='driver_licenses' AND column_name='holder_date_of_birth') THEN
    ALTER TABLE driver_licenses ADD COLUMN holder_date_of_birth date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='driver_licenses' AND column_name='holder_nationality') THEN
    ALTER TABLE driver_licenses ADD COLUMN holder_nationality text NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='residency_status') THEN
    ALTER TABLE profiles ADD COLUMN residency_status text NOT NULL DEFAULT 'citizen';
  END IF;
END $$;
