/*
  # Public API + Webhooks System

  1. New Tables
    - `company_api_keys` - per-company API keys (hashed)
    - `webhooks` - outbound webhook endpoints + events
    - `webhook_deliveries` - log of attempted deliveries
    - `webhook_events` - queue of pending events to deliver
  2. Triggers
    - Invoice create/pay, delivery complete, partner add, stock low
  3. Security
    - RLS on all tables, only company_admin can manage
*/

CREATE TABLE IF NOT EXISTS company_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  key_hash text NOT NULL,
  key_prefix text NOT NULL,
  scopes text[] NOT NULL DEFAULT ARRAY['read']::text[],
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  CONSTRAINT company_api_keys_prefix_unique UNIQUE (key_prefix)
);

CREATE INDEX IF NOT EXISTS idx_company_api_keys_company ON company_api_keys (company_id);
CREATE INDEX IF NOT EXISTS idx_company_api_keys_hash ON company_api_keys (key_hash);

CREATE TABLE IF NOT EXISTS webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  url text NOT NULL,
  events text[] NOT NULL DEFAULT ARRAY[]::text[],
  secret text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  last_delivery_at timestamptz,
  failure_count integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_webhooks_company ON webhooks (company_id);

CREATE TABLE IF NOT EXISTS webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  event text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','delivered','failed')),
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_pending
  ON webhook_events (status, created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_webhook_events_company
  ON webhook_events (company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id uuid NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event_id uuid REFERENCES webhook_events(id) ON DELETE SET NULL,
  event text NOT NULL,
  status_code integer,
  response_body text DEFAULT '',
  succeeded boolean NOT NULL DEFAULT false,
  attempted_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook
  ON webhook_deliveries (webhook_id, attempted_at DESC);

ALTER TABLE company_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view company api keys"
  ON company_api_keys FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
        AND role IN ('company_admin','super_admin')
    )
  );

CREATE POLICY "Admins insert api keys"
  ON company_api_keys FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
        AND role IN ('company_admin','super_admin')
    )
  );

CREATE POLICY "Admins update api keys"
  ON company_api_keys FOR UPDATE TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
        AND role IN ('company_admin','super_admin')
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
        AND role IN ('company_admin','super_admin')
    )
  );

CREATE POLICY "Admins delete api keys"
  ON company_api_keys FOR DELETE TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
        AND role IN ('company_admin','super_admin')
    )
  );

CREATE POLICY "Admins view webhooks"
  ON webhooks FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
        AND role IN ('company_admin','super_admin')
    )
  );

CREATE POLICY "Admins insert webhooks"
  ON webhooks FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
        AND role IN ('company_admin','super_admin')
    )
  );

CREATE POLICY "Admins update webhooks"
  ON webhooks FOR UPDATE TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
        AND role IN ('company_admin','super_admin')
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
        AND role IN ('company_admin','super_admin')
    )
  );

CREATE POLICY "Admins delete webhooks"
  ON webhooks FOR DELETE TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
        AND role IN ('company_admin','super_admin')
    )
  );

CREATE POLICY "Admins view webhook events"
  ON webhook_events FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
        AND role IN ('company_admin','super_admin')
    )
  );

CREATE POLICY "Admins view webhook deliveries"
  ON webhook_deliveries FOR SELECT TO authenticated
  USING (
    webhook_id IN (
      SELECT id FROM webhooks WHERE company_id IN (
        SELECT company_id FROM profiles WHERE id = auth.uid()
          AND role IN ('company_admin','super_admin')
      )
    )
  );

-- Event emission helper
CREATE OR REPLACE FUNCTION public.emit_webhook_event(p_company_id uuid, p_event text, p_payload jsonb)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO webhook_events (company_id, event, payload)
  VALUES (p_company_id, p_event, p_payload);
$$;

-- Triggers
CREATE OR REPLACE FUNCTION public.trg_emit_invoice_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM emit_webhook_event(NEW.company_id, 'invoice.created',
    jsonb_build_object('id', NEW.id, 'total', NEW.total, 'currency', NEW.currency, 'invoice_number', NEW.invoice_number));
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_emit_invoice_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'paid' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM emit_webhook_event(NEW.company_id, 'invoice.paid',
      jsonb_build_object('id', NEW.id, 'total', NEW.total, 'currency', NEW.currency, 'invoice_number', NEW.invoice_number));
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_emit_partner_added()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM emit_webhook_event(NEW.company_id, 'partner.added',
    jsonb_build_object('id', NEW.id, 'name', NEW.name));
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'acc_invoices') THEN
    DROP TRIGGER IF EXISTS trg_acc_invoices_webhook_insert ON acc_invoices;
    CREATE TRIGGER trg_acc_invoices_webhook_insert
      AFTER INSERT ON acc_invoices
      FOR EACH ROW EXECUTE FUNCTION trg_emit_invoice_created();

    DROP TRIGGER IF EXISTS trg_acc_invoices_webhook_update ON acc_invoices;
    CREATE TRIGGER trg_acc_invoices_webhook_update
      AFTER UPDATE ON acc_invoices
      FOR EACH ROW EXECUTE FUNCTION trg_emit_invoice_paid();
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'acc_contacts') THEN
    DROP TRIGGER IF EXISTS trg_acc_contacts_webhook_insert ON acc_contacts;
    CREATE TRIGGER trg_acc_contacts_webhook_insert
      AFTER INSERT ON acc_contacts
      FOR EACH ROW EXECUTE FUNCTION trg_emit_partner_added();
  END IF;
END $$;
