/*
  # Merge ready_a/b/c stock conditions into good

  Products like Klasse A, Klasse B, Klasse C are finished products.
  They should only have condition 'good' or 'damaged' in the stock table.
  The conditions 'ready_a', 'ready_b', 'ready_c' were created by an older
  sorting trigger and are incorrect.

  1. Data Fix
    - Merge ready_a/b/c quantities into matching 'good' rows, then delete
      the ready_* rows
  2. Trigger Update
    - commit_sorting_batch_to_stock only uses 'good' or 'damaged'
  3. Constraint Update
    - Remove ready_a, ready_b, ready_c from stock_condition_check
*/

-- 1a. Merge ready_c row into the 'good' row for same product
DO $$
DECLARE
  r record;
  target_id uuid;
BEGIN
  FOR r IN
    SELECT id, company_id, depot_id, category_id, category_product_id, quantity
    FROM public.stock
    WHERE condition IN ('ready_a', 'ready_b', 'ready_c')
  LOOP
    SELECT id INTO target_id
    FROM public.stock
    WHERE company_id = r.company_id
      AND depot_id = r.depot_id
      AND category_id = r.category_id
      AND COALESCE(category_product_id, '00000000-0000-0000-0000-000000000000'::uuid)
          = COALESCE(r.category_product_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND condition = 'good'
    LIMIT 1;

    IF target_id IS NOT NULL THEN
      UPDATE public.stock
      SET quantity = quantity + r.quantity, updated_at = now()
      WHERE id = target_id;
    ELSE
      INSERT INTO public.stock (
        company_id, depot_id, category_id, category_product_id,
        quantity, condition, updated_at, created_at
      ) VALUES (
        r.company_id, r.depot_id, r.category_id, r.category_product_id,
        r.quantity, 'good', now(), now()
      );
    END IF;

    -- Delete the old ready_* row
    DELETE FROM public.stock WHERE id = r.id;
  END LOOP;
END $$;

-- 2. Recreate commit trigger -- all non-damaged items go as 'good'
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
  final_condition     text;
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
    SELECT
      i.category_product_id,
      i.quantity,
      i.condition,
      COALESCE(cp.category_id, NEW.category_id) AS category_id
    FROM public.pallet_sorting_items i
    LEFT JOIN public.category_products cp ON cp.id = i.category_product_id
    WHERE i.batch_id = NEW.id AND i.quantity > 0
  LOOP
    IF it.condition = 'damaged' THEN
      final_condition := 'damaged';
    ELSE
      final_condition := 'good';
    END IF;

    SELECT id INTO existing_stock_id
    FROM public.stock
    WHERE company_id = NEW.company_id
      AND depot_id = NEW.depot_id
      AND category_id = it.category_id
      AND COALESCE(category_product_id, '00000000-0000-0000-0000-000000000000'::uuid)
          = COALESCE(it.category_product_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND condition = final_condition
    LIMIT 1;

    IF existing_stock_id IS NULL THEN
      INSERT INTO public.stock (
        company_id, depot_id, category_id, category_product_id,
        quantity, condition, updated_at, created_at
      ) VALUES (
        NEW.company_id, NEW.depot_id, it.category_id, it.category_product_id,
        it.quantity, final_condition, now(), now()
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
      CASE WHEN final_condition = 'damaged' THEN 'repair_in' ELSE 'entry' END,
      it.quantity, '', final_condition,
      'Sorting batch ' || NEW.id::text, actor_id, now()
    );
  END LOOP;

  NEW.committed_at := now();
  RETURN NEW;
END;
$$;

-- 3. Update condition constraint to remove ready_a/b/c
ALTER TABLE public.stock DROP CONSTRAINT IF EXISTS stock_condition_check;
ALTER TABLE public.stock ADD CONSTRAINT stock_condition_check
  CHECK (condition = ANY (ARRAY['good', 'damaged', 'repaired', 'sorting_pending', 'sorting']));
