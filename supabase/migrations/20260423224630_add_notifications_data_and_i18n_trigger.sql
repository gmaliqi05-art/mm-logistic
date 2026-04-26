/*
  # Localizable notifications

  1. New column
     - notifications.data (jsonb, default '{}') — holds an event key and any
       parameters (note_type, note_number, ...) so the frontend can render
       the notification in the user's selected language instead of the
       Albanian text that the database used to embed.
  2. Trigger update
     - delivery_notes_notify() now also writes a data payload with an event
       identifier (assigned / sent_to_driver / in_transit / delivered) plus
       note_type and note_number. The Albanian title/message are still
       populated as a safe fallback for older clients.

  Notes:
    - No existing notifications are deleted; they simply miss the data
      payload and keep rendering as they used to.
    - Trigger is idempotently replaced with CREATE OR REPLACE.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='notifications' AND column_name='data'
  ) THEN
    ALTER TABLE notifications ADD COLUMN data jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;

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
  note_type text;
BEGIN
  note_label := COALESCE(NEW.note_number, 'pa numer');
  note_type := COALESCE(NEW.type, 'delivery');
  IF note_type = 'pickup' THEN
    type_label := 'Fletemarrje';
  ELSE
    type_label := 'Fletedergese';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.assigned_driver_id IS NOT NULL AND NEW.status <> 'draft' THEN
      INSERT INTO notifications (user_id, title, message, type, reference_id, data)
      VALUES (
        NEW.assigned_driver_id,
        type_label || ' e re',
        'Ju eshte caktuar ' || lower(type_label) || ' ' || note_label,
        'delivery_note',
        NEW.id,
        jsonb_build_object('event', 'assigned', 'note_type', note_type, 'note_number', note_label)
      );
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.assigned_driver_id IS DISTINCT FROM OLD.assigned_driver_id
       AND NEW.assigned_driver_id IS NOT NULL
       AND NEW.status <> 'draft' THEN
      INSERT INTO notifications (user_id, title, message, type, reference_id, data)
      VALUES (
        NEW.assigned_driver_id,
        type_label || ' e caktuar',
        'Ju eshte caktuar ' || lower(type_label) || ' ' || note_label,
        'delivery_note',
        NEW.id,
        jsonb_build_object('event', 'assigned', 'note_type', note_type, 'note_number', note_label)
      );
    END IF;

    IF OLD.status = 'draft' AND NEW.status = 'sent' AND NEW.assigned_driver_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, title, message, type, reference_id, data)
      VALUES (
        NEW.assigned_driver_id,
        type_label || ' e re',
        'Ju eshte caktuar ' || lower(type_label) || ' ' || note_label,
        'delivery_note',
        NEW.id,
        jsonb_build_object('event', 'sent_to_driver', 'note_type', note_type, 'note_number', note_label)
      );
    END IF;

    IF NEW.status = 'in_transit' AND OLD.status <> 'in_transit' THEN
      FOR admin_id IN
        SELECT p.id FROM profiles p
        WHERE p.company_id = NEW.company_id
          AND p.role IN ('company_admin','accountant')
      LOOP
        INSERT INTO notifications (user_id, title, message, type, reference_id, data)
        VALUES (
          admin_id,
          type_label || ' u nis',
          'Shoferi u nis me ' || lower(type_label) || ' ' || note_label,
          'delivery_note',
          NEW.id,
          jsonb_build_object('event', 'in_transit', 'note_type', note_type, 'note_number', note_label)
        );
      END LOOP;
    END IF;

    IF NEW.status = 'delivered' AND OLD.status <> 'delivered' THEN
      FOR admin_id IN
        SELECT p.id FROM profiles p
        WHERE p.company_id = NEW.company_id
          AND p.role IN ('company_admin','accountant')
      LOOP
        INSERT INTO notifications (user_id, title, message, type, reference_id, data)
        VALUES (
          admin_id,
          type_label || ' e perfunduar',
          lower(type_label) || ' ' || note_label || ' u dorezua',
          'delivery_note',
          NEW.id,
          jsonb_build_object('event', 'delivered', 'note_type', note_type, 'note_number', note_label)
        );
      END LOOP;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
