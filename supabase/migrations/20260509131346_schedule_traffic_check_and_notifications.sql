/*
  # Schedule traffic monitoring cron + in-app notifications on alerts

  1. Changes
    - Creates pg_cron job that calls the `check-route-traffic` edge function every 5 minutes.
    - Adds trigger on `route_traffic_alerts` that inserts rows in the existing `notifications` table
      for both the affected driver and all company admins/dispatchers of the same company.

  2. Security
    - Trigger runs with SECURITY DEFINER and is limited to routed notifications for the alert's company.

  3. Notes
    - Relies on `pg_cron` and `pg_net` extensions which are already enabled elsewhere in this project.
*/

DO $$
DECLARE
  v_project_url text := current_setting('app.settings.supabase_url', true);
  v_service_key text := current_setting('app.settings.service_role_key', true);
BEGIN
  -- Best effort: the scheduled job is idempotent; unschedule existing copy first.
  PERFORM cron.unschedule('check-route-traffic-every-5m')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'check-route-traffic-every-5m');

  PERFORM cron.schedule(
    'check-route-traffic-every-5m',
    '*/5 * * * *',
    $cron$
      SELECT net.http_post(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1) || '/functions/v1/check-route-traffic',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
        ),
        body := '{}'::jsonb
      );
    $cron$
  );
EXCEPTION WHEN OTHERS THEN
  -- Schema/vault not present; skip scheduling silently so migration is resilient.
  RAISE NOTICE 'cron schedule skipped: %', SQLERRM;
END $$;

CREATE OR REPLACE FUNCTION public.notify_on_traffic_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  -- Notify the driver
  INSERT INTO public.notifications (user_id, company_id, type, title, message, data)
  VALUES (
    NEW.driver_id,
    NEW.company_id,
    'traffic_alert',
    'Trafik ne rrugen tende',
    NEW.message,
    jsonb_build_object(
      'alert_id', NEW.id,
      'delivery_note_id', NEW.delivery_note_id,
      'severity', NEW.severity,
      'delay_minutes', NEW.delay_minutes
    )
  );

  -- Notify all company admins / dispatchers / logistics for the company
  FOR r IN
    SELECT id FROM public.profiles
    WHERE company_id = NEW.company_id
      AND role IN ('company_admin','logistics','dispatcher')
  LOOP
    INSERT INTO public.notifications (user_id, company_id, type, title, message, data)
    VALUES (
      r.id,
      NEW.company_id,
      'traffic_alert',
      'Trafik ne rrugen e nje shoferi',
      NEW.message,
      jsonb_build_object(
        'alert_id', NEW.id,
        'delivery_note_id', NEW.delivery_note_id,
        'driver_id', NEW.driver_id,
        'severity', NEW.severity,
        'delay_minutes', NEW.delay_minutes
      )
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_traffic_alert ON public.route_traffic_alerts;
CREATE TRIGGER trg_notify_on_traffic_alert
AFTER INSERT ON public.route_traffic_alerts
FOR EACH ROW EXECUTE FUNCTION public.notify_on_traffic_alert();
