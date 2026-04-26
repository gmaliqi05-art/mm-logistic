/*
  # Create homepage content and platform settings tables

  1. New Tables
    - `homepage_content`
      - `id` (uuid, primary key)
      - `section_type` (text) - hero, banner, feature, testimonial, ad
      - `title` (text)
      - `subtitle` (text)
      - `content` (text)
      - `image_url` (text)
      - `link_url` (text)
      - `link_text` (text)
      - `sort_order` (integer)
      - `is_active` (boolean, default true)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    - `platform_settings`
      - `id` (uuid, primary key)
      - `key` (text, unique)
      - `value` (text)
      - `description` (text)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - Public can read active homepage_content
    - Only super admins can manage homepage_content
    - Only super admins can read/manage platform_settings

  3. Seed Data
    - Default hero section content
    - Default payment settings keys (Stripe, PayPal)
*/

-- Homepage Content Table
CREATE TABLE IF NOT EXISTS homepage_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_type text NOT NULL DEFAULT 'banner',
  title text NOT NULL DEFAULT '',
  subtitle text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  image_url text NOT NULL DEFAULT '',
  link_url text NOT NULL DEFAULT '',
  link_text text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE homepage_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view active homepage content"
  ON homepage_content
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

CREATE POLICY "Super admins can view all homepage content"
  ON homepage_content
  FOR SELECT
  TO authenticated
  USING (is_super_admin_safe());

CREATE POLICY "Super admins can insert homepage content"
  ON homepage_content
  FOR INSERT
  TO authenticated
  WITH CHECK (is_super_admin_safe());

CREATE POLICY "Super admins can update homepage content"
  ON homepage_content
  FOR UPDATE
  TO authenticated
  USING (is_super_admin_safe())
  WITH CHECK (is_super_admin_safe());

CREATE POLICY "Super admins can delete homepage content"
  ON homepage_content
  FOR DELETE
  TO authenticated
  USING (is_super_admin_safe());

-- Platform Settings Table
CREATE TABLE IF NOT EXISTS platform_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view platform settings"
  ON platform_settings
  FOR SELECT
  TO authenticated
  USING (is_super_admin_safe());

CREATE POLICY "Super admins can insert platform settings"
  ON platform_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (is_super_admin_safe());

CREATE POLICY "Super admins can update platform settings"
  ON platform_settings
  FOR UPDATE
  TO authenticated
  USING (is_super_admin_safe())
  WITH CHECK (is_super_admin_safe());

CREATE POLICY "Super admins can delete platform settings"
  ON platform_settings
  FOR DELETE
  TO authenticated
  USING (is_super_admin_safe());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_homepage_content_section_type ON homepage_content(section_type);
CREATE INDEX IF NOT EXISTS idx_homepage_content_sort_order ON homepage_content(sort_order);
CREATE INDEX IF NOT EXISTS idx_homepage_content_active ON homepage_content(is_active);
CREATE INDEX IF NOT EXISTS idx_platform_settings_key ON platform_settings(key);

-- Seed default homepage content
INSERT INTO homepage_content (section_type, title, subtitle, image_url, sort_order, is_active) VALUES
  ('hero', 'Miresevini ne EuroPallet Logistics', 'Platforma me e avancuar per menaxhimin e logjistikes se paletave europiane.', 'https://images.pexels.com/photos/1267338/pexels-photo-1267338.jpeg?auto=compress&cs=tinysrgb&w=1920', 0, true),
  ('banner', 'Menaxhoni logjistiken me efikasitet maksimal', 'Gjurmoni, menaxhoni dhe optimizoni zinxhirin tuaj te furnizimit me platformen tone.', 'https://images.pexels.com/photos/4483610/pexels-photo-4483610.jpeg?auto=compress&cs=tinysrgb&w=1920', 1, true),
  ('ad', 'Oferta Speciale - 30 Dite Falas', 'Filloni proven tuaj falas sot dhe zbuloni te gjitha mundesite e platformes.', 'https://images.pexels.com/photos/6169668/pexels-photo-6169668.jpeg?auto=compress&cs=tinysrgb&w=1920', 2, true)
ON CONFLICT DO NOTHING;

-- Seed default platform settings
INSERT INTO platform_settings (key, value, description) VALUES
  ('stripe_publishable_key', '', 'Stripe Publishable Key (pk_live_... ose pk_test_...)'),
  ('stripe_secret_key', '', 'Stripe Secret Key (sk_live_... ose sk_test_...)'),
  ('stripe_webhook_secret', '', 'Stripe Webhook Signing Secret (whsec_...)'),
  ('paypal_client_id', '', 'PayPal Client ID'),
  ('paypal_client_secret', '', 'PayPal Client Secret'),
  ('paypal_mode', 'sandbox', 'PayPal Mode (sandbox ose live)'),
  ('payment_enabled', 'false', 'Aktivizo pagesat online'),
  ('platform_name', 'EuroPallet Logistics', 'Emri i platformes'),
  ('platform_email', 'info@bookingshpk.com', 'Email i platformes'),
  ('platform_phone', '+383 49 000 000', 'Telefoni i platformes')
ON CONFLICT (key) DO NOTHING;
