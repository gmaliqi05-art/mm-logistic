/*
  # Fix pallet sorting: allow NULL category_product_id and update commit trigger

  1. Modified Tables
    - `pallet_sorting_items`: DROP NOT NULL on `category_product_id`
      - Allows defekt rows to be stored without a specific product
  
  2. Updated Functions
    - `commit_sorting_batch_to_stock()`: Uses LEFT JOIN so items with NULL 
      category_product_id still get committed to stock correctly

  3. Data Fix
    - Updates `sorting_mode` to 'class' on categories that contain Klasse A/B/C products

  This fixes the error: "null value in column category_product_id violates not-null constraint"
  that occurs when saving sorting batches with defekt items.
*/

-- 1. Allow NULL on category_product_id
ALTER TABLE public.pallet_sorting_items
  ALTER COLUMN category_product_id DROP NOT NULL;

-- 2. Recreate commit trigger with LEFT JOIN for NULL product support
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

  NEW.committed_at := now();
  RETURN NEW;
END;
$$;

-- 3. Fix sorting_mode for categories that have Klasse products
UPDATE public.product_categories
SET sorting_mode = 'class'
WHERE sorting_mode = 'none'
  AND id IN (
    SELECT DISTINCT category_id
    FROM public.category_products
    WHERE lower(name) LIKE '%klasse%'
  );
