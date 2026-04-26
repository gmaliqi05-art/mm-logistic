/*
  # Driver Workflow Notifications, Dispatched Timestamp, and Chat Read Tracking

  1. Changes
    - Add `dispatched_at` (timestamptz) to `delivery_notes` for tracking when driver starts the trip
    - Add `last_read_at` (timestamptz) to `chat_participants` for unread-message tracking
    - Auto-stamp `dispatched_at` when status transitions into `in_transit`
    - Create triggers that insert rows into `notifications` on:
      a) assignment of a driver (new row with `assigned_driver_id`)
      b) dispatch (status sent/draft -> in_transit): notify company admins
      c) delivery (status -> delivered): notify company admins
      d) reassignment of an existing note to a different driver
    - Indexes for performance

  2. Security
    - Notifications table RLS already restricts by user_id (existing policies)
    - All insert logic runs with SECURITY DEFINER to bypass RLS when triggers fire
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='delivery_notes' AND column_name='dispatched_at'
  ) THEN
    ALTER TABLE delivery_notes ADD COLUMN dispatched_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='chat_participants' AND column_name='last_read_at'
  ) THEN
    ALTER TABLE chat_participants ADD COLUMN last_read_at timestamptz DEFAULT now();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_delivery_notes_dispatched_at ON delivery_notes(dispatched_at);
CREATE INDEX IF NOT EXISTS idx_chat_participants_last_read_at ON chat_participants(room_id, user_id, last_read_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read, created_at DESC);

-- Update the existing auto_status trigger function to also stamp dispatched_at
CREATE OR REPLACE FUNCTION public.delivery_notes_auto_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Auto mark delivered when scanned photo uploaded for delivery type
    IF NEW.scanned_photo_url IS NOT NULL
       AND (OLD.scanned_photo_url IS NULL OR OLD.scanned_photo_url = '')
       AND COALESCE(NEW.type,'delivery') = 'delivery'
       AND NEW.status IN ('sent','in_transit','draft') THEN
      NEW.status := 'delivered';
      IF NEW.delivered_at IS NULL THEN
        NEW.delivered_at := now();
      END IF;
    END IF;

    -- Stamp delivered_at on delivered transition
    IF NEW.status = 'delivered' AND OLD.status <> 'delivered' AND NEW.delivered_at IS NULL THEN
      NEW.delivered_at := now();
    END IF;

    -- Stamp confirmed_at on confirmed transition
    IF NEW.status = 'confirmed' AND OLD.status <> 'confirmed' AND NEW.confirmed_at IS NULL THEN
      NEW.confirmed_at := now();
    END IF;

    -- Stamp dispatched_at on in_transit transition
    IF NEW.status = 'in_transit' AND OLD.status <> 'in_transit' AND NEW.dispatched_at IS NULL THEN
      NEW.dispatched_at := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Function to create notifications for delivery workflow
CREATE OR REPLACE FUNCTION public.delivery_notes_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_id uuid;
  type_label text;
  note_label text;
BEGIN
  note_label := COALESCE(NEW.note_number, 'pa numer');
  IF COALESCE(NEW.type,'delivery') = 'pickup' THEN
    type_label := 'Fletemarrje';
  ELSE
    type_label := 'Fletedergese';
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Notify driver on new assignment
    IF NEW.assigned_driver_id IS NOT NULL AND NEW.status <> 'draft' THEN
      INSERT INTO notifications (user_id, title, message, type, reference_id)
      VALUES (
        NEW.assigned_driver_id,
        type_label || ' e re',
        'Ju eshte caktuar ' || lower(type_label) || ' ' || note_label,
        'delivery',
        NEW.id
      );
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Driver reassigned
    IF NEW.assigned_driver_id IS DISTINCT FROM OLD.assigned_driver_id
       AND NEW.assigned_driver_id IS NOT NULL
       AND NEW.status <> 'draft' THEN
      INSERT INTO notifications (user_id, title, message, type, reference_id)
      VALUES (
        NEW.assigned_driver_id,
        type_label || ' e caktuar',
        'Ju eshte caktuar ' || lower(type_label) || ' ' || note_label,
        'delivery',
        NEW.id
      );
    END IF;

    -- Status published from draft -> sent, notify assigned driver
    IF OLD.status = 'draft' AND NEW.status = 'sent' AND NEW.assigned_driver_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, title, message, type, reference_id)
      VALUES (
        NEW.assigned_driver_id,
        type_label || ' e re',
        'Ju eshte caktuar ' || lower(type_label) || ' ' || note_label,
        'delivery',
        NEW.id
      );
    END IF;

    -- Dispatch: notify company admins
    IF NEW.status = 'in_transit' AND OLD.status <> 'in_transit' THEN
      FOR admin_id IN
        SELECT p.id FROM profiles p
        WHERE p.company_id = NEW.company_id
          AND p.role IN ('company_admin','accountant')
      LOOP
        INSERT INTO notifications (user_id, title, message, type, reference_id)
        VALUES (
          admin_id,
          type_label || ' u nis',
          'Shoferi u nis me ' || lower(type_label) || ' ' || note_label,
          'delivery',
          NEW.id
        );
      END LOOP;
    END IF;

    -- Delivered: notify company admins
    IF NEW.status = 'delivered' AND OLD.status <> 'delivered' THEN
      FOR admin_id IN
        SELECT p.id FROM profiles p
        WHERE p.company_id = NEW.company_id
          AND p.role IN ('company_admin','accountant')
      LOOP
        INSERT INTO notifications (user_id, title, message, type, reference_id)
        VALUES (
          admin_id,
          type_label || ' e perfunduar',
          lower(type_label) || ' ' || note_label || ' u dorezua',
          'delivery',
          NEW.id
        );
      END LOOP;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_delivery_notes_notify_ins ON delivery_notes;
DROP TRIGGER IF EXISTS trg_delivery_notes_notify_upd ON delivery_notes;

CREATE TRIGGER trg_delivery_notes_notify_ins
AFTER INSERT ON delivery_notes
FOR EACH ROW EXECUTE FUNCTION public.delivery_notes_notify();

CREATE TRIGGER trg_delivery_notes_notify_upd
AFTER UPDATE ON delivery_notes
FOR EACH ROW EXECUTE FUNCTION public.delivery_notes_notify();

-- Ensure notifications table is part of realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND tablename='notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;
END $$;
