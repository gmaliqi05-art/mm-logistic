/*
  # Advanced Push Notification System

  Extends the existing push system with multi-platform support (Web, Android FCM, iOS APNs),
  role-based access control, templates, queue, scheduling, and analytics.

  ## New Tables

  1. `device_tokens` - FCM/APNs tokens for native mobile apps
     - user_id, platform (ios|android), token, app_version, device_model, locale, is_active
  2. `notification_channels` - Catalog of channels (delivery.assigned, chat.message, etc.)
     - code, label, description, category, default_enabled, is_system
  3. `notification_templates` - Multi-locale title/body templates per channel
     - channel_code, locale, title_template, body_template, variables, created_by
  4. `notification_permissions` - RBAC matrix of role x channel
     - role, channel_code, can_send, can_receive
  5. `notification_preferences` - User opt-in/out per channel and platform
     - user_id, channel_code, enabled, via_web, via_android, via_ios
  6. `notification_queue` - Scheduled/queued notifications
     - channel_code, payload, recipient_user_ids, recipient_roles, scheduled_at, status, created_by
  7. `notification_deliveries` - Per-user per-platform delivery log
     - queue_id, user_id, channel_code, platform, status, provider_message_id, error_message
  8. `notification_campaigns` - Campaign aggregates for analytics
     - name, description, total_recipients, sent, failed, clicks
  9. `push_platform_settings` - Singleton row with platform config (public values only)
     - vapid_public_key, fcm_project_id, apns_bundle_id, apns_team_id, apns_key_id

  ## Security
  - RLS enabled on every new table
  - Super admin has full access
  - Users can read their own preferences/deliveries only
  - Channels and permissions readable by all authenticated, writable by super_admin

  ## Seed Data
  - Default channels for the platform (delivery, chat, compliance, invoice, system)
  - Default permissions matrix
  - Singleton row for platform_settings
*/

-- ============================================================================
-- 1. device_tokens (native push)
-- ============================================================================
CREATE TABLE IF NOT EXISTS device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('ios', 'android')),
  token text NOT NULL,
  app_version text DEFAULT '',
  device_model text DEFAULT '',
  locale text DEFAULT 'en',
  is_active boolean DEFAULT true,
  last_active_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (token)
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON device_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_device_tokens_platform_active ON device_tokens(platform, is_active);

ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own tokens"
  ON device_tokens FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own tokens"
  ON device_tokens FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own tokens"
  ON device_tokens FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own tokens"
  ON device_tokens FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Super admin read all tokens"
  ON device_tokens FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

-- ============================================================================
-- 2. notification_channels
-- ============================================================================
CREATE TABLE IF NOT EXISTS notification_channels (
  code text PRIMARY KEY,
  label text NOT NULL,
  description text DEFAULT '',
  category text NOT NULL DEFAULT 'system',
  default_enabled boolean DEFAULT true,
  is_system boolean DEFAULT false,
  icon text DEFAULT 'Bell',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE notification_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated read channels"
  ON notification_channels FOR SELECT TO authenticated USING (true);

CREATE POLICY "Super admin insert channels"
  ON notification_channels FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "Super admin update channels"
  ON notification_channels FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "Super admin delete channels"
  ON notification_channels FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
    AND is_system = false
  );

-- ============================================================================
-- 3. notification_templates
-- ============================================================================
CREATE TABLE IF NOT EXISTS notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_code text NOT NULL REFERENCES notification_channels(code) ON DELETE CASCADE,
  locale text NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'sq', 'de', 'fr')),
  title_template text NOT NULL,
  body_template text NOT NULL,
  variables jsonb DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (channel_code, locale)
);

CREATE INDEX IF NOT EXISTS idx_templates_channel ON notification_templates(channel_code);

ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated read templates"
  ON notification_templates FOR SELECT TO authenticated USING (true);

CREATE POLICY "Super admin insert templates"
  ON notification_templates FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "Super admin update templates"
  ON notification_templates FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "Super admin delete templates"
  ON notification_templates FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

-- ============================================================================
-- 4. notification_permissions (role x channel RBAC)
-- ============================================================================
CREATE TABLE IF NOT EXISTS notification_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL,
  channel_code text NOT NULL REFERENCES notification_channels(code) ON DELETE CASCADE,
  can_send boolean DEFAULT false,
  can_receive boolean DEFAULT true,
  updated_at timestamptz DEFAULT now(),
  UNIQUE (role, channel_code)
);

CREATE INDEX IF NOT EXISTS idx_permissions_role ON notification_permissions(role);

ALTER TABLE notification_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated read permissions"
  ON notification_permissions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Super admin insert permissions"
  ON notification_permissions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "Super admin update permissions"
  ON notification_permissions FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "Super admin delete permissions"
  ON notification_permissions FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

-- ============================================================================
-- 5. notification_preferences (user opt-in/out)
-- ============================================================================
CREATE TABLE IF NOT EXISTS notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_code text NOT NULL REFERENCES notification_channels(code) ON DELETE CASCADE,
  enabled boolean DEFAULT true,
  via_web boolean DEFAULT true,
  via_android boolean DEFAULT true,
  via_ios boolean DEFAULT true,
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, channel_code)
);

CREATE INDEX IF NOT EXISTS idx_preferences_user ON notification_preferences(user_id);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own preferences"
  ON notification_preferences FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own preferences"
  ON notification_preferences FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own preferences"
  ON notification_preferences FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own preferences"
  ON notification_preferences FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Super admin read all preferences"
  ON notification_preferences FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

-- ============================================================================
-- 6. notification_campaigns
-- ============================================================================
CREATE TABLE IF NOT EXISTS notification_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text DEFAULT '',
  total_recipients integer DEFAULT 0,
  sent integer DEFAULT 0,
  failed integer DEFAULT 0,
  clicks integer DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE notification_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin read campaigns"
  ON notification_campaigns FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "Super admin insert campaigns"
  ON notification_campaigns FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "Super admin update campaigns"
  ON notification_campaigns FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

-- ============================================================================
-- 7. notification_queue
-- ============================================================================
CREATE TABLE IF NOT EXISTS notification_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_code text NOT NULL REFERENCES notification_channels(code),
  campaign_id uuid REFERENCES notification_campaigns(id) ON DELETE SET NULL,
  title text NOT NULL,
  body text NOT NULL,
  data jsonb DEFAULT '{}'::jsonb,
  recipient_user_ids uuid[] DEFAULT ARRAY[]::uuid[],
  recipient_roles text[] DEFAULT ARRAY[]::text[],
  recipient_company_ids uuid[] DEFAULT ARRAY[]::uuid[],
  target_platforms text[] DEFAULT ARRAY['web','android','ios']::text[],
  scheduled_at timestamptz DEFAULT now(),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','sent','failed','cancelled')),
  sent_at timestamptz,
  total_recipients integer DEFAULT 0,
  sent_count integer DEFAULT 0,
  failed_count integer DEFAULT 0,
  error_message text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_queue_status_scheduled ON notification_queue(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_queue_created_by ON notification_queue(created_by);

ALTER TABLE notification_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin read queue"
  ON notification_queue FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "Super admin insert queue"
  ON notification_queue FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "Super admin update queue"
  ON notification_queue FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "Super admin delete queue"
  ON notification_queue FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

-- ============================================================================
-- 8. notification_deliveries (per-user per-platform log)
-- ============================================================================
CREATE TABLE IF NOT EXISTS notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id uuid REFERENCES notification_queue(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_code text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('web','android','ios','inapp')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','delivered','clicked','failed')),
  provider_message_id text,
  error_message text,
  attempted_at timestamptz DEFAULT now(),
  delivered_at timestamptz,
  clicked_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_deliveries_queue ON notification_deliveries(queue_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_user ON notification_deliveries(user_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON notification_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_deliveries_attempted ON notification_deliveries(attempted_at);

ALTER TABLE notification_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own deliveries"
  ON notification_deliveries FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Super admin read all deliveries"
  ON notification_deliveries FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

-- ============================================================================
-- 9. push_platform_settings (singleton)
-- ============================================================================
CREATE TABLE IF NOT EXISTS push_platform_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  vapid_public_key text DEFAULT '',
  vapid_subject text DEFAULT 'mailto:info@mm-logistic.eu',
  fcm_project_id text DEFAULT '',
  fcm_configured boolean DEFAULT false,
  apns_bundle_id text DEFAULT '',
  apns_team_id text DEFAULT '',
  apns_key_id text DEFAULT '',
  apns_configured boolean DEFAULT false,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE push_platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated read platform settings"
  ON push_platform_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Super admin update platform settings"
  ON push_platform_settings FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "Super admin insert platform settings"
  ON push_platform_settings FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

INSERT INTO push_platform_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Seed default channels
-- ============================================================================
INSERT INTO notification_channels (code, label, description, category, default_enabled, is_system, icon) VALUES
  ('chat.message',         'Chat Message',          'New chat messages',                     'chat',       true,  true, 'MessageSquare'),
  ('delivery.assigned',    'Delivery Assigned',     'New delivery assigned to driver',       'delivery',   true,  true, 'Truck'),
  ('delivery.in_transit',  'Delivery In Transit',   'Delivery marked in transit',            'delivery',   true,  true, 'Truck'),
  ('delivery.delivered',   'Delivery Completed',    'Delivery successfully delivered',       'delivery',   true,  true, 'CheckCircle2'),
  ('delivery.cancelled',   'Delivery Cancelled',    'Delivery cancelled',                    'delivery',   true,  true, 'XCircle'),
  ('document.uploaded',    'Document Uploaded',     'New document uploaded',                 'document',   true,  true, 'FileText'),
  ('document.overdue',     'Document Overdue',      'Document about to expire',              'compliance', true,  true, 'AlertTriangle'),
  ('compliance.expiring',  'Compliance Expiring',   'License/insurance expiring soon',       'compliance', true,  true, 'AlertTriangle'),
  ('invoice.created',      'Invoice Created',       'New invoice created',                   'invoice',    true,  true, 'FileText'),
  ('invoice.overdue',      'Invoice Overdue',       'Invoice past due date',                 'invoice',    true,  true, 'AlertCircle'),
  ('invoice.paid',         'Invoice Paid',          'Invoice marked as paid',                'invoice',    true,  true, 'CheckCircle2'),
  ('stock.low',            'Low Stock Alert',       'Stock level below threshold',           'stock',      true,  true, 'Package'),
  ('system.broadcast',     'System Broadcast',      'Platform-wide announcements',           'system',     true,  true, 'Megaphone'),
  ('system.maintenance',   'Maintenance Notice',    'Scheduled maintenance alerts',          'system',     true,  true, 'Wrench')
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- Seed default English templates
-- ============================================================================
INSERT INTO notification_templates (channel_code, locale, title_template, body_template, variables) VALUES
  ('chat.message',        'en', 'New message from {{sender_name}}', '{{message_preview}}', '["sender_name","message_preview"]'::jsonb),
  ('delivery.assigned',   'en', 'New delivery assigned', 'Delivery note {{note_number}} has been assigned to you', '["note_number"]'::jsonb),
  ('delivery.in_transit', 'en', 'Delivery in transit', 'Delivery {{note_number}} is now in transit', '["note_number"]'::jsonb),
  ('delivery.delivered',  'en', 'Delivery completed', 'Delivery {{note_number}} has been delivered', '["note_number"]'::jsonb),
  ('delivery.cancelled',  'en', 'Delivery cancelled', 'Delivery {{note_number}} was cancelled', '["note_number"]'::jsonb),
  ('document.uploaded',   'en', 'New document', '{{document_name}} has been uploaded', '["document_name"]'::jsonb),
  ('document.overdue',    'en', 'Document expiring', '{{document_name}} expires on {{expiry_date}}', '["document_name","expiry_date"]'::jsonb),
  ('compliance.expiring', 'en', 'Compliance expiring', '{{document_type}} for {{target}} expires soon', '["document_type","target"]'::jsonb),
  ('invoice.created',     'en', 'Invoice created', 'Invoice {{invoice_number}} for {{amount}}', '["invoice_number","amount"]'::jsonb),
  ('invoice.overdue',     'en', 'Invoice overdue', 'Invoice {{invoice_number}} is overdue', '["invoice_number"]'::jsonb),
  ('invoice.paid',        'en', 'Invoice paid', 'Invoice {{invoice_number}} has been paid', '["invoice_number"]'::jsonb),
  ('stock.low',           'en', 'Low stock alert', '{{product_name}} is running low ({{remaining}} left)', '["product_name","remaining"]'::jsonb),
  ('system.broadcast',    'en', '{{title}}', '{{body}}', '["title","body"]'::jsonb),
  ('system.maintenance',  'en', 'Scheduled maintenance', 'System will be down from {{start}} to {{end}}', '["start","end"]'::jsonb)
ON CONFLICT (channel_code, locale) DO NOTHING;

-- ============================================================================
-- Seed default permissions matrix
-- ============================================================================
INSERT INTO notification_permissions (role, channel_code, can_send, can_receive) VALUES
  -- super_admin can send/receive everything
  ('super_admin', 'chat.message',        true,  true),
  ('super_admin', 'delivery.assigned',   true,  true),
  ('super_admin', 'delivery.in_transit', true,  true),
  ('super_admin', 'delivery.delivered',  true,  true),
  ('super_admin', 'delivery.cancelled',  true,  true),
  ('super_admin', 'document.uploaded',   true,  true),
  ('super_admin', 'document.overdue',    true,  true),
  ('super_admin', 'compliance.expiring', true,  true),
  ('super_admin', 'invoice.created',     true,  true),
  ('super_admin', 'invoice.overdue',     true,  true),
  ('super_admin', 'invoice.paid',        true,  true),
  ('super_admin', 'stock.low',           true,  true),
  ('super_admin', 'system.broadcast',    true,  true),
  ('super_admin', 'system.maintenance',  true,  true),

  -- company_admin
  ('company_admin', 'chat.message',        true,  true),
  ('company_admin', 'delivery.assigned',   true,  true),
  ('company_admin', 'delivery.in_transit', false, true),
  ('company_admin', 'delivery.delivered',  false, true),
  ('company_admin', 'delivery.cancelled',  true,  true),
  ('company_admin', 'document.uploaded',   true,  true),
  ('company_admin', 'document.overdue',    true,  true),
  ('company_admin', 'compliance.expiring', false, true),
  ('company_admin', 'invoice.created',     false, true),
  ('company_admin', 'invoice.overdue',     false, true),
  ('company_admin', 'invoice.paid',        false, true),
  ('company_admin', 'stock.low',           false, true),
  ('company_admin', 'system.broadcast',    false, true),
  ('company_admin', 'system.maintenance',  false, true),

  -- logistics_admin
  ('logistics_admin', 'chat.message',        true,  true),
  ('logistics_admin', 'delivery.assigned',   true,  true),
  ('logistics_admin', 'delivery.in_transit', false, true),
  ('logistics_admin', 'delivery.delivered',  false, true),
  ('logistics_admin', 'delivery.cancelled',  true,  true),
  ('logistics_admin', 'system.broadcast',    false, true),

  -- driver
  ('driver', 'chat.message',        true,  true),
  ('driver', 'delivery.assigned',   false, true),
  ('driver', 'delivery.in_transit', false, true),
  ('driver', 'delivery.delivered',  false, true),
  ('driver', 'document.overdue',    false, true),
  ('driver', 'compliance.expiring', false, true),
  ('driver', 'system.broadcast',    false, true),

  -- depot_worker
  ('depot_worker', 'chat.message',        true,  true),
  ('depot_worker', 'delivery.delivered',  false, true),
  ('depot_worker', 'document.uploaded',   false, true),
  ('depot_worker', 'stock.low',           false, true),
  ('depot_worker', 'system.broadcast',    false, true),

  -- accountant
  ('accountant', 'chat.message',    true,  true),
  ('accountant', 'invoice.created', true,  true),
  ('accountant', 'invoice.overdue', true,  true),
  ('accountant', 'invoice.paid',    false, true),
  ('accountant', 'system.broadcast', false, true)
ON CONFLICT (role, channel_code) DO NOTHING;
