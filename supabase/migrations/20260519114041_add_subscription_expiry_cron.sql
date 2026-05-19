/*
  # Add Server-Side Subscription Expiry Enforcement

  1. New Function
    - `expire_overdue_subscriptions()`: Checks for subscriptions past their end date and marks them expired

  2. Scheduled Job
    - Runs every hour via pg_cron to enforce subscription expiry server-side
    - Handles both trial and active subscriptions

  3. Important Notes
    - Only transitions 'active' and 'trial' status to 'expired'
    - Leaves 'cancelled' and already 'expired' subscriptions untouched
    - Uses SECURITY DEFINER to bypass RLS
*/

-- Create the function to expire overdue subscriptions
CREATE OR REPLACE FUNCTION private.expire_overdue_subscriptions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Expire active subscriptions past their current_period_end
  UPDATE company_subscriptions
  SET status = 'expired'
  WHERE status = 'active'
    AND current_period_end IS NOT NULL
    AND current_period_end < NOW();

  -- Expire trial subscriptions past their trial_end
  UPDATE company_subscriptions
  SET status = 'expired'
  WHERE status = 'trial'
    AND trial_end IS NOT NULL
    AND trial_end < NOW();
END;
$$;

-- Revoke public execution
REVOKE ALL ON FUNCTION private.expire_overdue_subscriptions() FROM PUBLIC;

-- Schedule the job to run every hour
SELECT cron.schedule(
  'expire-overdue-subscriptions',
  '0 * * * *',
  $$SELECT private.expire_overdue_subscriptions()$$
);
