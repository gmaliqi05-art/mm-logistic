/*
  # Notify drivers when a delivery note is reassigned

  When a company admin changes `assigned_driver_id` on an existing
  delivery note (any status), the previous driver should learn the note
  was reassigned and the new driver should learn it was assigned to them.
  Extends `delivery_notes_notify` with two extra inserts on UPDATE when
  the driver column changes.

  1. Modified objects
    - function delivery_notes_notify(): add reassignment branch.

  2. Security
    - SECURITY DEFINER function unchanged, no policy changes required.
*/

CREATE OR REPLACE FUNCTION delivery_notes_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  type_label text;
  note_type text := COALESCE(NEW.type, 'delivery');
  note_label text := COALESCE(NEW.note_number, '');
BEGIN
  IF note_type = 'pickup' THEN
    type_label := 'Marrje';
  ELSE
    type_label := 'Dergese';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'sent' AND NEW.assigned_driver_id IS NOT NULL THEN
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
    RETURN NEW;
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

  IF NEW.assigned_driver_id IS DISTINCT FROM OLD.assigned_driver_id THEN
    IF OLD.assigned_driver_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, title, message, type, reference_id, data)
      VALUES (
        OLD.assigned_driver_id,
        type_label || ' u rikalibrua',
        lower(type_label) || ' ' || note_label || ' nuk eshte me ne ngarkesen tuaj.',
        'delivery_note',
        NEW.id,
        jsonb_build_object('event', 'driver_unassigned', 'note_type', note_type, 'note_number', note_label)
      );
    END IF;
    IF NEW.assigned_driver_id IS NOT NULL AND NEW.status <> 'draft' THEN
      INSERT INTO notifications (user_id, title, message, type, reference_id, data)
      VALUES (
        NEW.assigned_driver_id,
        type_label || ' e re',
        'Ju eshte caktuar ' || lower(type_label) || ' ' || note_label,
        'delivery_note',
        NEW.id,
        jsonb_build_object('event', 'driver_reassigned', 'note_type', note_type, 'note_number', note_label)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_delivery_notes_notify ON delivery_notes;
CREATE TRIGGER trg_delivery_notes_notify
AFTER INSERT OR UPDATE ON delivery_notes
FOR EACH ROW EXECUTE FUNCTION delivery_notes_notify();
