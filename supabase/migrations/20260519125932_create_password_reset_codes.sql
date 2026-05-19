/*
  # Create Password Reset Codes Table

  1. New Tables
    - `password_reset_codes`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `email` (text, not null)
      - `code` (text, 6-digit numeric code)
      - `expires_at` (timestamptz, when the code expires)
      - `used_at` (timestamptz, when the code was used, null if unused)
      - `created_at` (timestamptz, default now)

  2. Security
    - RLS enabled, no public policies (only service role can access)
    - Used exclusively by edge functions with service role key

  3. Indexes
    - Index on (email, code) for fast lookups
    - Index on expires_at for cleanup queries

  4. Cleanup
    - Function to delete expired codes older than 1 hour
    - Cron job every hour to clean up
*/

CREATE TABLE IF NOT EXISTS password_reset_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  code text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz DEFAULT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE password_reset_codes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_password_reset_codes_email_code
  ON password_reset_codes (email, code);

CREATE INDEX IF NOT EXISTS idx_password_reset_codes_expires_at
  ON password_reset_codes (expires_at);

CREATE OR REPLACE FUNCTION private.cleanup_expired_reset_codes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM password_reset_codes
  WHERE expires_at < NOW() - INTERVAL '1 hour';
END;
$$;

REVOKE ALL ON FUNCTION private.cleanup_expired_reset_codes() FROM PUBLIC;

SELECT cron.schedule(
  'cleanup-expired-reset-codes',
  '0 * * * *',
  $$SELECT private.cleanup_expired_reset_codes()$$
);
