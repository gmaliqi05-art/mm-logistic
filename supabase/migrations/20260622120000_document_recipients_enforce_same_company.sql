/*
  # Enforce same-company recipients on document_recipients INSERT

  The existing INSERT policy on `document_recipients` only verifies the
  caller is the sender of the parent document via `is_document_sender`.
  It does NOT verify that the recipient belongs to the same company as
  the document. A sender who knows or guesses a profile UUID from a
  different tenant can therefore attach that user as a recipient,
  voluntarily leaking the document across the tenant boundary and
  creating an in-platform phishing vector.

  This migration tightens the WITH CHECK so the recipient's
  `profiles.company_id` must match the document's `company_id`.
  Super_admin is intentionally allowed to bypass for cross-tenant
  support flows (matching the rest of the isolation model).
*/

DROP POLICY IF EXISTS "Senders can insert recipients" ON document_recipients;

CREATE POLICY "Senders can insert recipients"
  ON document_recipients FOR INSERT
  TO authenticated
  WITH CHECK (
    private.is_document_sender(document_id)
    AND (
      private.is_super_admin()
      OR EXISTS (
        SELECT 1
        FROM documents d
        JOIN profiles p ON p.id = document_recipients.recipient_id
        WHERE d.id = document_recipients.document_id
          AND d.company_id = p.company_id
      )
    )
  );
