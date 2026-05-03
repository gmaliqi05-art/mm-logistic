/*
  # Harmonizim i tipeve te njoftimeve dhe push-fan-out me perfshires

  Ndryshime kryesore:
  1. CHECK i `notifications.type` zgjerohet qe te perfshije te gjitha tipet
     qe kodi i aplikacionit dhe edge functions i perdorin: `chat, document,
     delivery, delivery_note, system, invoice, dispatch, assignment, stock,
     compliance`.
  2. `notifications_dispatch_push` tani ben push per te gjitha tipet me
     perjashtim te `system` (qe mbetet vetem in-app). Kjo eliminon heshtjen
     e push-it per tipet `document`, `delivery_note`, `assignment`,
     `dispatch`, `invoice`, `compliance`, `stock`.
  3. `delivery_notes_notify` rifitohet me deget `in_transit` dhe `delivered`:
     kur shoferi niset (status `in_transit`), njoftohen company_admin,
     logistics_admin dhe accountant te kompanise; kur dergesa mberrin
     (`delivered`), njoftohet i njejti rreth.

  Security
  - Te dy funksionet mbajne SECURITY DEFINER dhe search_path te fiksuar.
  - Asnje RLS policy nuk ndryshon.
*/

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    'chat'::text,
    'document'::text,
    'delivery'::text,
    'delivery_note'::text,
    'system'::text,
    'invoice'::text,
    'dispatch'::text,
    'assignment'::text,
    'stock'::text,
    'compliance'::text
  ]));

CREATE OR REPLACE FUNCTION public.notifications_dispatch_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'net'
AS $$
DECLARE
  edge_url text;
  service_key text;
  push_type text;
  payload jsonb;
  target_url text;
  headers jsonb;
BEGIN
  SELECT value INTO edge_url FROM public.app_config WHERE key = 'supabase_url';
  SELECT value INTO service_key FROM public.app_config WHERE key = 'service_role_key';

  IF edge_url IS NULL OR service_key IS NULL THEN
    RETURN NEW;
  END IF;

  -- Vetem `system` mbetet in-app; cdo tip tjeter pushohet.
  IF NEW.type = 'system' THEN
    RETURN NEW;
  END IF;

  push_type := CASE
    WHEN NEW.type IN ('chat', 'document', 'delivery') THEN NEW.type
    WHEN NEW.type IN ('delivery_note', 'assignment', 'dispatch') THEN 'delivery'
    WHEN NEW.type IN ('invoice', 'compliance', 'stock') THEN 'document'
    ELSE 'document'
  END;

  target_url := COALESCE(NEW.data->>'url', '/');

  payload := jsonb_build_object(
    'recipientIds', jsonb_build_array(NEW.user_id::text),
    'title', COALESCE(NEW.title, ''),
    'body', COALESCE(NEW.message, ''),
    'type', push_type,
    'url', target_url,
    'tag', COALESCE(NEW.reference_id::text, NEW.id::text),
    'data', jsonb_build_object(
      'url', target_url,
      'notification_id', NEW.id::text,
      'reference_id', COALESCE(NEW.reference_id::text, ''),
      'original_type', NEW.type
    )
  );

  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || service_key,
    'apikey', service_key
  );

  PERFORM net.http_post(
    url := edge_url || '/functions/v1/send-push-notification',
    headers := headers,
    body := payload,
    timeout_milliseconds := 5000
  );

  PERFORM net.http_post(
    url := edge_url || '/functions/v1/send-fcm-notification',
    headers := headers,
    body := payload,
    timeout_milliseconds := 5000
  );

  PERFORM net.http_post(
    url := edge_url || '/functions/v1/send-apns-notification',
    headers := headers,
    body := payload,
    timeout_milliseconds := 5000
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notifications_dispatch_push failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

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
        jsonb_build_object('event', 'sent_to_driver', 'note_type', note_type, 'note_number', note_label)
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
      jsonb_build_object('event', 'in_transit', 'note_type', note_type, 'note_number', note_label)
    FROM profiles p
    WHERE p.company_id = NEW.company_id
      AND p.role IN ('company_admin', 'logistics_admin', 'accountant');
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
      jsonb_build_object('event', 'delivered', 'note_type', note_type, 'note_number', note_label)
    FROM profiles p
    WHERE p.company_id = NEW.company_id
      AND p.role IN ('company_admin', 'logistics_admin', 'accountant');
  END IF;

  RETURN NEW;
END;
$$;
