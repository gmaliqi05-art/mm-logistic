/*
  # Decrement unsorted intake when a sorting batch commits

  Background:
  Pallets received for sorting are stored in `stock` at category level
  (category_product_id IS NULL, condition='good') — they are "pending sort".
  When a sorting batch completes, the existing trigger inserts the sorted
  Klasse rows (Klasse A/B/C) into `stock` but never decrements the original
  unsorted bucket, so the dashboard double-counts intake + sorted classes.

  This migration replaces `commit_sorting_batch_to_stock` with a version that
  also subtracts the total batch quantity from the unsorted intake row.

  Behaviour:
  - For each sorted item, INSERT or UPDATE the matching (depot, category,
    product, condition) stock row — unchanged.
  - After the loop, find the unsorted row for this batch's category/depot
    (category_product_id IS NULL, condition='good') and subtract the total
    sorted quantity. If multiple unsorted rows exist (e.g. older batches),
    drain in `updated_at` order so the oldest pending bucket is consumed first.
  - Never goes below 0 — if the unsorted bucket runs out (e.g. partial
    historical data), the trigger stops without error. The bug fix only
    affects future receipts; legacy stuck rows need a manual cleanup.

  No schema changes. Idempotent via the existing `committed_at` guard.
*/

CREATE OR REPLACE FUNCTION public.commit_sorting_batch_to_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  it                  record;
  existing_stock_id   uuid;
  actor_id            uuid;
  total_sorted        integer := 0;
  remaining           integer;
  unsorted_row        record;
  take                integer;
BEGIN
  IF NEW.status <> 'completed' THEN
    RETURN NEW;
  END IF;
  IF NEW.committed_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  actor_id := COALESCE(NEW.completed_by, NEW.created_by);

  -- Insert / update each sorted class row, accumulate the total qty processed.
  FOR it IN
    SELECT
      i.category_product_id,
      i.quantity,
      i.condition,
      COALESCE(cp.category_id, NEW.category_id) AS category_id
    FROM public.pallet_sorting_items i
    LEFT JOIN public.category_products cp ON cp.id = i.category_product_id
    WHERE i.batch_id = NEW.id AND i.quantity > 0
  LOOP
    total_sorted := total_sorted + it.quantity;

    SELECT id INTO existing_stock_id
    FROM public.stock
    WHERE company_id = NEW.company_id
      AND depot_id = NEW.depot_id
      AND category_id = it.category_id
      AND COALESCE(category_product_id, '00000000-0000-0000-0000-000000000000'::uuid)
          = COALESCE(it.category_product_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND condition = it.condition
    LIMIT 1;

    IF existing_stock_id IS NULL THEN
      INSERT INTO public.stock (
        company_id, depot_id, category_id, category_product_id,
        quantity, condition, updated_at, created_at
      ) VALUES (
        NEW.company_id, NEW.depot_id, it.category_id, it.category_product_id,
        it.quantity, it.condition, now(), now()
      );
    ELSE
      UPDATE public.stock
      SET    quantity   = quantity + it.quantity,
             updated_at = now()
      WHERE id = existing_stock_id;
    END IF;

    INSERT INTO public.stock_movements (
      company_id, depot_id, category_id, category_product_id,
      movement_type, quantity, condition_before, condition_after,
      notes, performed_by, created_at
    ) VALUES (
      NEW.company_id, NEW.depot_id, it.category_id, it.category_product_id,
      CASE WHEN it.condition = 'damaged' THEN 'repair_in' ELSE 'entry' END,
      it.quantity, '', it.condition,
      'Sorting batch ' || NEW.id::text, actor_id, now()
    );
  END LOOP;

  -- Drain the unsorted intake bucket for this category/depot by the total
  -- sorted quantity. Walk oldest-first so the FIFO order matches what the
  -- worker would expect (pallets sorted first were the ones received first).
  remaining := total_sorted;
  IF remaining > 0 THEN
    FOR unsorted_row IN
      SELECT id, quantity
      FROM public.stock
      WHERE company_id = NEW.company_id
        AND depot_id = NEW.depot_id
        AND category_id = NEW.category_id
        AND category_product_id IS NULL
        AND condition = 'good'
        AND quantity > 0
      ORDER BY updated_at ASC, created_at ASC
    LOOP
      EXIT WHEN remaining <= 0;
      take := LEAST(unsorted_row.quantity, remaining);
      UPDATE public.stock
      SET    quantity   = quantity - take,
             updated_at = now()
      WHERE id = unsorted_row.id;

      INSERT INTO public.stock_movements (
        company_id, depot_id, category_id, category_product_id,
        movement_type, quantity, condition_before, condition_after,
        notes, performed_by, created_at
      ) VALUES (
        NEW.company_id, NEW.depot_id, NEW.category_id, NULL,
        'exit', take, 'good', 'good',
        'Sorting batch ' || NEW.id::text || ' (consumed unsorted intake)',
        actor_id, now()
      );

      remaining := remaining - take;
    END LOOP;
  END IF;

  NEW.committed_at := now();
  RETURN NEW;
END;
$$;
