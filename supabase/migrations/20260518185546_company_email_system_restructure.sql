/*
  # Restructure Company Email System

  1. Modified Tables
    - `email_templates` - Add `audience` column ('platform', 'company', 'all')
      to clearly separate platform-only vs company-facing templates
    - `company_email_settings` - Extend with branding fields (logo, colors, from_name),
      reminder_day_30, send time window, CC options
    - `acc_contacts` - Add `preferred_locale` for per-client language preference

  2. New Templates
    - `invoice_final_reminder` - Final payment reminder (day 30, serious tone)
    - `payment_received_thank_you` - Thank you after payment received
    - `statement_monthly` - Monthly account statement summary

  3. Security
    - All new columns inherit existing RLS policies
    - company_email_deliveries_view uses security_invoker for proper RLS

  4. Notes
    - Platform templates (welcome, invite, password_reset, subscription, trial) marked as 'platform'
    - Invoice/payment templates marked as 'company'
    - Compliance, delivery, broadcast marked as 'all'
*/

-- 1. Add audience column to email_templates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_templates' AND column_name = 'audience'
  ) THEN
    ALTER TABLE email_templates ADD COLUMN audience text NOT NULL DEFAULT 'all'
      CHECK (audience IN ('platform', 'company', 'all'));
  END IF;
END $$;

-- Update existing templates with correct audience
UPDATE email_templates SET audience = 'platform'
WHERE code IN ('welcome_company', 'invite_user', 'password_reset', 'subscription_activated', 'trial_ending_soon')
  AND audience = 'all';

UPDATE email_templates SET audience = 'company'
WHERE code IN ('invoice_issued', 'invoice_paid', 'invoice_overdue')
  AND audience = 'all';

-- 2. Extend company_email_settings with branding and new options
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_email_settings' AND column_name = 'reminder_day_30'
  ) THEN
    ALTER TABLE company_email_settings
      ADD COLUMN reminder_day_30 boolean NOT NULL DEFAULT false,
      ADD COLUMN send_time_start time DEFAULT '09:00',
      ADD COLUMN send_time_end time DEFAULT '17:00',
      ADD COLUMN cc_admin_on_invoice boolean NOT NULL DEFAULT false,
      ADD COLUMN cc_email text NOT NULL DEFAULT '',
      ADD COLUMN brand_name text NOT NULL DEFAULT '',
      ADD COLUMN brand_logo_url text NOT NULL DEFAULT '',
      ADD COLUMN brand_primary_color text NOT NULL DEFAULT '#0f766e',
      ADD COLUMN brand_secondary_color text NOT NULL DEFAULT '#0f172a',
      ADD COLUMN reply_to_email text NOT NULL DEFAULT '',
      ADD COLUMN from_name text NOT NULL DEFAULT '',
      ADD COLUMN final_reminder_template_code text NOT NULL DEFAULT 'invoice_final_reminder';
  END IF;
END $$;

-- 3. Add preferred_locale to acc_contacts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acc_contacts' AND column_name = 'preferred_locale'
  ) THEN
    ALTER TABLE acc_contacts ADD COLUMN preferred_locale text DEFAULT NULL
      CHECK (preferred_locale IS NULL OR preferred_locale IN ('sq', 'de', 'en'));
  END IF;
END $$;

-- 4. Seed new company-facing templates
INSERT INTO email_templates (
  code, category, name, description, is_system, is_active, audience,
  preheader_sq, preheader_de, preheader_en,
  subject_sq, subject_de, subject_en,
  heading_sq, heading_de, heading_en,
  intro_sq, intro_de, intro_en,
  body_html_sq, body_html_de, body_html_en,
  cta_label_sq, cta_label_de, cta_label_en,
  cta_url, variables
) VALUES
(
  'invoice_final_reminder', 'transactional', 'Rikujtim i fundit - Fature e vonuar',
  'Paralajmerim i fundit per pagese para veprimit (dita 30+).', true, true, 'company',
  'Veprimi eshte i nevojshem per faturen {{invoice_number}}.',
  'Handlungsbedarf fur Rechnung {{invoice_number}}.',
  'Action required for invoice {{invoice_number}}.',
  'Rikujtim i fundit: Fatura {{invoice_number}}',
  'Letzte Erinnerung: Rechnung {{invoice_number}}',
  'Final reminder: Invoice {{invoice_number}}',
  'Rikujtim i fundit', 'Letzte Erinnerung', 'Final reminder',
  'Fatura <strong>{{invoice_number}}</strong> me total <strong>{{total_formatted}}</strong> eshte <strong>{{days_overdue}} dite</strong> ne vonese.',
  'Die Rechnung <strong>{{invoice_number}}</strong> uber <strong>{{total_formatted}}</strong> ist seit <strong>{{days_overdue}} Tagen</strong> uberfallig.',
  'Invoice <strong>{{invoice_number}}</strong> for <strong>{{total_formatted}}</strong> is <strong>{{days_overdue}} days</strong> overdue.',
  '<p>Kjo eshte rikujtesa e fundit per pagesen e fatures se mesiperme. Nese pagesa nuk kryhet brenda <strong>7 diteve</strong>, do te jemi te detyruar te ndjekim procedurat ligjore per mbledhjen e borxhit.</p><p><strong>Detajet e pageses:</strong><br/>IBAN: {{iban}}<br/>BIC: {{bic}}<br/>Banka: {{bank_name}}<br/>Referenca: {{invoice_number}}</p>',
  '<p>Dies ist die letzte Erinnerung fur die oben genannte Rechnung. Sollte die Zahlung nicht innerhalb von <strong>7 Tagen</strong> eingehen, werden wir rechtliche Schritte zur Forderungseinziehung einleiten.</p><p><strong>Zahlungsdaten:</strong><br/>IBAN: {{iban}}<br/>BIC: {{bic}}<br/>Bank: {{bank_name}}<br/>Referenz: {{invoice_number}}</p>',
  '<p>This is the final reminder for the above invoice. If payment is not received within <strong>7 days</strong>, we will be compelled to initiate debt collection proceedings.</p><p><strong>Payment details:</strong><br/>IBAN: {{iban}}<br/>BIC: {{bic}}<br/>Bank: {{bank_name}}<br/>Reference: {{invoice_number}}</p>',
  'Paguaj tani', 'Jetzt bezahlen', 'Pay now',
  '{{payment_link}}',
  '["invoice_number","total_formatted","days_overdue","iban","bic","bank_name","payment_link","customer_name","company_name","app_base_url"]'::jsonb
),
(
  'payment_received_thank_you', 'transactional', 'Konfirmim pagese - Faleminderit',
  'Dergohet kur nje fature regjistrohet si e paguar.', true, true, 'company',
  'Pagesa per faturen {{invoice_number}} u konfirmua.',
  'Zahlung fur Rechnung {{invoice_number}} bestatigt.',
  'Payment for invoice {{invoice_number}} confirmed.',
  'Pagesa u pranua - {{invoice_number}}',
  'Zahlung erhalten - {{invoice_number}}',
  'Payment received - {{invoice_number}}',
  'Faleminderit per pagesen!', 'Vielen Dank fur Ihre Zahlung!', 'Thank you for your payment!',
  'Konfirmojme pranimin e pageses per faturen <strong>{{invoice_number}}</strong> me vlere <strong>{{total_formatted}}</strong>.',
  'Wir bestatigen den Erhalt Ihrer Zahlung fur Rechnung <strong>{{invoice_number}}</strong> in Hohe von <strong>{{total_formatted}}</strong>.',
  'We confirm receipt of your payment for invoice <strong>{{invoice_number}}</strong> in the amount of <strong>{{total_formatted}}</strong>.',
  '<p>Pagesa juaj eshte regjistruar me sukses ne sistemin tone. Faleminderit per bashkepunimin dhe per pagesen e shpejte.</p><p>Nese keni pyetje ose nevojiten informacione te metejshme, mos hezitoni te na kontaktoni.</p>',
  '<p>Ihre Zahlung wurde erfolgreich in unserem System verbucht. Vielen Dank fur die prompte Uberweisung und die gute Zusammenarbeit.</p><p>Bei Fragen stehen wir Ihnen gerne zur Verfugung.</p>',
  '<p>Your payment has been successfully recorded in our system. Thank you for your prompt payment and continued partnership.</p><p>If you have any questions or need further information, please do not hesitate to contact us.</p>',
  'Shiko faturen', 'Rechnung ansehen', 'View invoice',
  '{{invoice_url}}',
  '["invoice_number","total_formatted","invoice_url","customer_name","company_name","payment_date"]'::jsonb
),
(
  'statement_monthly', 'transactional', 'Pasqyre mujore - Llogari klienti',
  'Permbledhje mujore e faturave te hapura per nje klient.', true, true, 'company',
  'Keni {{open_count}} fatura te hapura me total {{total_outstanding}}.',
  'Sie haben {{open_count}} offene Rechnungen uber {{total_outstanding}}.',
  'You have {{open_count}} open invoices totalling {{total_outstanding}}.',
  'Pasqyre mujore e llogarise - {{statement_period}}',
  'Monatliche Kontoubersicht - {{statement_period}}',
  'Monthly account statement - {{statement_period}}',
  'Pasqyra e llogarise suaj', 'Ihre Kontoubersicht', 'Your account statement',
  'Ju dergojme pasqyren mujore te llogarise suaj per periudhen <strong>{{statement_period}}</strong>.',
  'Anbei Ihre monatliche Kontoubersicht fur den Zeitraum <strong>{{statement_period}}</strong>.',
  'Please find your monthly account statement for the period <strong>{{statement_period}}</strong>.',
  '<p><strong>Permbledhje:</strong></p><ul><li>Fatura te hapura: <strong>{{open_count}}</strong></li><li>Totali i papaguar: <strong>{{total_outstanding}}</strong></li><li>Fatura me e vjeter: <strong>{{oldest_invoice_date}}</strong></li></ul><p>Ju lutemi kryeni pagesen per faturat e hapura per te mbajtur llogarite ne rregull.</p>',
  '<p><strong>Zusammenfassung:</strong></p><ul><li>Offene Rechnungen: <strong>{{open_count}}</strong></li><li>Gesamtbetrag: <strong>{{total_outstanding}}</strong></li><li>Alteste Rechnung: <strong>{{oldest_invoice_date}}</strong></li></ul><p>Bitte begleichen Sie die offenen Betrage.</p>',
  '<p><strong>Summary:</strong></p><ul><li>Open invoices: <strong>{{open_count}}</strong></li><li>Total outstanding: <strong>{{total_outstanding}}</strong></li><li>Oldest invoice: <strong>{{oldest_invoice_date}}</strong></li></ul><p>Please process the outstanding payments at your earliest convenience.</p>',
  'Shiko llogarite', 'Konto ansehen', 'View account',
  '{{app_base_url}}/accounting/invoices',
  '["statement_period","open_count","total_outstanding","oldest_invoice_date","customer_name","company_name","app_base_url"]'::jsonb
)
ON CONFLICT (code) DO NOTHING;

-- 5. Create index on audience for faster filtering
CREATE INDEX IF NOT EXISTS idx_email_templates_audience ON email_templates (audience);
