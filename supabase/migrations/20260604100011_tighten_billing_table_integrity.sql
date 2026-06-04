-- Migration: tighten billing-table integrity after the deep audit
--
-- 1. Add UNIQUE index on payment_transactions(stripe_payment_id) (where set)
--    so that a Stripe webhook retry or a race between verify-checkout-session
--    and the real webhook cannot insert a duplicate payment row. Already
--    observed in prod: Mar shop has two rows for the same checkout session.
--
-- 2. Pin company_subscriptions.plan_id to ON DELETE RESTRICT so a super_admin
--    deleting a plan that is still in use gets a clear, immediate FK error
--    instead of relying on the default NO ACTION (which also rejects but at
--    end-of-transaction with a less obvious message).

-- Clean the known duplicate before adding the constraint.
DELETE FROM public.payment_transactions
WHERE id = '1ecf8e09-3a7d-4226-9c8d-27adf46fdb84'
  AND stripe_payment_id = 'cs_live_a13Xq1fZnG9q7MHZ38wP6xcGEXnO4WrnWDvv9LBRSh3egxXKsInBOf36pd';

-- Defensive: clean any remaining duplicates (keep the earliest row).
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY stripe_payment_id
           ORDER BY created_at, id
         ) AS rn
  FROM public.payment_transactions
  WHERE stripe_payment_id IS NOT NULL AND stripe_payment_id <> ''
)
DELETE FROM public.payment_transactions p
USING ranked r
WHERE p.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_stripe_payment_id_uq
  ON public.payment_transactions (stripe_payment_id)
  WHERE stripe_payment_id IS NOT NULL AND stripe_payment_id <> '';

COMMENT ON INDEX public.payment_transactions_stripe_payment_id_uq IS
  'Prevents duplicate payment rows when stripe-webhook and verify-checkout-session both record the same checkout, or when Stripe retries a webhook after the handler partially completed.';

-- Recreate company_subscriptions.plan_id FK with explicit ON DELETE RESTRICT.
DO $$
DECLARE
  v_constraint text;
BEGIN
  SELECT conname INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.company_subscriptions'::regclass
    AND contype = 'f'
    AND conkey = ARRAY[(
      SELECT attnum FROM pg_attribute
      WHERE attrelid = 'public.company_subscriptions'::regclass
        AND attname = 'plan_id'
    )]::int2[];

  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.company_subscriptions DROP CONSTRAINT %I', v_constraint);
  END IF;

  ALTER TABLE public.company_subscriptions
    ADD CONSTRAINT company_subscriptions_plan_id_fkey
    FOREIGN KEY (plan_id)
    REFERENCES public.subscription_plans(id)
    ON DELETE RESTRICT;
END$$;
