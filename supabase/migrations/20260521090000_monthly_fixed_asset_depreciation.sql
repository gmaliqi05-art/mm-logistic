/*
  # Monthly straight-line depreciation for fixed assets

  Adds the missing automation that mm-logistic was lacking: every active
  asset in `acc_fixed_assets` should drop in book value by
  `monthly_depreciation` once per month until fully depreciated. Without
  this cron, asset values were frozen at acquisition_cost forever, and
  the German AfA (Abschreibung) line in financial reports stayed at 0.

  Mechanics:
    - New column `last_depreciation_at` (date) tracks the period the
      asset was last depreciated for. Ensures idempotency — running the
      function twice in the same month is a no-op.
    - Function `acc_run_monthly_depreciation()` iterates active assets
      with positive monthly_depreciation, positive current_book_value
      and acquisition_date strictly before the current month, then:
        a) caps the amount so book value never goes negative
        b) updates accumulated_depreciation, current_book_value,
           last_depreciation_at
        c) inserts an `acc_transactions` expense row pegged to the
           asset (so P&L / cash-flow surfaces pick it up)
    - pg_cron job runs at 01:00 UTC on the 1st of each month, which
      means assets acquired in month N start depreciating on month N+1
      (matches German "monatsgenau" AfA from the month FOLLOWING
      acquisition).

  No journal entries here — that lives in the
  `acc_post_invoice_to_journal` / `acc_post_purchase_to_journal` family
  introduced in migration 20260521080000. A follow-up can wire AfA into
  Dr 4830 / Cr (accumulated-depreciation contra account) once the
  chart of accounts gains the standard SKR03 contra codes.

  Backfill is not done by this migration. Operators can manually call
  `SELECT acc_run_monthly_depreciation();` to catch up if needed.
*/

ALTER TABLE acc_fixed_assets
  ADD COLUMN IF NOT EXISTS last_depreciation_at date;

CREATE OR REPLACE FUNCTION public.acc_run_monthly_depreciation()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_asset       acc_fixed_assets%ROWTYPE;
  v_period_start date := date_trunc('month', CURRENT_DATE)::date;
  v_amount      numeric;
  v_new_accum   numeric;
  v_new_book    numeric;
BEGIN
  FOR v_asset IN
    SELECT *
    FROM acc_fixed_assets
    WHERE (status IS NULL OR status = 'active')
      AND COALESCE(monthly_depreciation, 0) > 0
      AND COALESCE(current_book_value, 0) > 0
      AND (last_depreciation_at IS NULL OR last_depreciation_at < v_period_start)
      AND acquisition_date < v_period_start
    ORDER BY acquisition_date
  LOOP
    -- Cap so book value never undershoots zero.
    v_amount := LEAST(
      v_asset.monthly_depreciation::numeric,
      v_asset.current_book_value::numeric
    );
    IF v_amount <= 0 THEN
      CONTINUE;
    END IF;

    v_new_accum := COALESCE(v_asset.accumulated_depreciation, 0) + v_amount;
    v_new_book  := COALESCE(v_asset.acquisition_cost, 0) - v_new_accum;

    UPDATE acc_fixed_assets
    SET accumulated_depreciation = v_new_accum,
        current_book_value       = v_new_book,
        last_depreciation_at     = v_period_start
    WHERE id = v_asset.id;

    INSERT INTO acc_transactions (
      company_id, transaction_type, amount, currency,
      description, transaction_date, notes, fixed_asset_id, created_by
    ) VALUES (
      v_asset.company_id, 'expense', v_amount, 'EUR',
      'Zhvleresim mujor (AfA): ' || v_asset.name,
      v_period_start,
      'Zhvleresim automatik per ' || to_char(v_period_start, 'YYYY-MM'),
      v_asset.id,
      v_asset.created_by
    );
  END LOOP;
END;
$$;

-- Schedule monthly. Wrapped in a DO block so applying the migration is
-- idempotent even if pg_cron is unavailable or the job already exists.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'depreciate-fixed-assets-monthly') THEN
    PERFORM cron.unschedule('depreciate-fixed-assets-monthly');
  END IF;

  PERFORM cron.schedule(
    'depreciate-fixed-assets-monthly',
    '0 1 1 * *',
    'SELECT public.acc_run_monthly_depreciation();'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'depreciate-fixed-assets-monthly schedule skipped: %', SQLERRM;
END $$;
