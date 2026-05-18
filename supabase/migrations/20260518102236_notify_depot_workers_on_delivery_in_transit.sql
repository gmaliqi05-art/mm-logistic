/*
  # Notify depot workers when delivery is in transit to their depot

  1. Changes
    - Updates `delivery_notes_notify()` trigger function
    - When status changes to `in_transit` and the delivery has an `assigned_depot_id`,
      all active depot_workers in that depot are notified
    - Depot workers receive a notification: "Dergese ne rruge per ne depo"
    - Existing behavior for company_admin/logistics_admin/accountant is preserved

  2. Purpose
    - Depot workers need advance notice to prepare for incoming goods
    - Allows them to organize space, plan sorting, and be ready for receiving

  3. Security
    - Function remains SECURITY DEFINER with fixed search_path
*/

CREATE OR REPLACE FUNCTION public.delivery_notes_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
        jsonb_build_object('event', 'sent_to_driver', 'note_type', note_type, 'note_number', note_label,
                           'url', '/driver')
      );
    END IF;
    RETURN NEW;
  END IF;

  -- Caktim/ricaktim shoferi
  IF OLD.status = 'draft' AND NEW.status = 'sent' AND NEW.assigned_driver_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, title, message, type, reference_id, data)
    VALUES (
      NEW.assigned_driver_id,
      type_label || ' e re',
      'Ju eshte caktuar ' || lower(type_label) || ' ' || note_label,
      'delivery_note',
      NEW.id,
      jsonb_build_object('event', 'sent_to_driver', 'note_type', note_type, 'note_number', note_label,
                         'url', '/driver')
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
        jsonb_build_object('event', 'driver_unassigned', 'note_type', note_type, 'note_number', note_label,
                           'url', '/driver')
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
        jsonb_build_object('event', 'driver_reassigned', 'note_type', note_type, 'note_number', note_label,
                           'url', '/driver')
      );
    END IF;
  END IF;

  -- Shoferi niset (in_transit) -> njofto kompanine (admin + logjistike + accountant)
  IF NEW.status = 'in_transit' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO notifications (user_id, title, message, type, reference_id, data)
    SELECT
      p.id,
      type_label || ' nisi',
      COALESCE(
        (SELECT full_name FROM profiles WHERE id = NEW.assigned_driver_id),
        'Shoferi'
      ) || ' nisi ' || lower(type_label) || ' ' || note_label,
      'delivery_note',
      NEW.id,
      jsonb_build_object('event', 'in_transit', 'note_type', note_type, 'note_number', note_label,
                         'url', '/company/delivery-notes')
    FROM profiles p
    WHERE p.company_id = NEW.company_id
      AND p.role IN ('company_admin', 'logistics_admin', 'accountant');

    -- Njofto depot workers te depos se caktuar qe dergesa eshte ne rruge
    IF NEW.assigned_depot_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, title, message, type, reference_id, data)
      SELECT
        p.id,
        type_label || ' ne rruge',
        COALESCE(
          (SELECT full_name FROM profiles WHERE id = NEW.assigned_driver_id),
          'Shoferi'
        ) || ' nisi ' || lower(type_label) || ' ' || note_label || ' per ne depo.',
        'delivery_note',
        NEW.id,
        jsonb_build_object('event', 'in_transit_to_depot', 'note_type', note_type, 'note_number', note_label,
                           'url', '/depot/receiving')
      FROM profiles p
      WHERE p.depot_id = NEW.assigned_depot_id
        AND p.role = 'depot_worker'
        AND p.is_active = true;
    END IF;
  END IF;

  -- Dergesa mberriti (delivered) -> njofto kompanine
  IF NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO notifications (user_id, title, message, type, reference_id, data)
    SELECT
      p.id,
      type_label || ' u dorezua',
      lower(type_label) || ' ' || note_label || ' u dorezua nga shoferi.',
      'delivery_note',
      NEW.id,
      jsonb_build_object('event', 'delivered', 'note_type', note_type, 'note_number', note_label,
                         'url', '/company/delivery-notes')
    FROM profiles p
    WHERE p.company_id = NEW.company_id
      AND p.role IN ('company_admin', 'logistics_admin', 'accountant');
  END IF;

  RETURN NEW;
END;
$$;
