/*
  # Add company-level email settings and template overrides

  1. Modified Tables
    - `email_templates` - Add nullable `company_id` column for company-specific overrides
      - When NULL = platform-wide (super-admin template)
      - When set = company-specific override/custom template

  2. New Tables
    - `company_email_settings`
      - `company_id` (uuid, UNIQUE, FK to companies)
      - `auto_send_on_finalize` (boolean) - auto-send invoice email on finalization
      - `auto_reminder_enabled` (boolean) - enable automatic overdue reminders
      - `reminder_day_0/7/14` (booleans) - which reminders to send
      - `default_locale` (text) - default email language
      - `invoice_template_code`, `reminder_template_code` (text)

  3. Security
    - RLS enabled on company_email_settings
    - Company admins can read/write their own settings
    - email_templates: company members can view global + own templates
*/

-- Add company_id to email_templates for company overrides
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_templates' AND column_name = 'company_id'
  ) THEN
    ALTER TABLE email_templates ADD COLUMN company_id uuid REFERENCES companies(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Index for company template lookup (company-specific templates)
CREATE INDEX IF NOT EXISTS idx_email_templates_company
  ON email_templates (company_id) WHERE company_id IS NOT NULL;

-- Unique index for company overrides (a company can only override a code once)
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_templates_code_company_override
  ON email_templates (code, company_id) WHERE company_id IS NOT NULL;

-- Add RLS policies for company-specific templates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Company members can view own templates' AND tablename = 'email_templates'
  ) THEN
    CREATE POLICY "Company members can view own templates"
      ON email_templates FOR SELECT
      TO authenticated
      USING (
        company_id IS NULL
        OR company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Company admins can insert own templates' AND tablename = 'email_templates'
  ) THEN
    CREATE POLICY "Company admins can insert own templates"
      ON email_templates FOR INSERT
      TO authenticated
      WITH CHECK (
        company_id IN (
          SELECT company_id FROM profiles WHERE id = auth.uid()
            AND role IN ('company_admin', 'accountant', 'logistics_admin')
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Company admins can update own templates' AND tablename = 'email_templates'
  ) THEN
    CREATE POLICY "Company admins can update own templates"
      ON email_templates FOR UPDATE
      TO authenticated
      USING (
        company_id IN (
          SELECT company_id FROM profiles WHERE id = auth.uid()
            AND role IN ('company_admin', 'accountant', 'logistics_admin')
        )
      )
      WITH CHECK (
        company_id IN (
          SELECT company_id FROM profiles WHERE id = auth.uid()
            AND role IN ('company_admin', 'accountant', 'logistics_admin')
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Company admins can delete own templates' AND tablename = 'email_templates'
  ) THEN
    CREATE POLICY "Company admins can delete own templates"
      ON email_templates FOR DELETE
      TO authenticated
      USING (
        company_id IN (
          SELECT company_id FROM profiles WHERE id = auth.uid()
            AND role IN ('company_admin', 'accountant', 'logistics_admin')
        )
        AND is_system = false
      );
  END IF;
END $$;

-- Company email settings table
CREATE TABLE IF NOT EXISTS company_email_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE UNIQUE,
  auto_send_on_finalize boolean NOT NULL DEFAULT false,
  auto_reminder_enabled boolean NOT NULL DEFAULT true,
  reminder_day_0 boolean NOT NULL DEFAULT true,
  reminder_day_7 boolean NOT NULL DEFAULT true,
  reminder_day_14 boolean NOT NULL DEFAULT true,
  default_locale text NOT NULL DEFAULT 'sq' CHECK (default_locale IN ('sq', 'de', 'en')),
  invoice_template_code text NOT NULL DEFAULT 'invoice_issued',
  reminder_template_code text NOT NULL DEFAULT 'invoice_overdue',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE company_email_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view own email settings"
  ON company_email_settings FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Company admins can insert email settings"
  ON company_email_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
        AND role IN ('company_admin', 'accountant', 'logistics_admin')
    )
  );

CREATE POLICY "Company admins can update email settings"
  ON company_email_settings FOR UPDATE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
        AND role IN ('company_admin', 'accountant', 'logistics_admin')
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
        AND role IN ('company_admin', 'accountant', 'logistics_admin')
    )
  );
