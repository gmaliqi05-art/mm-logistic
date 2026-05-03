/*
  # Fix Email Cron to use pg_net

  Zevendeson http_post me net.http_post nga pg_net (asinkron, i instaluar).
*/

CREATE OR REPLACE FUNCTION public.tick_scheduled_email_campaigns()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, net
AS $$
DECLARE
  cfg RECORD;
  req_id bigint;
BEGIN
  SELECT * INTO cfg FROM public.email_cron_config WHERE id = 1;
  IF NOT FOUND OR cfg.enabled = false OR cfg.project_url = '' OR cfg.service_role_key = '' THEN
    RETURN;
  END IF;

  SELECT net.http_post(
    url := cfg.project_url || '/functions/v1/send-email-campaign?tick=1',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || cfg.service_role_key,
      'apikey', cfg.service_role_key
    )
  ) INTO req_id;
END $$;
