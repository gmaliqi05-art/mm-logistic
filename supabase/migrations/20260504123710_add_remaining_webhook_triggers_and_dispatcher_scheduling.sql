/*
  # Add remaining webhook triggers + auto-dispatch

  1. New Triggers
    - `delivery.completed` on `delivery_notes` when status becomes 'delivered' or 'confirmed'
    - `stock.low` on `stock` when quantity crosses below the matching `stock_alerts.threshold`
  2. Auto-Dispatch
    - AFTER INSERT on `webhook_events` → pg_net http_post to webhook-dispatcher,
      so deliveries happen in near-real-time without polling.
  3. Safety
    - Trigger functions are SECURITY DEFINER with locked search_path.
*/

CREATE OR REPLACE FUNCTION public.trg_emit_delivery_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('delivered','confirmed')
     AND (OLD.status IS DISTINCT FROM NEW.status)
  THEN
    PERFORM emit_webhook_event(
      NEW.company_id,
      'delivery.completed',
      jsonb_build_object(
        'id', NEW.id,
        'note_number', NEW.note_number,
        'status', NEW.status,
        'delivered_at', NEW.delivered_at,
        'partner_id', NEW.partner_id,
        'partner_name', NEW.partner_name
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_delivery_notes_webhook_completed ON delivery_notes;
CREATE TRIGGER trg_delivery_notes_webhook_completed
  AFTER UPDATE ON delivery_notes
  FOR EACH ROW EXECUTE FUNCTION trg_emit_delivery_completed();

CREATE OR REPLACE FUNCTION public.trg_emit_stock_low()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_threshold numeric;
BEGIN
  SELECT threshold INTO v_threshold
  FROM stock_alerts
  WHERE company_id = NEW.company_id
    AND alert_type = 'low_stock'
    AND is_active = true
    AND (depot_id IS NULL OR depot_id = NEW.depot_id)
    AND (category_id IS NULL OR category_id = NEW.category_id)
  ORDER BY (depot_id IS NOT NULL)::int DESC,
           (category_id IS NOT NULL)::int DESC
  LIMIT 1;

  IF v_threshold IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.quantity <= v_threshold
     AND COALESCE(OLD.quantity, v_threshold + 1) > v_threshold
  THEN
    PERFORM emit_webhook_event(
      NEW.company_id,
      'stock.low',
      jsonb_build_object(
        'stock_id', NEW.id,
        'depot_id', NEW.depot_id,
        'category_id', NEW.category_id,
        'category_product_id', NEW.category_product_id,
        'condition', NEW.condition,
        'quantity', NEW.quantity,
        'threshold', v_threshold
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stock_webhook_low ON stock;
CREATE TRIGGER trg_stock_webhook_low
  AFTER UPDATE OF quantity ON stock
  FOR EACH ROW EXECUTE FUNCTION trg_emit_stock_low();

-- Auto-dispatch webhook events on insert (fire-and-forget via pg_net)
CREATE OR REPLACE FUNCTION public.trg_auto_dispatch_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_key text;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
    SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
  END;

  IF v_url IS NULL OR v_key IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := v_url || '/functions/v1/webhook-dispatcher',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_key,
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object('event_id', NEW.id)
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    DROP TRIGGER IF EXISTS trg_webhook_events_auto_dispatch ON webhook_events;
    CREATE TRIGGER trg_webhook_events_auto_dispatch
      AFTER INSERT ON webhook_events
      FOR EACH ROW EXECUTE FUNCTION trg_auto_dispatch_webhook();
  END IF;
END $$;

-- Retry cron for failed webhook events (every 5 min)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'retry_webhook_dispatch';

    BEGIN
      PERFORM cron.schedule(
        'retry_webhook_dispatch',
        '*/5 * * * *',
        $cron$
          SELECT net.http_post(
            url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1) || '/functions/v1/webhook-dispatcher',
            headers := jsonb_build_object(
              'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1),
              'Content-Type', 'application/json'
            ),
            body := '{}'::jsonb
          );
        $cron$
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
END $$;
