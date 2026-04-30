/*
  # Scan review workflow and auto-company detection

  1. Changes to acc_scanned_documents
    - Adds structured suggestion fields populated by the scan edge function
      when the extracted supplier/customer does not match an existing contact:
      suggested_contact_name, suggested_contact_vat, suggested_contact_tax,
      suggested_contact_email, suggested_contact_phone,
      suggested_contact_address, suggested_contact_city,
      suggested_contact_postal_code, suggested_contact_country,
      suggested_contact_iban, suggested_contact_bic.
    - Adds match_confidence (0..1) and routing_decision enum-like text:
      'auto_saved' | 'pending_confirmation' | 'new_company_required'.
    - Adds file_hash for duplicate detection.

  2. Changes to acc_contacts
    - source_document_id (uuid, nullable) FK to acc_scanned_documents.
    - auto_created_at timestamptz nullable.
    - Unique partial index on (company_id, lower(vat_number)) when vat_number
      is not empty to prevent accidental duplicates.

  3. Security
    - No new tables, RLS already enforced on acc_contacts and
      acc_scanned_documents. All new columns inherit existing policies.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name='acc_scanned_documents' AND column_name='suggested_contact_name') THEN
    ALTER TABLE acc_scanned_documents
      ADD COLUMN suggested_contact_name text DEFAULT '',
      ADD COLUMN suggested_contact_vat text DEFAULT '',
      ADD COLUMN suggested_contact_tax text DEFAULT '',
      ADD COLUMN suggested_contact_email text DEFAULT '',
      ADD COLUMN suggested_contact_phone text DEFAULT '',
      ADD COLUMN suggested_contact_address text DEFAULT '',
      ADD COLUMN suggested_contact_city text DEFAULT '',
      ADD COLUMN suggested_contact_postal_code text DEFAULT '',
      ADD COLUMN suggested_contact_country text DEFAULT '',
      ADD COLUMN suggested_contact_iban text DEFAULT '',
      ADD COLUMN suggested_contact_bic text DEFAULT '',
      ADD COLUMN match_confidence numeric(4,3) DEFAULT 0,
      ADD COLUMN routing_decision text DEFAULT 'pending_confirmation',
      ADD COLUMN file_hash text DEFAULT '';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name='acc_contacts' AND column_name='source_document_id') THEN
    ALTER TABLE acc_contacts
      ADD COLUMN source_document_id uuid REFERENCES acc_scanned_documents(id) ON DELETE SET NULL,
      ADD COLUMN auto_created_at timestamptz;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_acc_contacts_unique_vat_per_company
  ON acc_contacts (company_id, lower(vat_number))
  WHERE vat_number IS NOT NULL AND vat_number <> '';

CREATE INDEX IF NOT EXISTS idx_acc_scanned_documents_routing_decision
  ON acc_scanned_documents (company_id, routing_decision);

CREATE INDEX IF NOT EXISTS idx_acc_scanned_documents_file_hash
  ON acc_scanned_documents (company_id, file_hash)
  WHERE file_hash IS NOT NULL AND file_hash <> '';
