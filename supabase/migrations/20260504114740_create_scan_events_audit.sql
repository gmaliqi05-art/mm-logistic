/*
  # Scan Events Audit Log

  1. New Tables
    - `scan_events` - audit trail of every QR/barcode scan
      - id, company_id, user_id
      - scanned_code text
      - format text ('QR_CODE','CODE_128','EAN_13','MANUAL', ...)
      - context text ('receiving','sorting','stock','delivery','pallet')
      - matched_entity_id uuid nullable
      - matched_type text nullable
      - scanned_at timestamptz default now()

  2. Security
    - RLS enabled
    - Users insert rows for their own company
    - Company staff read company rows
*/

CREATE TABLE IF NOT EXISTS scan_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  scanned_code text NOT NULL,
  format text NOT NULL DEFAULT 'QR_CODE',
  context text NOT NULL DEFAULT 'general',
  matched_entity_id uuid,
  matched_type text,
  scanned_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scan_events_company_time ON scan_events (company_id, scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_events_code ON scan_events (scanned_code);

ALTER TABLE scan_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert scan events for own company"
  ON scan_events FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Company staff read scan events"
  ON scan_events FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
      AND p.company_id = scan_events.company_id
      AND p.role IN ('company_admin','accountant','logistics','dispatcher','depot','super_admin'))
  );
