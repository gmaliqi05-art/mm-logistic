-- Migration: tombstone table for prior free-trial registrations.
--
-- Without this, a single human can register unlimited free trials by:
--   * email aliasing — me+1@gmail.com, me+2@gmail.com, …
--   * dot variations on Gmail — m.e@gmail.com == me@gmail.com per Gmail rules
--   * deletion-and-re-registration with the same identity
--
-- We record a normalized fingerprint of every trial registration. The
-- register-company edge function consults this on each registration and
-- refuses a new trial if a fingerprint from the last 12 months matches.
-- Paid registrations are exempt — they're protected by Stripe's own
-- payment-method-side fraud signals and we don't want to block a legit
-- repeat buyer.

CREATE TABLE IF NOT EXISTS public.prior_trials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_normalized text NOT NULL,
  vat_number text,
  tax_number text,
  registered_ip text,
  source text NOT NULL DEFAULT 'register-company',
  redeemed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prior_trials_email_normalized_idx
  ON public.prior_trials (email_normalized, redeemed_at DESC);

CREATE INDEX IF NOT EXISTS prior_trials_vat_idx
  ON public.prior_trials (vat_number, redeemed_at DESC)
  WHERE vat_number IS NOT NULL AND vat_number <> '';

ALTER TABLE public.prior_trials ENABLE ROW LEVEL SECURITY;

-- Only service role (edge functions) writes/reads this table. No tenant
-- ever needs visibility into another tenant's trial fingerprint.
COMMENT ON TABLE public.prior_trials IS
  'Fingerprints of past free-trial registrations. Used by register-company to refuse a duplicate trial within a 12-month window. Survives company/profile deletion so deletion-then-re-registration cannot bypass it.';

-- Normalize an email for trial-uniqueness comparison:
--   * lowercased
--   * for gmail.com / googlemail.com: strip dots from the local part and
--     drop the +alias suffix (Gmail treats these as the same mailbox)
--   * for other providers: just lowercase + strip +alias
CREATE OR REPLACE FUNCTION public.normalize_trial_email(p_email text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_lower text;
  v_local text;
  v_domain text;
  v_at int;
  v_plus int;
BEGIN
  IF p_email IS NULL OR p_email = '' THEN
    RETURN NULL;
  END IF;
  v_lower := lower(trim(p_email));
  v_at := position('@' in v_lower);
  IF v_at = 0 THEN
    RETURN v_lower;
  END IF;
  v_local := substr(v_lower, 1, v_at - 1);
  v_domain := substr(v_lower, v_at + 1);
  v_plus := position('+' in v_local);
  IF v_plus > 0 THEN
    v_local := substr(v_local, 1, v_plus - 1);
  END IF;
  IF v_domain IN ('gmail.com', 'googlemail.com') THEN
    v_local := replace(v_local, '.', '');
    v_domain := 'gmail.com';
  END IF;
  RETURN v_local || '@' || v_domain;
END;
$$;

COMMENT ON FUNCTION public.normalize_trial_email IS
  'Canonicalises an email address for trial-uniqueness comparison. Strips dots and +alias from Gmail, normalises case across the address, and collapses googlemail.com into gmail.com.';
