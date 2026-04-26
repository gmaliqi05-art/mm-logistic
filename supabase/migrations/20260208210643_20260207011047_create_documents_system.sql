/*
  # Document Exchange System

  1. New Tables
    - `documents`
      - `id` (uuid, primary key)
      - `company_id` (uuid, references companies) - company context
      - `sender_id` (uuid, references profiles) - who sent the document
      - `title` (text) - document title/name
      - `description` (text) - optional description
      - `document_type` (text) - type: delivery_note, invoice, report, photo, contract, other
      - `file_url` (text) - URL to the uploaded file
      - `file_name` (text) - original file name
      - `file_size` (integer) - file size in bytes
      - `priority` (text) - normal or urgent
      - `is_reply_to` (uuid, nullable) - if this is a reply/response to another document
      - `created_at` (timestamptz)

    - `document_recipients`
      - `id` (uuid, primary key)
      - `document_id` (uuid, references documents)
      - `recipient_id` (uuid, references profiles)
      - `status` (text) - sent, delivered, viewed, signed, completed
      - `viewed_at` (timestamptz, nullable)
      - `signed_at` (timestamptz, nullable)
      - `signed_file_url` (text) - URL to signed/scanned file uploaded by recipient
      - `notes` (text) - recipient notes/comments
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - Policies for authenticated users based on company membership
*/

CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id),
  sender_id uuid NOT NULL REFERENCES profiles(id),
  title text NOT NULL DEFAULT '',
  description text DEFAULT '',
  document_type text NOT NULL DEFAULT 'other',
  file_url text NOT NULL DEFAULT '',
  file_name text DEFAULT '',
  file_size integer DEFAULT 0,
  priority text NOT NULL DEFAULT 'normal',
  is_reply_to uuid REFERENCES documents(id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS document_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES profiles(id),
  status text NOT NULL DEFAULT 'sent',
  viewed_at timestamptz,
  signed_at timestamptz,
  signed_file_url text DEFAULT '',
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documents_company_id ON documents(company_id);
CREATE INDEX IF NOT EXISTS idx_documents_sender_id ON documents(sender_id);
CREATE INDEX IF NOT EXISTS idx_documents_is_reply_to ON documents(is_reply_to);
CREATE INDEX IF NOT EXISTS idx_document_recipients_document_id ON document_recipients(document_id);
CREATE INDEX IF NOT EXISTS idx_document_recipients_recipient_id ON document_recipients(recipient_id);
CREATE INDEX IF NOT EXISTS idx_document_recipients_status ON document_recipients(status);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view documents they sent"
  ON documents FOR SELECT
  TO authenticated
  USING (sender_id = auth.uid());

CREATE POLICY "Users can view documents sent to them"
  ON documents FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM document_recipients
      WHERE document_recipients.document_id = documents.id
      AND document_recipients.recipient_id = auth.uid()
    )
  );

CREATE POLICY "Company admins can view all company documents"
  ON documents FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'company_admin'
      AND profiles.company_id = documents.company_id
    )
  );

CREATE POLICY "Authenticated users can insert documents"
  ON documents FOR INSERT
  TO authenticated
  WITH CHECK (sender_id = auth.uid());

CREATE POLICY "Recipients can view their document entries"
  ON document_recipients FOR SELECT
  TO authenticated
  USING (recipient_id = auth.uid());

CREATE POLICY "Document senders can view recipients"
  ON document_recipients FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_recipients.document_id
      AND documents.sender_id = auth.uid()
    )
  );

CREATE POLICY "Company admins can view all company document recipients"
  ON document_recipients FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM documents
      JOIN profiles ON profiles.id = auth.uid()
      WHERE documents.id = document_recipients.document_id
      AND profiles.role = 'company_admin'
      AND profiles.company_id = documents.company_id
    )
  );

CREATE POLICY "Document senders can insert recipients"
  ON document_recipients FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_recipients.document_id
      AND documents.sender_id = auth.uid()
    )
  );

CREATE POLICY "Recipients can update their own status"
  ON document_recipients FOR UPDATE
  TO authenticated
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());