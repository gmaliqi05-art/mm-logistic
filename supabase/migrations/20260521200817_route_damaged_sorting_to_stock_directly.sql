/*
  # Route damaged sorting items directly to stock

  1. Changes
    - Modified `commit_sorting_batch_to_stock()` trigger function
    - Damaged items from sorting now go into the `stock` table with condition='damaged'
      instead of being routed to `depot_repairs`
    - This simplifies the flow: all sorted items (good, damaged, ready_a, etc.)
      are treated the same way and end up in stock
    - Stock movements are still recorded for full traceability

  2. Rationale
    - Damaged pallets are just stock with condition='damaged'
    - They don't need separate repair case tracking
    - The repair process (discharging defekt stock) works directly from the stock table
    - Evidence of who brought them is already in stock_movements
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
    -- All conditions (good, damaged, ready_a, ready_b, ready_c, etc.) go to stock
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
