/*
  # KE1: Stop reading service_role_key from public.app_config

  ## Why
  Edge-functions audit (KE1) flagged that `init-push-config` writes
  `SUPABASE_SERVICE_ROLE_KEY` into `public.app_config` in plain text.
  The dispatch trigger `notifications_dispatch_push()` then reads it
  back for every notification row. If anyone ever finds an RLS bypass
  on `app_config` (e.g., a stray SECURITY DEFINER helper that selects
  from it without checking the caller), they get the service-role key
  — the master credential.

  Today the table is empty in prod (push dispatch is therefore a
  silent no-op), but the code path is live and a future bootstrap
  call to `init-push-config` would re-create the exposure.

  ## What this ships
  1. Rewrite `notifications_dispatch_push()` to read the URL + service
     key from `vault.decrypted_secrets` under the canonical names
     `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`. This is the same
     pattern already used by `retry_webhook_dispatch`,
     `check-route-traffic-every-5m`, `check-overdue-invoices`,
     `fetch_ecb_rates_daily` — Vault is the de-facto standard in
     this codebase.
  2. Keep `app_config` as a *fallback* read path. This preserves the
     trigger for any tenant that has already populated app_config
     (we know prod is empty, but a self-hosted clone of the schema
     might not be). The fallback is read-only — we never write to
     app_config from migrations.
  3. Add an explicit warning RAISE NOTICE the first time the
     fallback fires, so the operator knows to migrate.

  ## Operator action required
  After applying this migration the operator must populate Vault with:

      SELECT vault.create_secret('https://YOUR-PROJECT.supabase.co', 'SUPABASE_URL');
      SELECT vault.create_secret('eyJhbGciOi...service_role...', 'SUPABASE_SERVICE_ROLE_KEY');

  …or via the Supabase dashboard → Database → Vault. Once Vault is
  populated, push dispatch begins working. If Vault stays empty and
  app_config has rows from a prior bootstrap, the function falls
  back to those — no production behaviour change for existing
  installations.

  ## Companion changes (non-DB)
  The `init-push-config` edge function will be neutered in the same
  PR: it now refuses to write secrets, returning a 410 with the
  Vault instructions instead. The PR does not delete the function
  file — the route stays so existing CI / scripts don't 404.

  ## Safety
  - No data loss (app_config is empty in prod).
  - No new RLS or grants.
  - The trigger still has its top-level `EXCEPTION WHEN OTHERS` so
    even if Vault and app_config are both empty, push silently no-ops
    rather than failing the underlying notification INSERT.
  - Idempotent via CREATE OR REPLACE.

  ## After both code & migration land
  Run this once-off cleanup to be sure no app_config rows survive:

      DELETE FROM public.app_config
       WHERE key IN ('service_role_key', 'supabase_url');

  Not bundled because we have no rows to delete on prod and we want
  to give self-hosted operators an explicit migration window.
*/

CREATE OR REPLACE FUNCTION public.notifications_dispatch_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'net'
AS $$
DECLARE
  edge_url    text;
  service_key text;
  push_type   text;
  payload     jsonb;
  target_url  text;
  headers     jsonb;
  v_used_fallback boolean := false;
BEGIN
  -- Preferred path: Vault (matches the rest of the cron infrastructure)
  BEGIN
    SELECT decrypted_secret INTO edge_url
      FROM vault.decrypted_secrets
     WHERE name = 'SUPABASE_URL'
     LIMIT 1;
    SELECT decrypted_secret INTO service_key
      FROM vault.decrypted_secrets
     WHERE name = 'SUPABASE_SERVICE_ROLE_KEY'
     LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    -- Vault extension may not be available on a self-hosted clone.
    edge_url := NULL;
    service_key := NULL;
  END;

  -- Fallback: legacy app_config rows from a prior init-push-config
  -- bootstrap. We never write to app_config from migrations; this
  -- read path will be removed once self-hosted users have migrated.
  IF edge_url IS NULL OR service_key IS NULL THEN
    SELECT value INTO edge_url    FROM public.app_config WHERE key = 'supabase_url'      AND value IS NOT NULL AND value <> '';
    SELECT value INTO service_key FROM public.app_config WHERE key = 'service_role_key'  AND value IS NOT NULL AND value <> '';
    IF edge_url IS NOT NULL AND service_key IS NOT NULL THEN
      v_used_fallback := true;
      RAISE NOTICE 'notifications_dispatch_push: using deprecated app_config fallback; migrate to Vault (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).';
    END IF;
  END IF;

  IF edge_url IS NULL OR service_key IS NULL THEN
    -- Silent no-op so the parent notification INSERT still succeeds.
    RETURN NEW;
  END IF;

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
    'title',        COALESCE(NEW.title, ''),
    'body',         COALESCE(NEW.message, ''),
    'type',         push_type,
    'url',          target_url,
    'tag',          COALESCE(NEW.reference_id::text, NEW.id::text),
    'data', jsonb_build_object(
      'url',           target_url,
      'notification_id', NEW.id::text,
      'reference_id',  COALESCE(NEW.reference_id::text, ''),
      'original_type', NEW.type
    )
  );

  headers := jsonb_build_object(
    'Content-Type',  'application/json',
    'Authorization', 'Bearer ' || service_key,
    'apikey',        service_key
  );

  PERFORM net.http_post(
    url     := edge_url || '/functions/v1/send-push-notification',
    headers := headers,
    body    := payload,
    timeout_milliseconds := 5000
  );

  PERFORM net.http_post(
    url     := edge_url || '/functions/v1/send-fcm-notification',
    headers := headers,
    body    := payload,
    timeout_milliseconds := 5000
  );

  PERFORM net.http_post(
    url     := edge_url || '/functions/v1/send-apns-notification',
    headers := headers,
    body    := payload,
    timeout_milliseconds := 5000
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notifications_dispatch_push failed: %', SQLERRM;
  RETURN NEW;
END;
$$;
