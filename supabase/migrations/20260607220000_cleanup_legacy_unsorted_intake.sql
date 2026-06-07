/*
  # Auto-cleanup of legacy unsorted intake rows

  Background:
  Before PR #173, depot workers booked sortable intake (e.g. Euro Paletten)
  against a specific category_product (e.g. "Euro Pallet EPAL"). The sorting
  trigger then ADDED Klasse A/B/C rows on top without decrementing the
  original intake row — causing every dashboard "Sipas Produktit" report to
  double-count.

  PR #173 fixes the forward flow:
    - Receiving for sortable categories now writes category_product_id = NULL
    - The commit trigger now subtracts the unsorted bucket on completion

  This migration cleans up rows that were created BEFORE the fix.

  Safety conditions — a row is only zeroed if ALL hold:
    1. Its category has sorting_mode != 'none' (i.e. is sortable)
    2. category_product_id IS NOT NULL (i.e. it's a specific product,
       which under the new rules should never exist for a sortable
       category in 'good' condition)
    3. condition = 'good' (damaged stock stays category-level by design
       and is correct as-is)
    4. quantity > 0 (don't touch rows that are already empty)
    5. There exists at least one completed sorting batch in the same
       (company_id, depot_id, category_id) — proves the depot has
       actively been sorting this category. Without this guard, the
       migration would zero out a category that simply has products but
       has never sorted (theoretical, but defensive).

  For every zeroed row we insert a stock_movements 'exit' record with a
  clear reason so the historical reduction is auditable.

  Idempotent: re-running this migration is a no-op because zeroed rows
  no longer pass condition #4.
*/

DO $$
DECLARE
  v_actor_id uuid;
  v_count    integer := 0;
BEGIN
  -- Pick any super_admin as the actor for the exit movements. Falls back
  -- to NULL if none exists (the column is nullable in stock_movements).
  SELECT id INTO v_actor_id
  FROM public.profiles
  WHERE role = 'super_admin'
  LIMIT 1;

  -- Log the exit movements for every row we are about to zero.
  INSERT INTO public.stock_movements (
    company_id, depot_id, category_id, category_product_id,
    movement_type, quantity, condition_before, condition_after,
    notes, performed_by, created_at
  )
  SELECT
    s.company_id, s.depot_id, s.category_id, s.category_product_id,
    'exit', s.quantity, s.condition, s.condition,
    'Auto-cleanup: legacy unsorted intake consumed by past sorting batches (PR #173)',
    v_actor_id, now()
  FROM public.stock s
  JOIN public.product_categories pc ON pc.id = s.category_id
  WHERE pc.sorting_mode <> 'none'
    AND s.category_product_id IS NOT NULL
    AND s.condition = 'good'
    AND s.quantity > 0
    AND EXISTS (
      SELECT 1
      FROM public.pallet_sorting_batches b
      WHERE b.company_id = s.company_id
        AND b.depot_id = s.depot_id
        AND b.category_id = s.category_id
        AND b.status = 'completed'
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Logged % stock_movements exit rows for legacy intake cleanup', v_count;

  -- Now zero the rows themselves.
  UPDATE public.stock s
  SET quantity = 0, updated_at = now()
  FROM public.product_categories pc
  WHERE pc.id = s.category_id
    AND pc.sorting_mode <> 'none'
    AND s.category_product_id IS NOT NULL
    AND s.condition = 'good'
    AND s.quantity > 0
    AND EXISTS (
      SELECT 1
      FROM public.pallet_sorting_batches b
      WHERE b.company_id = s.company_id
        AND b.depot_id = s.depot_id
        AND b.category_id = s.category_id
        AND b.status = 'completed'
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Zeroed % legacy unsorted intake stock rows', v_count;
END $$;
