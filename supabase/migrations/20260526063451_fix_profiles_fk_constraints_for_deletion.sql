/*
  # Fix profiles FK constraints to allow user deletion

  1. Changes
    - Alter 27 foreign key constraints that reference profiles(id) without
      ON DELETE SET NULL or ON DELETE CASCADE
    - All changed to ON DELETE SET NULL so that deleting a profile preserves
      historical records (delivery notes, invoices, stock movements, etc.)
      while unlinking the deleted user reference

  2. Tables affected
    - acc_delivery_notes (created_by, assigned_driver_id, assigned_logistics_admin_id)
    - acc_invoices (created_by, dispatched_by)
    - acc_purchases (created_by)
    - acc_stock_movements (created_by)
    - acc_transactions (created_by)
    - attendance_records (modified_by)
    - audit_logs (user_id)
    - chat_messages (sender_id)
    - chat_participants (user_id)
    - chat_rooms (created_by)
    - companies (created_by)
    - delivery_notes (created_by, assigned_driver_id)
    - depots (manager_id)
    - document_recipients (recipient_id)
    - documents (sender_id)
    - leave_requests (approver_id, cancelled_by)
    - pallet_sorting_batches (created_by, completed_by)
    - stock_movements (performed_by)
    - support_messages (sender_id)
    - support_tickets (user_id)
    - work_hours_log (created_by)

  3. Why
    - Super admin needs to permanently delete users (wrong registrations,
      company requests) without being blocked by FK violations
    - Historical data is preserved with NULL references instead of being lost
*/

-- Helper: drop + re-create FK with ON DELETE SET NULL
-- Each block is idempotent (drops IF EXISTS then re-adds)

-- acc_delivery_notes
ALTER TABLE acc_delivery_notes DROP CONSTRAINT IF EXISTS acc_delivery_notes_created_by_fkey;
ALTER TABLE acc_delivery_notes ADD CONSTRAINT acc_delivery_notes_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE acc_delivery_notes DROP CONSTRAINT IF EXISTS acc_delivery_notes_assigned_driver_id_fkey;
ALTER TABLE acc_delivery_notes ADD CONSTRAINT acc_delivery_notes_assigned_driver_id_fkey
  FOREIGN KEY (assigned_driver_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE acc_delivery_notes DROP CONSTRAINT IF EXISTS acc_delivery_notes_assigned_logistics_admin_id_fkey;
ALTER TABLE acc_delivery_notes ADD CONSTRAINT acc_delivery_notes_assigned_logistics_admin_id_fkey
  FOREIGN KEY (assigned_logistics_admin_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- acc_invoices
ALTER TABLE acc_invoices DROP CONSTRAINT IF EXISTS acc_invoices_created_by_fkey;
ALTER TABLE acc_invoices ADD CONSTRAINT acc_invoices_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE acc_invoices DROP CONSTRAINT IF EXISTS acc_invoices_dispatched_by_fkey;
ALTER TABLE acc_invoices ADD CONSTRAINT acc_invoices_dispatched_by_fkey
  FOREIGN KEY (dispatched_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- acc_purchases
ALTER TABLE acc_purchases DROP CONSTRAINT IF EXISTS acc_purchases_created_by_fkey;
ALTER TABLE acc_purchases ADD CONSTRAINT acc_purchases_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- acc_stock_movements
ALTER TABLE acc_stock_movements DROP CONSTRAINT IF EXISTS acc_stock_movements_created_by_fkey;
ALTER TABLE acc_stock_movements ADD CONSTRAINT acc_stock_movements_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- acc_transactions
ALTER TABLE acc_transactions DROP CONSTRAINT IF EXISTS acc_transactions_created_by_fkey;
ALTER TABLE acc_transactions ADD CONSTRAINT acc_transactions_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- attendance_records
ALTER TABLE attendance_records DROP CONSTRAINT IF EXISTS attendance_records_modified_by_fkey;
ALTER TABLE attendance_records ADD CONSTRAINT attendance_records_modified_by_fkey
  FOREIGN KEY (modified_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- audit_logs
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- chat_messages
ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_sender_id_fkey;
ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_sender_id_fkey
  FOREIGN KEY (sender_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- chat_participants
ALTER TABLE chat_participants DROP CONSTRAINT IF EXISTS chat_participants_user_id_fkey;
ALTER TABLE chat_participants ADD CONSTRAINT chat_participants_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- chat_rooms
ALTER TABLE chat_rooms DROP CONSTRAINT IF EXISTS chat_rooms_created_by_fkey;
ALTER TABLE chat_rooms ADD CONSTRAINT chat_rooms_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- companies
ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_created_by_fkey;
ALTER TABLE companies ADD CONSTRAINT companies_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- delivery_notes
ALTER TABLE delivery_notes DROP CONSTRAINT IF EXISTS delivery_notes_created_by_fkey;
ALTER TABLE delivery_notes ADD CONSTRAINT delivery_notes_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE delivery_notes DROP CONSTRAINT IF EXISTS delivery_notes_assigned_driver_id_fkey;
ALTER TABLE delivery_notes ADD CONSTRAINT delivery_notes_assigned_driver_id_fkey
  FOREIGN KEY (assigned_driver_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- depots
ALTER TABLE depots DROP CONSTRAINT IF EXISTS depots_manager_id_fkey;
ALTER TABLE depots ADD CONSTRAINT depots_manager_id_fkey
  FOREIGN KEY (manager_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- document_recipients
ALTER TABLE document_recipients DROP CONSTRAINT IF EXISTS document_recipients_recipient_id_fkey;
ALTER TABLE document_recipients ADD CONSTRAINT document_recipients_recipient_id_fkey
  FOREIGN KEY (recipient_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- documents
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_sender_id_fkey;
ALTER TABLE documents ADD CONSTRAINT documents_sender_id_fkey
  FOREIGN KEY (sender_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- leave_requests
ALTER TABLE leave_requests DROP CONSTRAINT IF EXISTS leave_requests_approver_id_fkey;
ALTER TABLE leave_requests ADD CONSTRAINT leave_requests_approver_id_fkey
  FOREIGN KEY (approver_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE leave_requests DROP CONSTRAINT IF EXISTS leave_requests_cancelled_by_fkey;
ALTER TABLE leave_requests ADD CONSTRAINT leave_requests_cancelled_by_fkey
  FOREIGN KEY (cancelled_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- pallet_sorting_batches
ALTER TABLE pallet_sorting_batches DROP CONSTRAINT IF EXISTS pallet_sorting_batches_created_by_fkey;
ALTER TABLE pallet_sorting_batches ADD CONSTRAINT pallet_sorting_batches_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE pallet_sorting_batches DROP CONSTRAINT IF EXISTS pallet_sorting_batches_completed_by_fkey;
ALTER TABLE pallet_sorting_batches ADD CONSTRAINT pallet_sorting_batches_completed_by_fkey
  FOREIGN KEY (completed_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- stock_movements
ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_performed_by_fkey;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_performed_by_fkey
  FOREIGN KEY (performed_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- support_messages
ALTER TABLE support_messages DROP CONSTRAINT IF EXISTS support_messages_sender_id_fkey;
ALTER TABLE support_messages ADD CONSTRAINT support_messages_sender_id_fkey
  FOREIGN KEY (sender_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- support_tickets
ALTER TABLE support_tickets DROP CONSTRAINT IF EXISTS support_tickets_user_id_fkey;
ALTER TABLE support_tickets ADD CONSTRAINT support_tickets_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- work_hours_log
ALTER TABLE work_hours_log DROP CONSTRAINT IF EXISTS work_hours_log_created_by_fkey;
ALTER TABLE work_hours_log ADD CONSTRAINT work_hours_log_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- Also make NOT NULL columns nullable where they reference profiles
-- so SET NULL can actually work
DO $$
BEGIN
  -- delivery_notes.created_by
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'delivery_notes' AND column_name = 'created_by' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE delivery_notes ALTER COLUMN created_by DROP NOT NULL;
  END IF;

  -- stock_movements.performed_by
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stock_movements' AND column_name = 'performed_by' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE stock_movements ALTER COLUMN performed_by DROP NOT NULL;
  END IF;

  -- chat_messages.sender_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chat_messages' AND column_name = 'sender_id' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE chat_messages ALTER COLUMN sender_id DROP NOT NULL;
  END IF;

  -- chat_rooms.created_by
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chat_rooms' AND column_name = 'created_by' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE chat_rooms ALTER COLUMN created_by DROP NOT NULL;
  END IF;

  -- chat_participants.user_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chat_participants' AND column_name = 'user_id' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE chat_participants ALTER COLUMN user_id DROP NOT NULL;
  END IF;

  -- acc_delivery_notes.created_by
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acc_delivery_notes' AND column_name = 'created_by' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE acc_delivery_notes ALTER COLUMN created_by DROP NOT NULL;
  END IF;

  -- acc_invoices.created_by
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acc_invoices' AND column_name = 'created_by' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE acc_invoices ALTER COLUMN created_by DROP NOT NULL;
  END IF;

  -- acc_purchases.created_by
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acc_purchases' AND column_name = 'created_by' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE acc_purchases ALTER COLUMN created_by DROP NOT NULL;
  END IF;

  -- acc_stock_movements.created_by
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acc_stock_movements' AND column_name = 'created_by' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE acc_stock_movements ALTER COLUMN created_by DROP NOT NULL;
  END IF;

  -- acc_transactions.created_by
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acc_transactions' AND column_name = 'created_by' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE acc_transactions ALTER COLUMN created_by DROP NOT NULL;
  END IF;

  -- pallet_sorting_batches.created_by
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pallet_sorting_batches' AND column_name = 'created_by' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE pallet_sorting_batches ALTER COLUMN created_by DROP NOT NULL;
  END IF;

  -- support_tickets.user_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'support_tickets' AND column_name = 'user_id' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE support_tickets ALTER COLUMN user_id DROP NOT NULL;
  END IF;

  -- support_messages.sender_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'support_messages' AND column_name = 'sender_id' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE support_messages ALTER COLUMN sender_id DROP NOT NULL;
  END IF;
END $$;
