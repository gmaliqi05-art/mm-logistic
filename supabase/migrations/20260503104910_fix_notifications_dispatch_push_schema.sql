/*
  # Rregullim i search_path per pg_net

  Ekstensioni pg_net shtrihet ne schema `net`, jo `extensions`. Per kete arsye
  funksioni `notifications_dispatch_push` rifreskohet me referenca te sakta.
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
    'tag', COALESCE(NEW.reference_id::text, NEW.id::text)
  );

  PERFORM net.http_post(
    url := edge_url || '/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key,
      'apikey', service_key
    ),
    body := payload,
    timeout_milliseconds := 5000
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notifications_dispatch_push failed: %', SQLERRM;
  RETURN NEW;
END;
$$;
