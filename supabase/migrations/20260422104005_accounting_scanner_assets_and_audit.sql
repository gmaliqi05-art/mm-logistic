/*
  # Accounting: scanner, fixed assets, audit log, document attachments

  1. New Tables
    - `acc_company_settings` - per-company accounting defaults (invoice prefix, footer, etc.)
    - `acc_fixed_assets` - investment/asset register with linear depreciation
    - `acc_scanned_documents` - uploaded docs for OCR with classification
    - `acc_audit_log` - append-only change history for acc_* tables

  2. Modified Tables
    - `acc_invoices`: +document_url, +document_mime
    - `acc_purchases`: +document_url, +document_mime
    - `acc_transactions`: +document_url, +document_mime, +fixed_asset_id

  3. Storage Buckets
    - `acc-documents` (private) - permanent document attachments
    - `acc-scans` (private) - raw uploaded scans before OCR

  4. Security
    - RLS enabled on all new tables, scoped by company_id through get_my_company_id()
*/

-- Document columns on existing tables
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='acc_invoices' AND column_name='document_url') THEN
    ALTER TABLE acc_invoices ADD COLUMN document_url text DEFAULT '';
    ALTER TABLE acc_invoices ADD COLUMN document_mime text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='acc_purchases' AND column_name='document_url') THEN
    ALTER TABLE acc_purchases ADD COLUMN document_url text DEFAULT '';
    ALTER TABLE acc_purchases ADD COLUMN document_mime text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='acc_transactions' AND column_name='document_url') THEN
    ALTER TABLE acc_transactions ADD COLUMN document_url text DEFAULT '';
    ALTER TABLE acc_transactions ADD COLUMN document_mime text DEFAULT '';
  END IF;
END $$;

-- acc_company_settings
CREATE TABLE IF NOT EXISTS acc_company_settings (
  company_id uuid PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  invoice_prefix text NOT NULL DEFAULT 'RE',
  purchase_prefix text NOT NULL DEFAULT 'BL',
  delivery_prefix text NOT NULL DEFAULT 'DN',
  default_currency text NOT NULL DEFAULT 'EUR',
  default_payment_days integer NOT NULL DEFAULT 14,
  default_vat_rate numeric NOT NULL DEFAULT 19,
  invoice_footer text NOT NULL DEFAULT '',
  bank_details_block text NOT NULL DEFAULT '',
  logo_url text NOT NULL DEFAULT '',
  chart_of_accounts text NOT NULL DEFAULT 'SKR03',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE acc_company_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "acc_settings_select" ON acc_company_settings FOR SELECT TO authenticated
  USING (company_id = get_my_company_id());
CREATE POLICY "acc_settings_insert" ON acc_company_settings FOR INSERT TO authenticated
  WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "acc_settings_update" ON acc_company_settings FOR UPDATE TO authenticated
  USING (company_id = get_my_company_id())
  WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "acc_settings_delete" ON acc_company_settings FOR DELETE TO authenticated
  USING (company_id = get_my_company_id());

-- acc_fixed_assets
CREATE TABLE IF NOT EXISTS acc_fixed_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'equipment',
  acquisition_date date NOT NULL,
  acquisition_cost numeric(12,2) NOT NULL DEFAULT 0,
  vat_amount numeric(12,2) NOT NULL DEFAULT 0,
  useful_life_years integer NOT NULL DEFAULT 5,
  depreciation_method text NOT NULL DEFAULT 'linear',
  monthly_depreciation numeric(12,2) NOT NULL DEFAULT 0,
  accumulated_depreciation numeric(12,2) NOT NULL DEFAULT 0,
  current_book_value numeric(12,2) NOT NULL DEFAULT 0,
  supplier_contact_id uuid REFERENCES acc_contacts(id) ON DELETE SET NULL,
  document_url text NOT NULL DEFAULT '',
  document_mime text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disposed')),
  disposed_date date,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_acc_assets_company ON acc_fixed_assets(company_id);
ALTER TABLE acc_fixed_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "acc_assets_select" ON acc_fixed_assets FOR SELECT TO authenticated
  USING (company_id = get_my_company_id());
CREATE POLICY "acc_assets_insert" ON acc_fixed_assets FOR INSERT TO authenticated
  WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "acc_assets_update" ON acc_fixed_assets FOR UPDATE TO authenticated
  USING (company_id = get_my_company_id())
  WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "acc_assets_delete" ON acc_fixed_assets FOR DELETE TO authenticated
  USING (company_id = get_my_company_id());

-- Link transactions to fixed asset
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='acc_transactions' AND column_name='fixed_asset_id') THEN
    ALTER TABLE acc_transactions ADD COLUMN fixed_asset_id uuid REFERENCES acc_fixed_assets(id) ON DELETE SET NULL;
  END IF;
END $$;

-- acc_scanned_documents
CREATE TABLE IF NOT EXISTS acc_scanned_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  uploaded_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  storage_path text NOT NULL,
  file_url text NOT NULL DEFAULT '',
  file_mime text NOT NULL DEFAULT '',
  file_size integer NOT NULL DEFAULT 0,
  detected_type text NOT NULL DEFAULT 'unknown' CHECK (detected_type IN ('purchase','expense','investment','sale','unknown')),
  chosen_type text NOT NULL DEFAULT 'unknown' CHECK (chosen_type IN ('purchase','expense','investment','sale','unknown')),
  status text NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded','parsed','saved','failed')),
  extracted_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_ocr_text text NOT NULL DEFAULT '',
  error_message text NOT NULL DEFAULT '',
  linked_entity_type text NOT NULL DEFAULT '',
  linked_entity_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_acc_scans_company ON acc_scanned_documents(company_id);
CREATE INDEX IF NOT EXISTS idx_acc_scans_status ON acc_scanned_documents(status);
ALTER TABLE acc_scanned_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "acc_scans_select" ON acc_scanned_documents FOR SELECT TO authenticated
  USING (company_id = get_my_company_id());
CREATE POLICY "acc_scans_insert" ON acc_scanned_documents FOR INSERT TO authenticated
  WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "acc_scans_update" ON acc_scanned_documents FOR UPDATE TO authenticated
  USING (company_id = get_my_company_id())
  WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "acc_scans_delete" ON acc_scanned_documents FOR DELETE TO authenticated
  USING (company_id = get_my_company_id());

-- acc_audit_log (append-only)
CREATE TABLE IF NOT EXISTS acc_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  user_id uuid,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('insert','update','delete')),
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_acc_audit_company ON acc_audit_log(company_id);
CREATE INDEX IF NOT EXISTS idx_acc_audit_entity ON acc_audit_log(entity_type, entity_id);
ALTER TABLE acc_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "acc_audit_select" ON acc_audit_log FOR SELECT TO authenticated
  USING (company_id = get_my_company_id());
CREATE POLICY "acc_audit_insert" ON acc_audit_log FOR INSERT TO authenticated
  WITH CHECK (company_id = get_my_company_id());

-- Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('acc-documents', 'acc-documents', false)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('acc-scans', 'acc-scans', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "acc_docs_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'acc-documents' AND (storage.foldername(name))[1] = get_my_company_id()::text);
CREATE POLICY "acc_docs_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'acc-documents' AND (storage.foldername(name))[1] = get_my_company_id()::text);
CREATE POLICY "acc_docs_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'acc-documents' AND (storage.foldername(name))[1] = get_my_company_id()::text);
CREATE POLICY "acc_docs_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'acc-documents' AND (storage.foldername(name))[1] = get_my_company_id()::text);

CREATE POLICY "acc_scans_storage_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'acc-scans' AND (storage.foldername(name))[1] = get_my_company_id()::text);
CREATE POLICY "acc_scans_storage_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'acc-scans' AND (storage.foldername(name))[1] = get_my_company_id()::text);
CREATE POLICY "acc_scans_storage_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'acc-scans' AND (storage.foldername(name))[1] = get_my_company_id()::text);
