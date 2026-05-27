/*
  # D1+D4: Clean up duplicate subscriptions and duplicate cron job

  1. Data Fixes
    - Remove stale `trial` subscriptions for companies that already have an
      `active` subscription (Mar Bau and Gent). These duplicates were created
      during registration when both a trial and an active sub were inserted.
    - Remove cron job #5 (`accounting-sync-minute-tick`) which calls
      `trigger_accounting_sync_for_due_companies()` in the public schema
      (function does not exist there). Job #17 already calls the correct
      `private.trigger_accounting_sync_for_due_companies()` every minute.

  2. Security
    - No permission changes

  3. Important Notes
    - Only trial subscriptions are removed, and only when the same company
      already has an active subscription — no data loss risk.
    - Job #5 was silently failing because the public-schema function does
      not exist; removing it eliminates the error noise in cron logs.
*/

-- D1: Remove stale trial subscriptions where company already has active
DELETE FROM company_subscriptions
WHERE status = 'trial'
  AND company_id IN (
    SELECT company_id FROM company_subscriptions WHERE status = 'active'
  );

-- D4: Remove the broken duplicate cron job (#5) that references a
-- non-existent public-schema function
SELECT cron.unschedule('accounting-sync-minute-tick');
