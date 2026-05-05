/*
  # Driver delivery proofs

  1. New Tables
    - `delivery_proofs`
      - Captures driver proof-of-dispatch artifacts for a delivery note:
        photo of goods (required), optional signature or stamp photo,
        GPS location, and capture timestamp
      - Fields: id, delivery_note_id (FK), company_id (FK), captured_by_profile_id (FK),
        photo_url, signature_url, gps_lat, gps_lng, captured_at, created_at

  2. Security
    - Enable RLS on delivery_proofs
    - Driver that owns the delivery note can INSERT
    - Members of the company can SELECT their proofs
    - No UPDATE / DELETE policies (append-only audit trail)

  3. Indexes
    - On delivery_note_id for fast per-note lookups
    - On company_id for tenancy filters
*/

CREATE TABLE IF NOT EXISTS delivery_proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_note_id uuid NOT NULL REFERENCES delivery_notes(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  captured_by_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  photo_url text NOT NULL DEFAULT '',
  signature_url text DEFAULT '',
  gps_lat double precision,
  gps_lng double precision,
  captured_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_proofs_note ON delivery_proofs(delivery_note_id);
CREATE INDEX IF NOT EXISTS idx_delivery_proofs_company ON delivery_proofs(company_id);

ALTER TABLE delivery_proofs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'delivery_proofs' AND policyname = 'Company members can view delivery proofs'
  ) THEN
    CREATE POLICY "Company members can view delivery proofs"
      ON delivery_proofs FOR SELECT
      TO authenticated
      USING (
        company_id IN (
          SELECT company_id FROM profiles WHERE id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'delivery_proofs' AND policyname = 'Assigned driver can insert delivery proof'
  ) THEN
    CREATE POLICY "Assigned driver can insert delivery proof"
      ON delivery_proofs FOR INSERT
      TO authenticated
      WITH CHECK (
        captured_by_profile_id = auth.uid()
        AND EXISTS (
          SELECT 1 FROM delivery_notes dn
          WHERE dn.id = delivery_proofs.delivery_note_id
            AND dn.company_id = delivery_proofs.company_id
            AND (dn.assigned_driver_id = auth.uid() OR dn.created_by = auth.uid())
        )
      );
  END IF;
END $$;
