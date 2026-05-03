/*
  # Push fan-out in Web + FCM + APNs

  Funksioni `notifications_dispatch_push` tashme nderton payload nje here dhe
  i dergon ne menyre asinkrone tek tri Edge Functions:
    - send-push-notification (Web Push / VAPID)
    - send-fcm-notification (Android native)
    - send-apns-notification (iOS native)

  Secila nga to eshte no-op kur secrets e saj mungojne, keshtu quhet e sigurt
  t'i therrasim gjithmone te trija. Kur FCM_SERVICE_ACCOUNT_JSON ose APNs
  secrets te shtohen ne Supabase, kanalet perkatese aktivizohen automatikisht.

  Ndryshimet:
  1. Modified functions
     - public.notifications_dispatch_push: tani ben fan-out tek te trija
       edge functions ne vend te vetem send-push-notification.

  Security
  - SECURITY DEFINER me search_path te fiksuar (public, net).
  - Payload injektohet nga NEW.row, jo nga perdoruesi.
*/

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

  push_type := CASE
    WHEN NEW.type IN ('chat','document','delivery') THEN NEW.type
    ELSE 'system'
  END;

  IF push_type = 'system' THEN
    RETURN NEW;
  END IF;

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
      'reference_id', COALESCE(NEW.reference_id::text, '')
    )
  );

  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || service_key,
    'apikey', service_key
  );

  -- Web Push / VAPID
  PERFORM net.http_post(
    url := edge_url || '/functions/v1/send-push-notification',
    headers := headers,
    body := payload,
    timeout_milliseconds := 5000
  );

  -- Android FCM (no-op pa FCM_SERVICE_ACCOUNT_JSON)
  PERFORM net.http_post(
    url := edge_url || '/functions/v1/send-fcm-notification',
    headers := headers,
    body := payload,
    timeout_milliseconds := 5000
  );

  -- iOS APNs (no-op pa APNS_* secrets)
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
