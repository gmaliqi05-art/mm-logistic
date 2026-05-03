/*
  # Infrastruktura e Email-eve Transaksionale

  Permbledhje:
  - Shton kolonen `locale` ne `profiles` (default 'sq')
  - Krijon tabelen `email_deliveries` per loggim te cdo dergimi emaili
  - Krijon tabelen `unsubscribe_tokens` per respektim CAN-SPAM
  - UPSERT vlerat default per brand ne `platform_settings`

  Security:
  - RLS i plote ne te dyja tabelat e reja
  - email_deliveries: super_admin sheh gjithcka, user sheh te veten
  - unsubscribe_tokens: po aty, me token perdoret nga edge fn publike
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'locale'
  ) THEN
    ALTER TABLE public.profiles
      ADD COLUMN locale text NOT NULL DEFAULT 'sq'
      CHECK (locale IN ('sq', 'de', 'en'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.email_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  recipient_email text NOT NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  template_code text NOT NULL,
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sent', 'failed', 'skipped')),
  provider text NOT NULL DEFAULT 'resend',
  provider_id text,
  error text,
  locale text NOT NULL DEFAULT 'sq',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_email_deliveries_user ON public.email_deliveries(user_id);
CREATE INDEX IF NOT EXISTS idx_email_deliveries_company ON public.email_deliveries(company_id);
CREATE INDEX IF NOT EXISTS idx_email_deliveries_status ON public.email_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_email_deliveries_template ON public.email_deliveries(template_code);
CREATE INDEX IF NOT EXISTS idx_email_deliveries_created ON public.email_deliveries(created_at DESC);

ALTER TABLE public.email_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins can view all email deliveries" ON public.email_deliveries;
CREATE POLICY "Super admins can view all email deliveries"
  ON public.email_deliveries FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

DROP POLICY IF EXISTS "Users view own email deliveries" ON public.email_deliveries;
CREATE POLICY "Users view own email deliveries"
  ON public.email_deliveries FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.unsubscribe_tokens (
  token text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  channel_code text NOT NULL DEFAULT 'all',
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_unsubscribe_tokens_user ON public.unsubscribe_tokens(user_id);

ALTER TABLE public.unsubscribe_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins view unsubscribe tokens" ON public.unsubscribe_tokens;
CREATE POLICY "Super admins view unsubscribe tokens"
  ON public.unsubscribe_tokens FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

DROP POLICY IF EXISTS "Users view own unsubscribe tokens" ON public.unsubscribe_tokens;
CREATE POLICY "Users view own unsubscribe tokens"
  ON public.unsubscribe_tokens FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

INSERT INTO public.platform_settings (key, value, description)
VALUES
  ('email_from_address', 'noreply@margroup.app', 'Email sender address for transactional emails'),
  ('email_reply_to', 'support@margroup.app', 'Reply-to email address'),
  ('email_brand_name', 'MM Logistic', 'Brand name shown in email headers'),
  ('email_brand_primary_color', '#0f766e', 'Primary brand color (teal) for email CTAs'),
  ('email_brand_secondary_color', '#0f172a', 'Secondary brand color (slate) for email headings'),
  ('email_brand_logo_url', '', 'Public URL for brand logo used in emails'),
  ('email_legal_address', '', 'Legal company address shown in email footers'),
  ('email_support_url', 'https://margroup.app/support', 'Support URL shown in email footers'),
  ('email_app_base_url', '', 'Base URL of the app used for CTA links in emails')
ON CONFLICT (key) DO NOTHING;
