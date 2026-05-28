/*
  # Enable safe deletion of draft invoices

  1. Changes
    - Add AFTER DELETE trigger on `acc_invoices` to clear `delivery_notes.invoiced_at`
      when an invoice is deleted (mirrors the existing cancel trigger behavior)
    - Change `acc_transactions.invoice_id` FK to ON DELETE SET NULL so that deleting
      an invoice does not fail with a FK violation
    - Change `acc_journal_entries.invoice_id` FK to ON DELETE SET NULL (same reason)

  2. Important Notes
    - The UI will only allow deletion of "draft" invoices, but the DB trigger handles
      any deletion safely regardless of status
    - `acc_invoice_items` and `acc_invoice_reminders` already CASCADE on delete
    - `delivery_notes.acc_invoice_id` already SET NULL on delete
    - This migration only adds the missing cleanup for `invoiced_at` and relaxes
      the restrictive FK constraints that would block deletion
*/

-- 1. Trigger function to clear delivery_notes.invoiced_at on invoice deletion
CREATE OR REPLACE FUNCTION private.unlink_delivery_notes_on_invoice_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.delivery_note_id IS NOT NULL THEN
    UPDATE delivery_notes
    SET invoiced_at = NULL,
        updated_at = now()
    WHERE id = OLD.delivery_note_id;
  END IF;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION private.unlink_delivery_notes_on_invoice_delete() FROM PUBLIC;

-- 2. Attach the trigger
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_unlink_dn_on_invoice_delete'
  ) THEN
    CREATE TRIGGER trg_unlink_dn_on_invoice_delete
      AFTER DELETE ON acc_invoices
      FOR EACH ROW
      EXECUTE FUNCTION private.unlink_delivery_notes_on_invoice_delete();
  END IF;
END $$;

-- 3. Relax acc_transactions.invoice_id FK to SET NULL on delete
DO $$
DECLARE
  v_constraint_name text;
BEGIN
  SELECT tc.constraint_name INTO v_constraint_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
  WHERE tc.table_name = 'acc_transactions'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'invoice_id'
  LIMIT 1;

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE acc_transactions DROP CONSTRAINT %I', v_constraint_name);
    ALTER TABLE acc_transactions
      ADD CONSTRAINT acc_transactions_invoice_id_fkey
      FOREIGN KEY (invoice_id) REFERENCES acc_invoices(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 4. Relax acc_journal_entries.invoice_id FK to SET NULL on delete (if exists)
DO $$
DECLARE
  v_constraint_name text;
BEGIN
  SELECT tc.constraint_name INTO v_constraint_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
  WHERE tc.table_name = 'acc_journal_entries'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'invoice_id'
  LIMIT 1;

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE acc_journal_entries DROP CONSTRAINT %I', v_constraint_name);
    ALTER TABLE acc_journal_entries
      ADD CONSTRAINT acc_journal_entries_invoice_id_fkey
      FOREIGN KEY (invoice_id) REFERENCES acc_invoices(id) ON DELETE SET NULL;
  END IF;
END $$;
