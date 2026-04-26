/*
  # Fix Documents RLS Infinite Recursion

  The documents and document_recipients tables have circular RLS references.
  This migration fixes it by:
  1. Dropping the problematic policies
  2. Creating security definer helper functions to bypass RLS checks
  3. Recreating policies using those functions

  ## Changes
  - Drop all existing policies on documents and document_recipients
  - Create `is_document_recipient(uuid)` function
  - Create `is_document_sender(uuid)` function
  - Create `get_user_company_id()` function (if not exists)
  - Recreate non-recursive policies
*/

DROP POLICY IF EXISTS "Users can view documents they sent" ON documents;
DROP POLICY IF EXISTS "Users can view documents sent to them" ON documents;
DROP POLICY IF EXISTS "Company admins can view all company documents" ON documents;
DROP POLICY IF EXISTS "Authenticated users can insert documents" ON documents;

DROP POLICY IF EXISTS "Recipients can view their document entries" ON document_recipients;
DROP POLICY IF EXISTS "Document senders can view recipients" ON document_recipients;
DROP POLICY IF EXISTS "Company admins can view all company document recipients" ON document_recipients;
DROP POLICY IF EXISTS "Document senders can insert recipients" ON document_recipients;
DROP POLICY IF EXISTS "Recipients can update their own status" ON document_recipients;

CREATE OR REPLACE FUNCTION is_document_recipient(doc_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM document_recipients
    WHERE document_recipients.document_id = doc_id
    AND document_recipients.recipient_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION is_document_sender(doc_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM documents
    WHERE documents.id = doc_id
    AND documents.sender_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION get_document_company_id(doc_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM documents WHERE id = doc_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION get_user_role_and_company()
RETURNS TABLE(role text, company_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.role::text, p.company_id FROM profiles p WHERE p.id = auth.uid() LIMIT 1;
$$;

-- Documents policies (no references to document_recipients)

CREATE POLICY "Users can view documents they sent"
  ON documents FOR SELECT
  TO authenticated
  USING (sender_id = auth.uid());

CREATE POLICY "Users can view documents sent to them"
  ON documents FOR SELECT
  TO authenticated
  USING (is_document_recipient(id));

CREATE POLICY "Company admins can view all company documents"
  ON documents FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT gu.company_id FROM get_user_role_and_company() gu
      WHERE gu.role = 'company_admin'
    )
  );

CREATE POLICY "Authenticated users can insert documents"
  ON documents FOR INSERT
  TO authenticated
  WITH CHECK (sender_id = auth.uid());

-- Document recipients policies (no references to documents)

CREATE POLICY "Recipients can view their entries"
  ON document_recipients FOR SELECT
  TO authenticated
  USING (recipient_id = auth.uid());

CREATE POLICY "Senders can view recipients"
  ON document_recipients FOR SELECT
  TO authenticated
  USING (is_document_sender(document_id));

CREATE POLICY "Company admins can view company doc recipients"
  ON document_recipients FOR SELECT
  TO authenticated
  USING (
    get_document_company_id(document_id) IN (
      SELECT gu.company_id FROM get_user_role_and_company() gu
      WHERE gu.role = 'company_admin'
    )
  );

CREATE POLICY "Senders can insert recipients"
  ON document_recipients FOR INSERT
  TO authenticated
  WITH CHECK (is_document_sender(document_id));

CREATE POLICY "Recipients can update own status"
  ON document_recipients FOR UPDATE
  TO authenticated
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());
