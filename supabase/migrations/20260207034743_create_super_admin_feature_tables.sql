/*
  # Create tables for Super Admin features

  1. New Tables
    - `static_pages` - Legal & static pages (Privacy Policy, Terms, About, etc.)
      - `id` (uuid, primary key)
      - `slug` (text, unique) - URL-friendly identifier
      - `title` (text) - Page title
      - `content` (text) - Page HTML/text content
      - `is_active` (boolean) - Whether page is published
      - `sort_order` (integer) - Display ordering
      - `created_at`, `updated_at` (timestamptz)

    - `footer_links` - Footer links and social media links
      - `id` (uuid, primary key)
      - `category` (text) - 'social', 'platform', 'company', 'legal'
      - `label` (text) - Link display text
      - `url` (text) - Link URL
      - `icon_name` (text) - Lucide icon name
      - `is_active` (boolean)
      - `sort_order` (integer)
      - `created_at` (timestamptz)

    - `qr_codes` - QR code management
      - `id` (uuid, primary key)
      - `name` (text) - QR code label
      - `target_url` (text) - URL the QR code points to
      - `description` (text)
      - `is_active` (boolean)
      - `scan_count` (integer) - Track scans
      - `created_at` (timestamptz)

    - `seo_metadata` - Per-page SEO settings
      - `id` (uuid, primary key)
      - `page_path` (text, unique) - Route path
      - `title` (text) - SEO title
      - `description` (text) - Meta description
      - `keywords` (text) - Meta keywords
      - `og_image_url` (text) - Open Graph image
      - `updated_at` (timestamptz)

    - `user_manual_sections` - User manual documentation
      - `id` (uuid, primary key)
      - `title` (text) - Section title
      - `content` (text) - Section content
      - `target_role` (text) - Which role this applies to
      - `sort_order` (integer)
      - `is_active` (boolean)
      - `created_at`, `updated_at` (timestamptz)

  2. Security
    - RLS enabled on all tables
    - Only super admins can manage all tables
    - Public read access for static_pages and footer_links (for homepage display)

  3. Seed Data
    - Default platform settings for footer, map, PWA, SEO, notifications
    - Default static pages (Privacy Policy, Terms)
    - Default footer links
*/

-- Static Pages Table
CREATE TABLE IF NOT EXISTS static_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE static_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view active static pages"
  ON static_pages FOR SELECT TO anon, authenticated
  USING (is_active = true);

CREATE POLICY "Super admins can view all static pages"
  ON static_pages FOR SELECT TO authenticated
  USING (is_super_admin_safe());

CREATE POLICY "Super admins can insert static pages"
  ON static_pages FOR INSERT TO authenticated
  WITH CHECK (is_super_admin_safe());

CREATE POLICY "Super admins can update static pages"
  ON static_pages FOR UPDATE TO authenticated
  USING (is_super_admin_safe())
  WITH CHECK (is_super_admin_safe());

CREATE POLICY "Super admins can delete static pages"
  ON static_pages FOR DELETE TO authenticated
  USING (is_super_admin_safe());

-- Footer Links Table
CREATE TABLE IF NOT EXISTS footer_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL DEFAULT 'platform',
  label text NOT NULL DEFAULT '',
  url text NOT NULL DEFAULT '',
  icon_name text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE footer_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view active footer links"
  ON footer_links FOR SELECT TO anon, authenticated
  USING (is_active = true);

CREATE POLICY "Super admins can view all footer links"
  ON footer_links FOR SELECT TO authenticated
  USING (is_super_admin_safe());

CREATE POLICY "Super admins can insert footer links"
  ON footer_links FOR INSERT TO authenticated
  WITH CHECK (is_super_admin_safe());

CREATE POLICY "Super admins can update footer links"
  ON footer_links FOR UPDATE TO authenticated
  USING (is_super_admin_safe())
  WITH CHECK (is_super_admin_safe());

CREATE POLICY "Super admins can delete footer links"
  ON footer_links FOR DELETE TO authenticated
  USING (is_super_admin_safe());

-- QR Codes Table
CREATE TABLE IF NOT EXISTS qr_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  target_url text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  scan_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE qr_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view qr codes"
  ON qr_codes FOR SELECT TO authenticated
  USING (is_super_admin_safe());

CREATE POLICY "Super admins can insert qr codes"
  ON qr_codes FOR INSERT TO authenticated
  WITH CHECK (is_super_admin_safe());

CREATE POLICY "Super admins can update qr codes"
  ON qr_codes FOR UPDATE TO authenticated
  USING (is_super_admin_safe())
  WITH CHECK (is_super_admin_safe());

CREATE POLICY "Super admins can delete qr codes"
  ON qr_codes FOR DELETE TO authenticated
  USING (is_super_admin_safe());

-- SEO Metadata Table
CREATE TABLE IF NOT EXISTS seo_metadata (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_path text UNIQUE NOT NULL,
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  keywords text NOT NULL DEFAULT '',
  og_image_url text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE seo_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view seo metadata"
  ON seo_metadata FOR SELECT TO authenticated
  USING (is_super_admin_safe());

CREATE POLICY "Super admins can insert seo metadata"
  ON seo_metadata FOR INSERT TO authenticated
  WITH CHECK (is_super_admin_safe());

CREATE POLICY "Super admins can update seo metadata"
  ON seo_metadata FOR UPDATE TO authenticated
  USING (is_super_admin_safe())
  WITH CHECK (is_super_admin_safe());

CREATE POLICY "Super admins can delete seo metadata"
  ON seo_metadata FOR DELETE TO authenticated
  USING (is_super_admin_safe());

-- User Manual Sections Table
CREATE TABLE IF NOT EXISTS user_manual_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  target_role text NOT NULL DEFAULT 'all',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_manual_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view active manual sections"
  ON user_manual_sections FOR SELECT TO authenticated
  USING (is_active = true OR is_super_admin_safe());

CREATE POLICY "Super admins can insert manual sections"
  ON user_manual_sections FOR INSERT TO authenticated
  WITH CHECK (is_super_admin_safe());

CREATE POLICY "Super admins can update manual sections"
  ON user_manual_sections FOR UPDATE TO authenticated
  USING (is_super_admin_safe())
  WITH CHECK (is_super_admin_safe());

CREATE POLICY "Super admins can delete manual sections"
  ON user_manual_sections FOR DELETE TO authenticated
  USING (is_super_admin_safe());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_static_pages_slug ON static_pages(slug);
CREATE INDEX IF NOT EXISTS idx_static_pages_active ON static_pages(is_active);
CREATE INDEX IF NOT EXISTS idx_footer_links_category ON footer_links(category);
CREATE INDEX IF NOT EXISTS idx_footer_links_active ON footer_links(is_active);
CREATE INDEX IF NOT EXISTS idx_qr_codes_active ON qr_codes(is_active);
CREATE INDEX IF NOT EXISTS idx_seo_metadata_path ON seo_metadata(page_path);
CREATE INDEX IF NOT EXISTS idx_user_manual_role ON user_manual_sections(target_role);

-- Seed default platform settings for new features
INSERT INTO platform_settings (key, value, description) VALUES
  ('footer_copyright', '© 2026 Booking Shpk. Te gjitha te drejtat e rezervuara.', 'Teksti i te drejtave te autorit ne footer'),
  ('footer_company_name', 'Booking Shpk', 'Emri i kompanise ne footer'),
  ('footer_description', 'Platforma me e avancuar per menaxhimin e logjistikes se paletave ne Europe.', 'Pershkrimi ne footer'),
  ('footer_nui', '812373174', 'NUI i kompanise'),
  ('map_latitude', '42.3702', 'Gjeresia gjeografike e hartes ne homepage'),
  ('map_longitude', '21.1553', 'Gjatesia gjeografike e hartes ne homepage'),
  ('map_zoom', '15', 'Niveli i zoom-it te hartes'),
  ('map_address', 'Rr. Epopeja e Jezercit Nr. 402, Ferizaj 70000, Kosove', 'Adresa ne harte'),
  ('map_enabled', 'true', 'Aktivizo harten ne homepage'),
  ('pwa_app_name', 'EuroPallet Logistics', 'Emri i aplikacionit PWA'),
  ('pwa_short_name', 'EuroPallet', 'Emri i shkurter PWA'),
  ('pwa_description', 'Platforma per menaxhimin e logjistikes', 'Pershkrimi PWA'),
  ('pwa_theme_color', '#0d9488', 'Ngjyra e temes PWA'),
  ('pwa_background_color', '#ffffff', 'Ngjyra e sfondit PWA'),
  ('pwa_display', 'standalone', 'Modaliteti i shfaqjes PWA'),
  ('pwa_enabled', 'false', 'Aktivizo PWA'),
  ('app_store_url', '', 'URL e App Store (iOS)'),
  ('play_store_url', '', 'URL e Play Store (Android)'),
  ('app_download_enabled', 'false', 'Aktivizo shkarkimin e aplikacionit')
ON CONFLICT (key) DO NOTHING;

-- Seed default static pages
INSERT INTO static_pages (slug, title, content, is_active, sort_order) VALUES
  ('privacy-policy', 'Politika e Privatesise', 'Permbajtja e politikes se privatesise...', true, 0),
  ('terms-of-service', 'Kushtet e Perdorimit', 'Permbajtja e kushteve te perdorimit...', true, 1),
  ('about-us', 'Rreth Nesh', 'Permbajtja e faqes Rreth Nesh...', true, 2)
ON CONFLICT (slug) DO NOTHING;

-- Seed default footer links
INSERT INTO footer_links (category, label, url, icon_name, sort_order) VALUES
  ('social', 'Facebook', 'https://facebook.com', 'Facebook', 0),
  ('social', 'Instagram', 'https://instagram.com', 'Instagram', 1),
  ('social', 'LinkedIn', 'https://linkedin.com', 'Linkedin', 2),
  ('platform', 'Menaxhim Stoku', '#services', '', 0),
  ('platform', 'Gjurmim Dergesash', '#services', '', 1),
  ('platform', 'Komunikim', '#services', '', 2),
  ('platform', 'Raportim', '#services', '', 3),
  ('company', 'Rreth Nesh', '#about', '', 0),
  ('company', 'Karriera', '#about', '', 1),
  ('company', 'Blog', '#about', '', 2),
  ('legal', 'Politika e Privatesise', '/privacy-policy', '', 0),
  ('legal', 'Kushtet e Perdorimit', '/terms', '', 1)
ON CONFLICT DO NOTHING;

-- Seed default SEO metadata
INSERT INTO seo_metadata (page_path, title, description, keywords) VALUES
  ('/', 'EuroPallet Logistics - Platforma #1 e Logjistikes', 'Platforma me e avancuar per menaxhimin e logjistikes se paletave europiane.', 'pallet, logjistike, transport, europallet, menaxhim'),
  ('/login', 'Hyrni - EuroPallet Logistics', 'Hyrni ne platformen EuroPallet Logistics', 'login, hyrje, europallet'),
  ('/register', 'Regjistrohu - EuroPallet Logistics', 'Regjistrohu ne platformen EuroPallet Logistics', 'register, regjistrim, europallet')
ON CONFLICT (page_path) DO NOTHING;

-- Seed default user manual sections
INSERT INTO user_manual_sections (title, content, target_role, sort_order) VALUES
  ('Hyrja ne Platforme', 'Per te hyre ne platforme, shkoni ne faqen e hyrjes dhe vendosni email-in dhe fjalekalimin tuaj.', 'all', 0),
  ('Menaxhimi i Stokut', 'Si te shtoni, modifikoni dhe fshini artikuj nga stoku.', 'company_admin', 1),
  ('Fletedergesat', 'Si te krijoni dhe menaxhoni fletedergesa per dergesat.', 'driver', 2),
  ('Chat dhe Komunikimi', 'Si te perdorni sistemin e chat-it per komunikim me ekipin.', 'all', 3)
ON CONFLICT DO NOTHING;
