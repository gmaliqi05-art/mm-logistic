/*
  # Move trigger_accounting_sync_for_due_companies to private schema

  1. Security Changes
    - Recreate the function in the `private` schema instead of `public`
    - This prevents it from being callable via the REST API
    - The cron job is updated to call private.trigger_accounting_sync_for_due_companies()
    - The old public function is dropped

  2. Rationale
    - This SECURITY DEFINER function reads service role keys from current_setting()
    - It should not be exposed via PostgREST to any user
    - Moving to private schema hides it from the REST API entirely
*/

-- Create the function in private schema (copy from public)
CREATE OR REPLACE FUNCTION private.trigger_accounting_sync_for_due_companies()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_url   text;
  v_key   text;
  rec     record;
BEGIN
  BEGIN
    v_url := current_setting('app.supabase_url', true);
    v_key := current_setting('app.supabase_service_role_key', true);
  EXCEPTION WHEN OTHERS THEN
    RETURN;
  END;

  IF v_url IS NULL OR v_key IS NULL THEN
    RETURN;
  END IF;

  FOR rec IN
    SELECT cf.company_id
    FROM company_features cf
    WHERE cf.accounting_enabled = true
      AND cf.accounting_next_sync_at IS NOT NULL
      AND cf.accounting_next_sync_at <= date_trunc('minute', now())
  LOOP
    PERFORM net.http_post(
      url     := v_url || '/functions/v1/sync-accounting',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_key
      ),
      body    := jsonb_build_object('company_id', rec.company_id)
    );
  END LOOP;
END;
$$;

-- Update the cron job to use private schema
DO $$
BEGIN
  PERFORM cron.unschedule('trigger_accounting_sync_for_due_companies');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'trigger_accounting_sync_for_due_companies',
  '* * * * *',
  $$SELECT private.trigger_accounting_sync_for_due_companies()$$
);

-- Drop the old public function
DROP FUNCTION IF EXISTS public.trigger_accounting_sync_for_due_companies();
