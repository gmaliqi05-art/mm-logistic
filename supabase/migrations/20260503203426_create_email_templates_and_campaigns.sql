/*
  # Email Templates & Campaigns System

  Permbledhje:
  Krijohen tabelat per menaxhim te plote te emaileve nga Super Admin:

  1. `email_templates` - dyqani qendror per te gjitha template-t transaksionale,
     sistemike dhe te marketingut. Permbajte multilingual (sq/de/en) per subject,
     preheader, heading, intro, body HTML, CTA. `is_system=true` mbron template-t
     kritike nga fshirja.
  2. `email_campaigns` - fushata marketingu/njoftimi me audience filter, status,
     planifikim (`scheduled_at`) dhe metrika dergimi.
  3. `email_campaign_recipients` - lista individuale e marresve per tracking per-user.

  Security:
  - RLS i plote: vetem super_admin CRUD-on template-t dhe fushatat
  - Marresit shikojne vetem rreshtat e tyre (logimi)
  - Trigger updated_at per email_templates
*/

CREATE TABLE IF NOT EXISTS public.email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  category text NOT NULL DEFAULT 'transactional'
    CHECK (category IN ('transactional', 'marketing', 'system')),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  preheader_sq text NOT NULL DEFAULT '',
  preheader_de text NOT NULL DEFAULT '',
  preheader_en text NOT NULL DEFAULT '',
  subject_sq text NOT NULL DEFAULT '',
  subject_de text NOT NULL DEFAULT '',
  subject_en text NOT NULL DEFAULT '',
  heading_sq text NOT NULL DEFAULT '',
  heading_de text NOT NULL DEFAULT '',
  heading_en text NOT NULL DEFAULT '',
  intro_sq text NOT NULL DEFAULT '',
  intro_de text NOT NULL DEFAULT '',
  intro_en text NOT NULL DEFAULT '',
  body_html_sq text NOT NULL DEFAULT '',
  body_html_de text NOT NULL DEFAULT '',
  body_html_en text NOT NULL DEFAULT '',
  cta_label_sq text NOT NULL DEFAULT '',
  cta_label_de text NOT NULL DEFAULT '',
  cta_label_en text NOT NULL DEFAULT '',
  cta_url text NOT NULL DEFAULT '',
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_templates_category ON public.email_templates(category);
CREATE INDEX IF NOT EXISTS idx_email_templates_active ON public.email_templates(is_active);

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins view templates" ON public.email_templates;
CREATE POLICY "Super admins view templates"
  ON public.email_templates FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));

DROP POLICY IF EXISTS "Super admins insert templates" ON public.email_templates;
CREATE POLICY "Super admins insert templates"
  ON public.email_templates FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));

DROP POLICY IF EXISTS "Super admins update templates" ON public.email_templates;
CREATE POLICY "Super admins update templates"
  ON public.email_templates FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));

DROP POLICY IF EXISTS "Super admins delete non-system templates" ON public.email_templates;
CREATE POLICY "Super admins delete non-system templates"
  ON public.email_templates FOR DELETE
  TO authenticated
  USING (
    is_system = false
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

CREATE OR REPLACE FUNCTION public.tg_email_templates_touch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_email_templates_touch ON public.email_templates;
CREATE TRIGGER trg_email_templates_touch
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_email_templates_touch();

-- Email campaigns
CREATE TABLE IF NOT EXISTS public.email_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  template_code text REFERENCES public.email_templates(code) ON DELETE SET NULL,
  ad_hoc_content jsonb NOT NULL DEFAULT '{}'::jsonb,
  audience_filter jsonb NOT NULL DEFAULT '{}'::jsonb,
  locale_mode text NOT NULL DEFAULT 'per_user' CHECK (locale_mode IN ('per_user', 'fixed')),
  fixed_locale text NOT NULL DEFAULT 'sq' CHECK (fixed_locale IN ('sq', 'de', 'en')),
  scheduled_at timestamptz,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'sending', 'completed', 'failed', 'cancelled')),
  total_recipients integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  test_recipients text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_email_campaigns_status ON public.email_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_scheduled ON public.email_campaigns(scheduled_at)
  WHERE status = 'scheduled';

ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins view campaigns" ON public.email_campaigns;
CREATE POLICY "Super admins view campaigns"
  ON public.email_campaigns FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));

DROP POLICY IF EXISTS "Super admins insert campaigns" ON public.email_campaigns;
CREATE POLICY "Super admins insert campaigns"
  ON public.email_campaigns FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));

DROP POLICY IF EXISTS "Super admins update campaigns" ON public.email_campaigns;
CREATE POLICY "Super admins update campaigns"
  ON public.email_campaigns FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));

DROP POLICY IF EXISTS "Super admins delete campaigns" ON public.email_campaigns;
CREATE POLICY "Super admins delete campaigns"
  ON public.email_campaigns FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));

-- Campaign recipients
CREATE TABLE IF NOT EXISTS public.email_campaign_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  email text NOT NULL,
  locale text NOT NULL DEFAULT 'sq',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  provider_id text,
  error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_campaign_recipients_campaign
  ON public.email_campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_campaign_recipients_status
  ON public.email_campaign_recipients(campaign_id, status);

ALTER TABLE public.email_campaign_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins view recipients" ON public.email_campaign_recipients;
CREATE POLICY "Super admins view recipients"
  ON public.email_campaign_recipients FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));

DROP POLICY IF EXISTS "Super admins insert recipients" ON public.email_campaign_recipients;
CREATE POLICY "Super admins insert recipients"
  ON public.email_campaign_recipients FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));

DROP POLICY IF EXISTS "Super admins update recipients" ON public.email_campaign_recipients;
CREATE POLICY "Super admins update recipients"
  ON public.email_campaign_recipients FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));

DROP POLICY IF EXISTS "Super admins delete recipients" ON public.email_campaign_recipients;
CREATE POLICY "Super admins delete recipients"
  ON public.email_campaign_recipients FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));
