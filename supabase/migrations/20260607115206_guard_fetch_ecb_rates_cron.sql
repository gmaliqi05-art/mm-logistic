/*
  # Guard fetch_ecb_rates_daily against an empty Vault

  The audit (post-PR state review) found cron job 3 `fetch_ecb_rates_daily`
  failing 5/5 runs per week with:

    null value in column "url" of relation "http_request_queue"
    violates not-null constraint

  When migration 20260520210000 retrofitted the vault-guard pattern onto the
  webhook/traffic/overdue cron jobs, this ECB-rates job was missed. It still
  embeds the raw `SELECT decrypted_secret FROM vault...` inline in
  net.http_post, so a missing/empty SUPABASE_URL secret evaluates to NULL and
  raises on every run. Impact: stale ECB FX rates for multi-currency
  accounting.

  Re-schedule with the same DO-block guard used by the other jobs: read the
  secrets into locals, return early (clean no-op) if either is missing,
  otherwise POST to the edge function. No behavior change once the Vault is
  populated. Schedule unchanged: 16:00 UTC, Mon-Fri.
*/

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fetch_ecb_rates_daily') THEN
    PERFORM cron.unschedule('fetch_ecb_rates_daily');
  END IF;

  PERFORM cron.schedule(
    'fetch_ecb_rates_daily',
    '0 16 * * 1-5',
    $cron$
      DO $body$
      DECLARE
        v_url text;
        v_key text;
      BEGIN
        SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
        SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;
        IF v_url IS NULL OR v_url = '' OR v_key IS NULL OR v_key = '' THEN RETURN; END IF;
        PERFORM net.http_post(
          url := v_url || '/functions/v1/fetch-ecb-rates',
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
  RAISE NOTICE 'fetch_ecb_rates_daily re-schedule skipped: %', SQLERRM;
END $$;
