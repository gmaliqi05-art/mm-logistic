/*
  # Route damaged sorting items to repair instead of stock

  1. Changes
    - Modified `commit_sorting_batch_to_stock()` trigger function
    - Items with condition='damaged' from sorting are now inserted into `depot_repairs`
      instead of the `stock` table
    - All other conditions (good, repaired, ready_a, ready_b, ready_c) still go to stock
    - Stock movements are still recorded for audit trail regardless of destination

  2. Important notes
    - This is idempotent; existing completed batches won't re-trigger
    - Damaged items get quantity_in set, with quantity_repaired and quantity_scrapped at 0
*/

CREATE OR REPLACE FUNCTION public.commit_sorting_batch_to_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  it record;
  existing_stock_id uuid;
  existing_repair_id uuid;
  actor_id uuid;
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
    SELECT i.category_product_id, i.quantity, i.condition, cp.category_id, cp.name as product_name
    FROM public.pallet_sorting_items i
    JOIN public.category_products cp ON cp.id = i.category_product_id
    WHERE i.batch_id = NEW.id AND i.quantity > 0
  LOOP
    IF it.condition = 'damaged' THEN
      -- Route damaged items to repair
      SELECT id INTO existing_repair_id
      FROM public.depot_repairs
      WHERE company_id = NEW.company_id
        AND depot_id = NEW.depot_id
        AND category_product_id = it.category_product_id
        AND source_delivery_note_id = NEW.source_delivery_note_id
      LIMIT 1;

      IF existing_repair_id IS NOT NULL THEN
        UPDATE public.depot_repairs
        SET quantity_in = quantity_in + it.quantity
        WHERE id = existing_repair_id;
      ELSE
        INSERT INTO public.depot_repairs (
          company_id, depot_id, category_id, category_product_id,
          quantity_in, quantity_repaired, quantity_scrapped,
          notes, product_name, source_delivery_note_id, worker_id
        ) VALUES (
          NEW.company_id, NEW.depot_id, it.category_id, it.category_product_id,
          it.quantity, 0, 0,
          'Nga sortimi i batch ' || NEW.id::text,
          COALESCE(it.product_name, ''),
          NEW.source_delivery_note_id, actor_id
        );
      END IF;
    ELSE
      -- Route good/repaired items to stock
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
          SET quantity = quantity + it.quantity,
              updated_at = now()
          WHERE id = existing_stock_id;
      END IF;
    END IF;

    -- Always record a stock movement for audit
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
