/*
  # Allow NULL category_product_id on pallet_sorting_items

  The pallet domain stores damaged ("defekt") pallets at the category level
  only — a defekt row does not have a specific product (Klasse A/B/C, CP 3,
  K Palette, …) until it has been repaired. To match that model we relax the
  NOT NULL constraint on pallet_sorting_items.category_product_id so a sorting
  batch can record "X paleta defekt for this category" without an artificial
  "Defekt" placeholder product.

  The commit-to-stock trigger is updated to pull category_id from the parent
  batch when the item has no product_id (LEFT JOIN + COALESCE on
  NEW.category_id).

  Forward migration only — existing rows already have a product_id (the
  legacy "Defekt" category_product); nothing needs backfilling. Future inserts
  from the sorting UI will use category_product_id = NULL for the defekt
  bucket and the existing COALESCE-based stock lookup will fold them onto a
  single (category, NULL product, damaged) stock row.
*/

ALTER TABLE public.pallet_sorting_items
  ALTER COLUMN category_product_id DROP NOT NULL;

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

  -- LEFT JOIN so items with NULL category_product_id still surface; we then
  -- fall back to the batch's category_id (batches are always
  -- category-scoped).
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
    -- All conditions (good, damaged, ready_a, ready_b, ready_c, etc.) go to
    -- stock. A NULL category_product_id is a category-level bucket and
    -- merges with any existing (category, NULL, condition) stock row.
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
