/*
  # Create Legal Documents Table for CMS Management

  1. New Tables
    - `legal_documents`
      - `id` (uuid, primary key)
      - `slug` (text) - document identifier (impressum, terms, privacy, etc.)
      - `language` (text) - language code (sq, en, de, fr)
      - `title` (text) - document title
      - `subtitle` (text) - document subtitle
      - `content_json` (jsonb) - sections as JSON array
      - `last_updated` (text) - displayed last updated date
      - `version` (text) - document version string
      - `is_active` (boolean) - whether this version is published
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `legal_documents` table
    - Public can read active documents
    - Only super admins can modify

  3. Notes
    - Unique constraint on (slug, language) to prevent duplicates
    - content_json stores array of sections: [{title, content}]
*/

CREATE TABLE IF NOT EXISTS public.legal_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  language text NOT NULL DEFAULT 'sq',
  title text NOT NULL DEFAULT '',
  subtitle text NOT NULL DEFAULT '',
  content_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_updated text NOT NULL DEFAULT '',
  version text NOT NULL DEFAULT '1.0',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT legal_documents_slug_language_unique UNIQUE (slug, language)
);

ALTER TABLE public.legal_documents ENABLE ROW LEVEL SECURITY;

-- Public can read active documents (needed for public legal pages)
CREATE POLICY "Anyone can read active legal documents"
  ON public.legal_documents
  FOR SELECT
  USING (is_active = true);

-- Super admins can insert
CREATE POLICY "Super admins can insert legal documents"
  ON public.legal_documents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

-- Super admins can update
CREATE POLICY "Super admins can update legal documents"
  ON public.legal_documents
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

-- Super admins can delete
CREATE POLICY "Super admins can delete legal documents"
  ON public.legal_documents
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_legal_documents_slug_language
  ON public.legal_documents (slug, language);
