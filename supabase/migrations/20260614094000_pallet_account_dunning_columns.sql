/*
  # Dunning state on pallet_accounts

  The `check-pallet-account-aging` cron edge function escalates an
  alarm one step at a time as a pallet account approaches the §439 HGB
  1-year limitation. This migration adds the two columns it uses to
  remember where each account currently sits so it doesn't re-notify
  every day.

  ## What's added

  - `pallet_accounts.last_alarm_level` text NULL with CHECK
    ('warning', 'critical', 'expired'). NULL means "no alarm has been
    raised yet".
  - `pallet_accounts.last_alarm_at` timestamptz NULL — the moment the
    cron last raised an alarm for this row. Useful for audit and for a
    future operator-facing "snooze" feature.

  When the operator signs a Saldenbestätigung the aging view's
  `oldest_open_txn_age_days` drops back below the warning threshold;
  the cron then doesn't re-alarm, but operators can manually NULL out
  the column to reset the chain if they want a clean state.

  ## Safety

  - All columns nullable / defaulted; existing INSERT statements work
    untouched.
  - Idempotent via DO IF NOT EXISTS.
  - No trigger changes; the cron writes directly.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pallet_accounts'
      AND column_name = 'last_alarm_level'
  ) THEN
    ALTER TABLE public.pallet_accounts
      ADD COLUMN last_alarm_level text NULL
      CHECK (last_alarm_level IS NULL OR last_alarm_level IN ('warning', 'critical', 'expired'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pallet_accounts'
      AND column_name = 'last_alarm_at'
  ) THEN
    ALTER TABLE public.pallet_accounts
      ADD COLUMN last_alarm_at timestamptz NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.pallet_accounts.last_alarm_level IS
  'Highest alarm level raised by check-pallet-account-aging so far. NULL = none.';

COMMENT ON COLUMN public.pallet_accounts.last_alarm_at IS
  'Timestamp when last_alarm_level was last set by the cron.';
