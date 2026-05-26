/*
  # Expand company_subscriptions status CHECK constraint

  1. Changes
    - Drop existing `company_subscriptions_status_check` constraint that only allows
      'trial', 'active', 'expired', 'cancelled'
    - Re-create the constraint with two additional valid statuses:
      - `pending_payment` — set during paid-plan registration before Stripe payment completes
      - `past_due` — set by the Stripe webhook when a recurring invoice payment fails

  2. Why
    - The `register-company` edge function inserts subscriptions with status 'pending_payment'
      for paid plans, which violates the current constraint and breaks registration
    - The `stripe-webhook` sets status 'past_due' on failed invoice payments, which also
      violates the current constraint
    - Both statuses are already referenced in application code (SubscriptionContext,
      ProtectedRoute, PaymentPending page, cleanup cron) but were never added to the DB
*/

ALTER TABLE company_subscriptions DROP CONSTRAINT IF EXISTS company_subscriptions_status_check;

ALTER TABLE company_subscriptions ADD CONSTRAINT company_subscriptions_status_check
  CHECK (status IN ('trial', 'active', 'expired', 'cancelled', 'pending_payment', 'past_due'));
