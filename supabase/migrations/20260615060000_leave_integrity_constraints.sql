/*
  # KH/MH: Leave integrity constraints (MH1 + MH2)

  ## Why
  Two silent gaps in the HR module:

  ### MH1 — Balance invariant
  `employee_leave_balances` allows `allocated_days < used_days +
  pending_days`. The trigger `hr_update_leave_balance()` adds to
  pending/used freely; a corrupt set of leave_requests rows (or a
  manual SQL touch) could leave a row claiming "10 days allocated, 6
  used, 8 pending" — nonsense the UI then displays as remaining = -4.

  ### MH2 — Overlapping leave requests
  Nothing prevents the same employee from having two `pending` or
  `approved` leave_requests rows whose `[start_date, end_date]`
  ranges overlap. The trigger happily double-credits `pending_days`
  and `used_days`, so the balance goes wrong without anyone noticing
  until §15 BUrlG documentation is asked for and the numbers don't
  match the calendar.

  ## What this adds
  1. `btree_gist` extension (required for `uuid WITH =` in an EXCLUDE).
  2. `employee_leave_balances_consistent_check`:
        allocated_days >= used_days + pending_days
     AND used_days >= 0 AND pending_days >= 0 AND allocated_days >= 0
     Added NOT VALID + VALIDATE in two steps.
  3. `leave_requests_no_overlap` EXCLUDE constraint:
        UNIQUE (user_id, daterange(start_date, end_date, '[]'))
        WHERE status IN ('pending', 'approved')
     Same employee cannot have two open requests covering the same day.

  ## Safety
  - Prod data audited before applying: 16 balance rows (0 violations),
    0 overlapping leave_requests pairs. Both constraints validate
    cleanly.
  - Idempotent via `IF NOT EXISTS` guards.
  - NOT VALID + VALIDATE split means a future re-run on a corrupted
    dataset will fail loudly at VALIDATE rather than leaving a partial
    constraint behind.
*/

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ============================================================
-- MH1: balance invariant
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.employee_leave_balances'::regclass
      AND conname  = 'employee_leave_balances_consistent_check'
  ) THEN
    ALTER TABLE public.employee_leave_balances
      ADD CONSTRAINT employee_leave_balances_consistent_check
      CHECK (
        allocated_days >= 0
        AND used_days >= 0
        AND pending_days >= 0
        AND allocated_days >= used_days + pending_days
      )
      NOT VALID;
  END IF;
END $$;

ALTER TABLE public.employee_leave_balances
  VALIDATE CONSTRAINT employee_leave_balances_consistent_check;

COMMENT ON CONSTRAINT employee_leave_balances_consistent_check
  ON public.employee_leave_balances IS
  'Balance invariant: allocated_days >= used_days + pending_days and all components non-negative. Prevents the trigger or a manual SQL touch from leaving the balance row in a state where remaining (allocated - used - pending) is negative.';

-- ============================================================
-- MH2: no overlapping pending/approved leave per user
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.leave_requests'::regclass
      AND conname  = 'leave_requests_no_overlap'
  ) THEN
    ALTER TABLE public.leave_requests
      ADD CONSTRAINT leave_requests_no_overlap
      EXCLUDE USING gist (
        user_id WITH =,
        daterange(start_date, end_date, '[]') WITH &&
      )
      WHERE (status IN ('pending', 'approved'));
  END IF;
END $$;

COMMENT ON CONSTRAINT leave_requests_no_overlap
  ON public.leave_requests IS
  'Same employee cannot have two pending or approved leave requests whose [start_date, end_date] ranges overlap. Cancelled / rejected requests are excluded so historical records can stay around for audit. Uses btree_gist so user_id (uuid) equality is composable with daterange overlap.';
