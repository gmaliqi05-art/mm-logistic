/*
  # Fix notification type in delivery_notes_notify trigger

  Use 'delivery_note' type (valid per notifications_type_check constraint) instead of 'delivery'.
*/

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
    IF NEW.assigned_driver_id IS NOT NULL AND NEW.status <> 'draft' THEN
      INSERT INTO notifications (user_id, title, message, type, reference_id)
      VALUES (
        NEW.assigned_driver_id,
        type_label || ' e re',
        'Ju eshte caktuar ' || lower(type_label) || ' ' || note_label,
        'delivery_note',
        NEW.id
      );
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.assigned_driver_id IS DISTINCT FROM OLD.assigned_driver_id
       AND NEW.assigned_driver_id IS NOT NULL
       AND NEW.status <> 'draft' THEN
      INSERT INTO notifications (user_id, title, message, type, reference_id)
      VALUES (
        NEW.assigned_driver_id,
        type_label || ' e caktuar',
        'Ju eshte caktuar ' || lower(type_label) || ' ' || note_label,
        'delivery_note',
        NEW.id
      );
    END IF;

    IF OLD.status = 'draft' AND NEW.status = 'sent' AND NEW.assigned_driver_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, title, message, type, reference_id)
      VALUES (
        NEW.assigned_driver_id,
        type_label || ' e re',
        'Ju eshte caktuar ' || lower(type_label) || ' ' || note_label,
        'delivery_note',
        NEW.id
      );
    END IF;

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
          'delivery_note',
          NEW.id
        );
      END LOOP;
    END IF;

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
          'delivery_note',
          NEW.id
        );
      END LOOP;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
