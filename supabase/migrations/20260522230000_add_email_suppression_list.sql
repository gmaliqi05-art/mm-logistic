/*
  # O1+O2: Email reputation infrastructure

  Two protections required by Gmail/Yahoo sender guidelines (2024) and
  by EU spam law:

  1. List-Unsubscribe header on outgoing mail — added inside send-email
     itself (no DB change).
  2. Per-address suppression list so a hard bounce or spam complaint
     stops further sends to that address. This migration creates the
     table; the resend-webhook edge function populates it and
     send-email checks it before every send.

  Schema notes:
  - The list is global, not per-company. Gmail/Yahoo reject the same
    address from any tenant once it has bounced. RLS still scopes
    INSERTs to service_role + super_admin.
  - `source` records who suppressed (bounce, complaint, unsubscribe,
    manual). Distinguishes hard bounces (permanent) from soft bounces
    (transient — not suppressed).
  - `payload` stores the raw webhook event for forensics.
*/

CREATE TABLE IF NOT EXISTS public.email_suppression (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL,
  source      TEXT NOT NULL CHECK (source IN ('bounce', 'complaint', 'unsubscribe', 'manual')),
  reason      TEXT,
  payload     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_suppression_email
  ON public.email_suppression (lower(email));

ALTER TABLE public.email_suppression ENABLE ROW LEVEL SECURITY;

CREATE POLICY email_suppression_super_admin
  ON public.email_suppression
  FOR ALL
  TO authenticated
  USING (private.get_user_role() = 'super_admin')
  WITH CHECK (private.get_user_role() = 'super_admin');

CREATE OR REPLACE FUNCTION public.is_email_suppressed(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF p_email IS NULL OR length(trim(p_email)) = 0 THEN
    RETURN FALSE;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.email_suppression
    WHERE lower(email) = lower(trim(p_email))
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.is_email_suppressed(TEXT) TO authenticated, service_role;

COMMENT ON TABLE public.email_suppression IS
  'Global email suppression list. Hard bounces, spam complaints, and one-click unsubscribes land here. send-email refuses to deliver to any address present.';
