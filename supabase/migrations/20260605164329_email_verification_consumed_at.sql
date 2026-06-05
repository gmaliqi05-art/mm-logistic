-- Migration: track when an email verification code is "consumed" (used to
-- complete a registration), separately from "verified" (a correct code was
-- submitted). Closes audit finding M1-sec.
--
-- Today register-company looks up verified codes within a 30-minute grace
-- window (expires_at >= now() - 30min). Verified codes are never marked
-- consumed, so the same verified code stays usable for the full grace.
-- The duplicate-profile check at registrations blocks reuse for the same
-- email — but a deletion/rollback race could let the same code drive a
-- second registration before the duplicate guard fires.
--
-- Add `consumed_at` and burn it from register-company once the
-- registration commits.

ALTER TABLE public.email_verification_codes
  ADD COLUMN IF NOT EXISTS consumed_at timestamptz;

CREATE INDEX IF NOT EXISTS email_verification_codes_consumed_idx
  ON public.email_verification_codes (email, consumed_at)
  WHERE consumed_at IS NULL;

COMMENT ON COLUMN public.email_verification_codes.consumed_at IS
  'Set when register-company successfully uses a verified code to create a profile. Subsequent registration attempts must NOT reuse the same code, even within the 30-minute grace window.';
