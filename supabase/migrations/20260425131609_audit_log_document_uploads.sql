/*
  # Audit log for document uploads

  1. Purpose
    - Record every new file uploaded into the `documents` table (which holds
      Storage URLs for shared company files) into `audit_logs` for traceability.
    - Captures who uploaded what, the file name, type, size, and Storage URL.

  2. Tables touched
    - `audit_logs` (insert via trigger; no schema change)
    - `documents` (trigger added; no column change)

  3. Trigger
    - `documents_audit_insert` fires AFTER INSERT on `documents` for each row.
    - Calls `log_document_upload()` which inserts an `upload` action entry into
      `audit_logs` scoped to the document's `company_id` and `sender_id`.

  4. Security
    - Function is `SECURITY DEFINER` with explicit `search_path = public` so it
      can write to `audit_logs` regardless of caller RLS.
    - Only triggered by inserts that already passed the existing RLS policies
      on `documents`, so no privilege is granted beyond what the user already
      has.

  5. Notes
    - Idempotent: drops existing trigger/function before recreating.
    - No data is modified or deleted.
*/

CREATE OR REPLACE FUNCTION log_document_upload()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.sender_id IS NULL OR NEW.company_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO audit_logs (company_id, user_id, action, entity_type, entity_id, details)
  VALUES (
    NEW.company_id,
    NEW.sender_id,
    'upload',
    'document',
    NEW.id,
    jsonb_build_object(
      'title', NEW.title,
      'file_name', NEW.file_name,
      'file_size', NEW.file_size,
      'file_url', NEW.file_url,
      'document_type', NEW.document_type,
      'priority', NEW.priority
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS documents_audit_insert ON documents;
CREATE TRIGGER documents_audit_insert
  AFTER INSERT ON documents
  FOR EACH ROW
  EXECUTE FUNCTION log_document_upload();
