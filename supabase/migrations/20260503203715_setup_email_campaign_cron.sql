/*
  # Setup pg_cron for Scheduled Email Campaigns

  Aktivizon pg_cron dhe krijon job qe cdo 5 minuta therret Edge Function
  `send-email-campaign?tick=1` per te ekzekutuar fushatat e planifikuara.

  Perdor pg_net (ekstension asinkron HTTP) qe tashme eshte i instaluar.

  Note: Kerkon qe vlerat e project URL dhe service role key te jene te
  vendosura ne platform_settings tabelen `email_cron_config` e re, per te
  shmangur hardcoding.
*/

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Tabel konfigurimi per cron-in (super admin i vendos)
CREATE TABLE IF NOT EXISTS public.email_cron_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  project_url text NOT NULL DEFAULT '',
  service_role_key text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.email_cron_config (id) VALUES (1) ON CONFLICT DO NOTHING;

ALTER TABLE public.email_cron_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins view cron config" ON public.email_cron_config;
CREATE POLICY "Super admins view cron config"
  ON public.email_cron_config FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));

DROP POLICY IF EXISTS "Super admins update cron config" ON public.email_cron_config;
CREATE POLICY "Super admins update cron config"
  ON public.email_cron_config FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));

-- Funksion qe terheq fushatat e planifikuara
CREATE OR REPLACE FUNCTION public.tick_scheduled_email_campaigns()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  cfg RECORD;
BEGIN
  SELECT * INTO cfg FROM public.email_cron_config WHERE id = 1;
  IF NOT FOUND OR cfg.enabled = false OR cfg.project_url = '' OR cfg.service_role_key = '' THEN
    RETURN;
  END IF;

  PERFORM extensions.http_post(
    url := cfg.project_url || '/functions/v1/send-email-campaign?tick=1',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || cfg.service_role_key,
      'apikey', cfg.service_role_key
    )
  );
END $$;

-- Pastro job-in e vjeter nese ekziston
DO $$
DECLARE
  jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'process_scheduled_email_campaigns';
  IF jid IS NOT NULL THEN
    PERFORM cron.unschedule(jid);
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Krijo cron job cdo 5 minuta
SELECT cron.schedule(
  'process_scheduled_email_campaigns',
  '*/5 * * * *',
  $$SELECT public.tick_scheduled_email_campaigns();$$
);
