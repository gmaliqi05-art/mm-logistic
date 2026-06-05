-- Migration: forbid status='active' with NULL current_period_end on
-- company_subscriptions. The audit (M2) flagged that SubscriptionContext
-- treats `status='active' AND current_period_end IS NULL` as expired
-- (the isInvalid → isExpired chain), which silently locks the tenant out
-- of their paid product. Today no rows match (verified) but anyone who
-- inserts such a row in the future would lose access without an obvious
-- error. Add a CHECK so the DB rejects the bad shape at write time.
--
-- pending_payment / trial / cancelled / expired are still allowed to have
-- NULL — only `active` is constrained.

ALTER TABLE public.company_subscriptions
  ADD CONSTRAINT company_subscriptions_active_has_period_end
  CHECK (status <> 'active' OR current_period_end IS NOT NULL);

COMMENT ON CONSTRAINT company_subscriptions_active_has_period_end
  ON public.company_subscriptions IS
  'An active subscription must always carry a current_period_end. Without it the frontend isExpired check (SubscriptionContext) flips true and the tenant gets locked out of their paid product. Other statuses (pending_payment, trial, cancelled, expired) may have NULL.';
