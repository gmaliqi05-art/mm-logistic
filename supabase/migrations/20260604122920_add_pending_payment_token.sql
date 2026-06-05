-- Migration: add pending_payment_token to company_subscriptions.
--
-- Closes H1-sec from the deep audit. Before this, the unauthenticated path
-- of stripe-checkout would accept any companyId that had a pending_payment
-- subscription. An attacker who learned a tenant's UUID (leaked via URLs,
-- screenshots, support tickets, etc.) could create a checkout in the
-- victim's name, pay with a stolen card, and saddle the victim with the
-- eventual chargeback — using the platform's Stripe account as a card-
-- testing service in the process.
--
-- Fix: register-company generates a 256-bit random token at registration
-- time and returns it once. stripe-checkout's unauth path requires the
-- token and constant-time compares against the stored value. The token is
-- one-time: cleared the first time the checkout succeeds. Attackers who
-- only know the companyId can no longer initiate a checkout in someone
-- else's name.

ALTER TABLE public.company_subscriptions
  ADD COLUMN IF NOT EXISTS pending_payment_token text;

COMMENT ON COLUMN public.company_subscriptions.pending_payment_token IS
  'Single-use 256-bit token issued by register-company for the unauthenticated stripe-checkout path. Set to NULL the first time a checkout for this subscription succeeds, so a leaked token cannot be reused.';

-- Index by token for the lookup path. Partial so it stays small (most
-- subscriptions have NULL once the token is consumed).
CREATE INDEX IF NOT EXISTS company_subscriptions_pending_token_idx
  ON public.company_subscriptions (pending_payment_token)
  WHERE pending_payment_token IS NOT NULL;
