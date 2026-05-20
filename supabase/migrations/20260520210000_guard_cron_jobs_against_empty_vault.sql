/*
  # Guard scheduled cron jobs against an empty Vault

  Cron jobs 4 (retry_webhook_dispatch), 6 (check-route-traffic-every-5m) and 8
  (check-overdue-invoices) call edge functions whose URL/auth are read from
  `vault.decrypted_secrets` (or `app.settings.*` GUCs). When those secrets are
  not set, the expression evaluates to NULL and `net.http_post` raises
  `null value in column "url" of relation "http_request_queue" violates
  not-null constraint`, generating ~24 errors/hour in postgres logs and
  marking each cron run as failed.

  This migration re-schedules those jobs with the same intent, but wraps the
  HTTP call in a DO block that returns early if the required secrets are
  missing — so the cron run becomes a clean no-op until the operator
  populates the Vault. No behavior change once the secrets are present.

  Vault entries expected:
    - SUPABASE_URL                + SUPABASE_SERVICE_ROLE_KEY  (jobs 4 & 8)
    - project_url                 + service_role_key           (job 6)
*/

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'retry_webhook_dispatch') THEN
    PERFORM cron.unschedule('retry_webhook_dispatch');
  END IF;

  PERFORM cron.schedule(
    'retry_webhook_dispatch',
    '*/5 * * * *',
    $cron$
      DO $body$
      DECLARE
        v_url text;
        v_key text;
      BEGIN
        SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
        SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;
        IF v_url IS NULL OR v_key IS NULL THEN RETURN; END IF;
        PERFORM net.http_post(
          url := v_url || '/functions/v1/webhook-dispatcher',
          headers := jsonb_build_object(
            'Authorization', 'Bearer ' || v_key,
            'Content-Type', 'application/json'
          ),
          body := '{}'::jsonb
        );
      END
      $body$;
    $cron$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'retry_webhook_dispatch re-schedule skipped: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'check-route-traffic-every-5m') THEN
    PERFORM cron.unschedule('check-route-traffic-every-5m');
  END IF;

  PERFORM cron.schedule(
    'check-route-traffic-every-5m',
    '*/5 * * * *',
    $cron$
      DO $body$
      DECLARE
        v_url text;
        v_key text;
      BEGIN
        SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1;
        SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
        IF v_url IS NULL OR v_key IS NULL THEN RETURN; END IF;
        PERFORM net.http_post(
          url := v_url || '/functions/v1/check-route-traffic',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_key
          ),
          body := '{}'::jsonb
        );
      END
      $body$;
    $cron$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'check-route-traffic-every-5m re-schedule skipped: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'check-overdue-invoices') THEN
    PERFORM cron.unschedule('check-overdue-invoices');
  END IF;

  PERFORM cron.schedule(
    'check-overdue-invoices',
    '0 */6 * * *',
    $cron$
      DO $body$
      DECLARE
        v_url text := current_setting('app.settings.supabase_url', true);
        v_key text := current_setting('app.settings.service_role_key', true);
      BEGIN
        IF v_url IS NULL OR v_url = '' THEN
          SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
        END IF;
        IF v_key IS NULL OR v_key = '' THEN
          SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;
        END IF;
        IF v_url IS NULL OR v_url = '' OR v_key IS NULL OR v_key = '' THEN RETURN; END IF;
        PERFORM net.http_post(
          url := v_url || '/functions/v1/check-overdue-invoices',
          headers := jsonb_build_object(
            'Authorization', 'Bearer ' || v_key,
            'Content-Type', 'application/json'
          ),
          body := '{}'::jsonb
        );
      END
      $body$;
    $cron$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'check-overdue-invoices re-schedule skipped: %', SQLERRM;
END $$;
