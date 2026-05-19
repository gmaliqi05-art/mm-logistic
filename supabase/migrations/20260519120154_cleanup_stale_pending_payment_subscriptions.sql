/*
  # Cleanup Stale Pending Payment Subscriptions

  1. New Function
    - `private.expire_stale_pending_payments()`: Expires subscriptions with status 'pending_payment' that are older than 48 hours

  2. Scheduled Job
    - Runs every 6 hours via pg_cron
    - Automatically marks stale pending_payment subscriptions as expired

  3. Important Notes
    - Only affects subscriptions with status 'pending_payment'
    - Grace period of 48 hours allows users time to complete payment
    - Does not delete accounts, just expires the subscription
*/

CREATE OR REPLACE FUNCTION private.expire_stale_pending_payments()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE company_subscriptions
  SET status = 'expired'
  WHERE status = 'pending_payment'
    AND created_at < NOW() - INTERVAL '48 hours';
END;
$$;

REVOKE ALL ON FUNCTION private.expire_stale_pending_payments() FROM PUBLIC;

SELECT cron.schedule(
  'expire-stale-pending-payments',
  '0 */6 * * *',
  $$SELECT private.expire_stale_pending_payments()$$
);
