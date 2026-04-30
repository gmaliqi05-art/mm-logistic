/*
  # Fleet & Driver Document Scanner

  1. New Tables
    - `fleet_scanned_documents` - Uploaded vehicle/driver documents for AI extraction
      Stores original PDF/image, extracted JSON data, and link to created entity.
      Document categories supported: zulassung (ZB I/II), hu_tuv, au, sp, uvv, tacho,
      insurance (haftpflicht/vollkasko/teilkasko), kfz_steuer, fuehrerschein,
      kod95, adr, fahrerkarte, g25_medical, other.

  2. New Storage Bucket
    - `fleet-scans` - Private bucket for scanned document originals
      Path pattern: {companyId}/{random}_{filename}
      Policies restrict access to members of the owning company.

  3. Security
    - RLS enabled on fleet_scanned_documents
    - SELECT: all company members (including drivers) for their company
    - INSERT: company members (drivers allowed for self-scans)
    - UPDATE/DELETE: only company_admin / logistics_admin
    - Storage policies mirror the bucket folder naming (companyId prefix)

  4. Notes
    - Originals retained permanently for GoBD archival compliance
    - extracted_json contains the structured data returned by Claude Vision
    - linked_entity_type / linked_entity_id tie confirmed scans to vehicles or drivers
*/

CREATE TABLE IF NOT EXISTS fleet_scanned_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  uploaded_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  mode text NOT NULL DEFAULT 'vehicle',
  doc_category text NOT NULL DEFAULT 'other',
  storage_path text NOT NULL,
  file_name text NOT NULL DEFAULT '',
  file_mime text NOT NULL DEFAULT '',
  file_size integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'uploaded',
  detected_category text NOT NULL DEFAULT '',
  extracted_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_ocr_text text NOT NULL DEFAULT '',
  error_message text NOT NULL DEFAULT '',
  linked_entity_type text NOT NULL DEFAULT '',
  linked_entity_id uuid,
  target_entity_id uuid,
  confirmed_at timestamptz,
  confirmed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT fleet_scans_mode_check CHECK (mode IN ('vehicle', 'driver')),
  CONSTRAINT fleet_scans_status_check CHECK (status IN ('uploaded', 'processing', 'parsed', 'saved', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_fleet_scans_company ON fleet_scanned_documents(company_id);
CREATE INDEX IF NOT EXISTS idx_fleet_scans_status ON fleet_scanned_documents(company_id, status);
CREATE INDEX IF NOT EXISTS idx_fleet_scans_uploader ON fleet_scanned_documents(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_fleet_scans_linked ON fleet_scanned_documents(linked_entity_type, linked_entity_id);

ALTER TABLE fleet_scanned_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members view fleet scans"
  ON fleet_scanned_documents FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Company members insert fleet scans"
  ON fleet_scanned_documents FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND uploaded_by = auth.uid()
  );

CREATE POLICY "Admins update fleet scans"
  ON fleet_scanned_documents FOR UPDATE TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM profiles
      WHERE id = auth.uid() AND role IN ('company_admin', 'logistics_admin')
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM profiles
      WHERE id = auth.uid() AND role IN ('company_admin', 'logistics_admin')
    )
  );

CREATE POLICY "Admins delete fleet scans"
  ON fleet_scanned_documents FOR DELETE TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM profiles
      WHERE id = auth.uid() AND role IN ('company_admin', 'logistics_admin')
    )
  );

-- Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('fleet-scans', 'fleet-scans', false)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'fleet_scans_storage_select'
  ) THEN
    CREATE POLICY "fleet_scans_storage_select" ON storage.objects FOR SELECT TO authenticated
      USING (
        bucket_id = 'fleet-scans'
        AND (storage.foldername(name))[1] IN (SELECT company_id::text FROM profiles WHERE id = auth.uid())
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'fleet_scans_storage_insert'
  ) THEN
    CREATE POLICY "fleet_scans_storage_insert" ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'fleet-scans'
        AND (storage.foldername(name))[1] IN (SELECT company_id::text FROM profiles WHERE id = auth.uid())
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'fleet_scans_storage_delete'
  ) THEN
    CREATE POLICY "fleet_scans_storage_delete" ON storage.objects FOR DELETE TO authenticated
      USING (
        bucket_id = 'fleet-scans'
        AND (storage.foldername(name))[1] IN (
          SELECT company_id::text FROM profiles
          WHERE id = auth.uid() AND role IN ('company_admin', 'logistics_admin')
        )
      );
  END IF;
END $$;
