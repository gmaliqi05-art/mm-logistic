/*
  # Fix repair attribution + expose worker identity in depot views

  Two related problems:

  1. `depot_repairs.worker_id` was overloaded — when a damaged sorting
     item was routed to repair (`commit_sorting_batch_to_stock`), the
     sorter's id was written as `worker_id`. The UI page
     `WorkerRepairStats.tsx` then aggregated by `worker_id` and
     surfaced the sorter on the "repair workers" leaderboard, even
     though the sorter never repaired anything. A `depoist` like Idi
     ended up on a list that should only contain `reparature` workers.

  2. The three depot reporting views (`v_depot_repair_productivity`,
     `v_depot_sorting_outcomes`, `v_depot_daily_flow`) strip
     `worker_id` / `created_by` / `performed_by` from their SELECT
     lists. Consequently every report page built on top of them
     hides the depot worker who did the work — the company admin
     cannot tell which of their depot workers handled what.

  This migration:

  a. Adds `depot_repairs.opened_by uuid` (FK to profiles) — the
     sorter / case originator (Flow A). Backfills it from the
     pre-existing `worker_id` for rows where no repair has happened
     yet (`quantity_repaired = 0 AND quantity_scrapped = 0`).
  b. Clears `worker_id` on those Flow-A rows so the column finally
     means strictly "repaired_by". Rows that already had repair work
     logged (`quantity_repaired > 0 OR quantity_scrapped > 0`) keep
     their existing `worker_id` — for those the column already
     reflects an actual repairer.
  c. Replaces `commit_sorting_batch_to_stock` so newly routed
     damaged items get `opened_by = actor_id, worker_id = NULL`.
  d. Replaces `apply_repair_completion` so it stamps
     `worker_id = auth.uid()` on the repair row (the reparature who
     completed the case), in addition to bumping the quantity
     counters. Existing call sites (RepairCompletionModal) work
     unchanged.
  e. Rewrites the three views to include the relevant worker UUID
     plus the `profiles.full_name` so report pages can surface
     "who did this" without an extra round-trip:
       - v_depot_repair_productivity: worker_id, worker_full_name,
         opened_by, opened_by_full_name
       - v_depot_sorting_outcomes: created_by, created_by_full_name,
         completed_by, completed_by_full_name
       - v_depot_daily_flow: performed_by, performed_by_full_name

  Existing consumer queries that only request the original column
  list continue to work; the new columns are additive.

  No CHECK constraint is added pinning `worker_id` to
  `worker_category='reparature'` — too restrictive given the
  schema's historical flexibility. The UI now filters by category
  so the leaderboard is correct without a hard DB rule.
*/

-- a. Add opened_by column ------------------------------------------------------

ALTER TABLE depot_repairs
  ADD COLUMN IF NOT EXISTS opened_by uuid REFERENCES profiles(id) ON DELETE SET NULL;

-- b. Backfill: move sorter from worker_id -> opened_by for Flow-A rows --------

UPDATE depot_repairs
SET    opened_by = worker_id,
       worker_id = NULL
WHERE  opened_by IS NULL
  AND  worker_id IS NOT NULL
  AND  COALESCE(quantity_repaired, 0) = 0
  AND  COALESCE(quantity_scrapped, 0) = 0;

-- c. Fix the trigger: future damaged items go to opened_by ---------------------

CREATE OR REPLACE FUNCTION public.commit_sorting_batch_to_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  it                  record;
  existing_stock_id   uuid;
  existing_repair_id  uuid;
  actor_id            uuid;
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

  FOR it IN
    SELECT i.category_product_id, i.quantity, i.condition, cp.category_id, cp.name AS product_name
    FROM public.pallet_sorting_items i
    JOIN public.category_products cp ON cp.id = i.category_product_id
    WHERE i.batch_id = NEW.id AND i.quantity > 0
  LOOP
    IF it.condition = 'damaged' THEN
      SELECT id INTO existing_repair_id
      FROM public.depot_repairs
      WHERE company_id = NEW.company_id
        AND depot_id = NEW.depot_id
        AND category_product_id = it.category_product_id
        AND source_delivery_note_id = NEW.source_delivery_note_id
      LIMIT 1;

      IF existing_repair_id IS NOT NULL THEN
        UPDATE public.depot_repairs
        SET    quantity_in = quantity_in + it.quantity,
               opened_by   = COALESCE(opened_by, actor_id)
        WHERE id = existing_repair_id;
      ELSE
        INSERT INTO public.depot_repairs (
          company_id, depot_id, category_id, category_product_id,
          quantity_in, quantity_repaired, quantity_scrapped,
          notes, product_name, source_delivery_note_id,
          worker_id, opened_by
        ) VALUES (
          NEW.company_id, NEW.depot_id, it.category_id, it.category_product_id,
          it.quantity, 0, 0,
          'Nga sortimi i batch ' || NEW.id::text,
          COALESCE(it.product_name, ''),
          NEW.source_delivery_note_id,
          NULL, actor_id
        );
      END IF;
    ELSE
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

  NEW.committed_at := now();
  RETURN NEW;
END;
$$;

-- d. apply_repair_completion now credits the actual reparator -----------------

CREATE OR REPLACE FUNCTION public.apply_repair_completion(
  p_repair_id uuid,
  p_repaired_qty integer,
  p_scrapped_qty integer,
  p_target_category_product_id uuid
)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_repair       record;
  v_total        integer;
  v_damaged_row  record;
  v_good_id      uuid;
  v_actor        uuid := auth.uid();
BEGIN
  SELECT * INTO v_repair FROM depot_repairs WHERE id = p_repair_id;
  IF v_repair IS NULL THEN
    RAISE EXCEPTION 'Repair not found';
  END IF;

  v_total := coalesce(p_repaired_qty, 0) + coalesce(p_scrapped_qty, 0);
  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Asnje sasi per te raportuar';
  END IF;
  IF coalesce(v_repair.quantity_repaired, 0) + coalesce(v_repair.quantity_scrapped, 0) + v_total
       > coalesce(v_repair.quantity_in, 0) THEN
    RAISE EXCEPTION 'Sasia tejkalon totalin e pritur ne reparature';
  END IF;

  SELECT * INTO v_damaged_row FROM stock
  WHERE company_id = v_repair.company_id
    AND depot_id   = v_repair.depot_id
    AND category_id = v_repair.category_id
    AND condition  = 'damaged'
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 1;

  IF v_damaged_row.id IS NOT NULL AND v_damaged_row.quantity >= v_total THEN
    UPDATE stock
    SET    quantity = quantity - v_total, updated_at = now()
    WHERE id = v_damaged_row.id;
    INSERT INTO stock_movements (company_id, depot_id, category_id, category_product_id, movement_type, quantity, condition_before, condition_after, notes, performed_by)
    VALUES (v_repair.company_id, v_repair.depot_id, v_repair.category_id, v_damaged_row.category_product_id, 'repair', v_total, 'damaged', 'good', 'Reparim i raportuar', v_actor);
  END IF;

  IF coalesce(p_repaired_qty, 0) > 0 AND p_target_category_product_id IS NOT NULL THEN
    SELECT id INTO v_good_id FROM stock
    WHERE company_id = v_repair.company_id
      AND depot_id   = v_repair.depot_id
      AND category_id = v_repair.category_id
      AND category_product_id = p_target_category_product_id
      AND condition  = 'good'
    LIMIT 1;
    IF v_good_id IS NULL THEN
      INSERT INTO stock (company_id, depot_id, category_id, category_product_id, condition, quantity, updated_at, created_at)
      VALUES (v_repair.company_id, v_repair.depot_id, v_repair.category_id, p_target_category_product_id, 'good', p_repaired_qty, now(), now());
    ELSE
      UPDATE stock SET quantity = quantity + p_repaired_qty, updated_at = now()
      WHERE id = v_good_id;
    END IF;
    INSERT INTO stock_movements (company_id, depot_id, category_id, category_product_id, movement_type, quantity, condition_before, condition_after, notes, performed_by)
    VALUES (v_repair.company_id, v_repair.depot_id, v_repair.category_id, p_target_category_product_id, 'repair', p_repaired_qty, 'damaged', 'good', 'Palet te reparuara -> stok (te mira)', v_actor);
  END IF;

  IF coalesce(p_scrapped_qty, 0) > 0 THEN
    INSERT INTO stock_movements (company_id, depot_id, category_id, category_product_id, movement_type, quantity, condition_before, condition_after, notes, performed_by)
    VALUES (v_repair.company_id, v_repair.depot_id, v_repair.category_id, p_target_category_product_id, 'scrap', p_scrapped_qty, 'damaged', 'damaged', 'Hedhur si scrap gjate raportimit te riparimit', v_actor);
  END IF;

  -- Credit the reparator (the user who applied the completion).
  UPDATE depot_repairs
  SET    quantity_repaired = coalesce(quantity_repaired, 0) + coalesce(p_repaired_qty, 0),
         quantity_scrapped = coalesce(quantity_scrapped, 0) + coalesce(p_scrapped_qty, 0),
         worker_id         = COALESCE(v_actor, worker_id)
  WHERE id = p_repair_id;
END;
$$;

-- e. Rewrite views to expose worker identity ---------------------------------

DROP VIEW IF EXISTS public.v_depot_repair_productivity;
CREATE VIEW public.v_depot_repair_productivity AS
SELECT
  dr.company_id,
  dr.depot_id,
  date_trunc('day', COALESCE(dr.logged_at, dr.created_at))::date AS repair_date,
  dr.category_id,
  pc.name AS category_name,
  dr.category_product_id,
  cp.name AS product_name,
  COALESCE(cp.base_price, 0)::numeric(12,2) AS unit_price,
  COALESCE(cp.currency, 'EUR') AS currency,
  dr.worker_id,
  pw.full_name AS worker_full_name,
  dr.opened_by,
  po.full_name AS opened_by_full_name,
  SUM(COALESCE(dr.quantity_in, 0))::integer       AS total_in,
  SUM(COALESCE(dr.quantity_repaired, 0))::integer AS total_repaired,
  SUM(COALESCE(dr.quantity_scrapped, 0))::integer AS total_scrapped,
  (SUM(COALESCE(dr.quantity_repaired, 0))::numeric * COALESCE(cp.base_price, 0))::numeric(14,2) AS repaired_value
FROM depot_repairs dr
LEFT JOIN product_categories pc ON pc.id = dr.category_id
LEFT JOIN category_products  cp ON cp.id = dr.category_product_id
LEFT JOIN profiles pw           ON pw.id = dr.worker_id
LEFT JOIN profiles po           ON po.id = dr.opened_by
GROUP BY dr.company_id, dr.depot_id, repair_date,
         dr.category_id, pc.name, dr.category_product_id, cp.name, cp.base_price, cp.currency,
         dr.worker_id, pw.full_name, dr.opened_by, po.full_name;

DROP VIEW IF EXISTS public.v_depot_sorting_outcomes;
CREATE VIEW public.v_depot_sorting_outcomes AS
SELECT
  psb.company_id,
  psb.depot_id,
  psb.id AS batch_id,
  psb.status,
  date_trunc('day', COALESCE(psb.committed_at, psb.completed_at, psb.created_at))::date AS batch_date,
  psb.category_id,
  pc.name AS category_name,
  psi.category_product_id,
  cp.name AS product_name,
  psi.condition,
  COALESCE(psi.quantity, 0) AS quantity,
  COALESCE(cp.base_price, 0)::numeric(12,2) AS unit_price,
  (COALESCE(psi.quantity, 0)::numeric * COALESCE(cp.base_price, 0))::numeric(14,2) AS line_value,
  psb.created_by,
  pcr.full_name AS created_by_full_name,
  psb.completed_by,
  pcm.full_name AS completed_by_full_name
FROM pallet_sorting_items psi
JOIN pallet_sorting_batches psb ON psb.id = psi.batch_id
LEFT JOIN product_categories pc ON pc.id = psb.category_id
LEFT JOIN category_products  cp ON cp.id = psi.category_product_id
LEFT JOIN profiles pcr          ON pcr.id = psb.created_by
LEFT JOIN profiles pcm          ON pcm.id = psb.completed_by;

DROP VIEW IF EXISTS public.v_depot_daily_flow;
CREATE VIEW public.v_depot_daily_flow AS
SELECT
  sm.company_id,
  sm.depot_id,
  date_trunc('day', sm.created_at)::date AS flow_date,
  sm.movement_type,
  sm.category_id,
  sm.category_product_id,
  sm.performed_by,
  pp.full_name AS performed_by_full_name,
  SUM(COALESCE(sm.quantity, 0))::integer AS quantity
FROM stock_movements sm
LEFT JOIN profiles pp ON pp.id = sm.performed_by
GROUP BY sm.company_id, sm.depot_id, (date_trunc('day', sm.created_at)::date),
         sm.movement_type, sm.category_id, sm.category_product_id,
         sm.performed_by, pp.full_name;
