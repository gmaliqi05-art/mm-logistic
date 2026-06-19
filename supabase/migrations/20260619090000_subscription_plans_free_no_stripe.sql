/*
  # K11: CHECK constraint — no Stripe price ID on a free plan

  ## Why
  General-audit Wave 4 K11. /super-admin/plans lets an operator
  set price_monthly = 0 (free plan) while still saving a
  stripe_price_id. stripe-checkout uses price_data dynamically
  when stripe_price_id is empty, but the *opposite* combination
  (price 0 + stripe_price_id set) bypasses the price ID lookup
  AND records a 0 € payment_transactions row via the webhook
  even though Stripe may have charged the card under the
  saved price ID. Operators get free service AND we still pay
  Stripe per-transaction fees.

  The same logic applies to the yearly column pair.

  Frontend validation lands in the same PR — but defence-in-depth
  belongs in the schema. Without the DB constraint, a future RPC
  / edge function / direct-SQL operator could re-introduce the
  invariant break.

  ## What this ships
  Two CHECK constraints, both NOT VALID then VALIDATE so any
  legacy row triggers an immediate failure that the operator can
  see and fix rather than silently lingering:

    1. subscription_plans_free_no_stripe_monthly:
         price_monthly > 0 OR stripe_price_id IS NULL
                              OR stripe_price_id = ''
    2. subscription_plans_free_no_stripe_yearly:
         COALESCE(price_yearly, 0) > 0
           OR stripe_price_id_yearly IS NULL
           OR stripe_price_id_yearly = ''

  Prod has 6 plans, 0 violations on either invariant at the
  moment, so the VALIDATE pass succeeds immediately.

  ## Safety
  - Idempotent via IF NOT EXISTS + VALIDATE.
  - No data migration.
  - Frontend already shows a precise error before the INSERT
    would hit the constraint; the DB stays as the last line of
    defence.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.subscription_plans'::regclass
      AND conname  = 'subscription_plans_free_no_stripe_monthly'
  ) THEN
    ALTER TABLE public.subscription_plans
      ADD CONSTRAINT subscription_plans_free_no_stripe_monthly
      CHECK (
        price_monthly > 0
        OR stripe_price_id IS NULL
        OR stripe_price_id = ''
      )
      NOT VALID;
  END IF;
END $$;

ALTER TABLE public.subscription_plans
  VALIDATE CONSTRAINT subscription_plans_free_no_stripe_monthly;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.subscription_plans'::regclass
      AND conname  = 'subscription_plans_free_no_stripe_yearly'
  ) THEN
    ALTER TABLE public.subscription_plans
      ADD CONSTRAINT subscription_plans_free_no_stripe_yearly
      CHECK (
        COALESCE(price_yearly, 0) > 0
        OR stripe_price_id_yearly IS NULL
        OR stripe_price_id_yearly = ''
      )
      NOT VALID;
  END IF;
END $$;

ALTER TABLE public.subscription_plans
  VALIDATE CONSTRAINT subscription_plans_free_no_stripe_yearly;

COMMENT ON CONSTRAINT subscription_plans_free_no_stripe_monthly
  ON public.subscription_plans IS
  'K11 invariant: a free monthly plan (price_monthly = 0) must NOT carry a stripe_price_id. Otherwise stripe-checkout would silently charge the card under the saved price ID while the webhook records a 0 € payment row.';

COMMENT ON CONSTRAINT subscription_plans_free_no_stripe_yearly
  ON public.subscription_plans IS
  'K11 invariant: a free yearly plan must NOT carry a stripe_price_id_yearly. Same reasoning as the monthly column.';
