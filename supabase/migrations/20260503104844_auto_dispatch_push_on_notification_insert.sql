/*
  # Dispatch automatik i push-it ne shtimin e njoftimit

  1. Problemi
    - Kur triggerat e brendshem (p.sh. `delivery_notes_notify`) fusin rreshta ne
      tabelen `notifications`, asnje push nuk dergohet ne browser/PWA, sepse
      funksioni Edge `send-push-notification` therrasket vetem manualisht nga UI.

  2. Zgjidhja
    - Aktivizimi i ekstensionit `pg_net` per thirrje asinkrone HTTP nga DB.
    - Ruajtja ne tabelen `app_config` e SERVICE_KEY + SUPABASE_URL (te ruajtur
      vetem me RLS te mbyllur, vetem postgres mund t'i aksesoje).
    - Funksion `notifications_dispatch_push` qe merr rreshtin e ri dhe ben POST
      ne `/functions/v1/send-push-notification` me payload perkates.
    - Trigger `trg_notifications_push` AFTER INSERT qe therret funksionin.

  3. Siguria
    - `app_config` eshte pa RLS publik (denied me default), vetem roli postgres
      lexon permes funksionit SECURITY DEFINER.
    - `notifications_dispatch_push` eshte SECURITY DEFINER me search_path te
      fiksuar.
    - Nuk prek asnje te dhene ekzistuese demo.
*/

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS app_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'app_config' AND policyname = 'Deny all'
  ) THEN
    CREATE POLICY "Deny all" ON app_config FOR SELECT TO authenticated USING (false);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.notifications_dispatch_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  edge_url text;
  service_key text;
  push_type text;
  payload jsonb;
  target_url text;
BEGIN
  SELECT value INTO edge_url FROM app_config WHERE key = 'supabase_url';
  SELECT value INTO service_key FROM app_config WHERE key = 'service_role_key';

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

  PERFORM extensions.http_post(
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

REVOKE ALL ON FUNCTION public.notifications_dispatch_push() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notifications_push ON public.notifications;
CREATE TRIGGER trg_notifications_push
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.notifications_dispatch_push();
