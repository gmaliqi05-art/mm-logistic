/*
  # Create email verification codes table

  1. New Tables
    - `email_verification_codes`
      - `id` (uuid, primary key)
      - `email` (text, not null) - the email being verified
      - `code` (text, not null) - 6-digit verification code
      - `expires_at` (timestamptz, not null) - when the code expires (15 min)
      - `verified_at` (timestamptz, nullable) - when the code was successfully verified
      - `created_at` (timestamptz, default now())

  2. Security
    - Enable RLS on `email_verification_codes` table
    - No public policies - only service_role can access

  3. Indexes
    - Index on (email, code) for fast lookup
    - Index on expires_at for cleanup queries

  4. Notes
    - Same pattern as `password_reset_codes`
    - Codes expire after 15 minutes
    - Used during registration to verify email ownership and prevent duplicate registrations
*/

CREATE TABLE IF NOT EXISTS email_verification_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  code text NOT NULL,
  expires_at timestamptz NOT NULL,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE email_verification_codes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_email_verification_codes_lookup
  ON email_verification_codes (email, code);

CREATE INDEX IF NOT EXISTS idx_email_verification_codes_expires
  ON email_verification_codes (expires_at);
