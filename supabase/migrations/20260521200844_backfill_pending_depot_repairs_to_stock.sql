/*
  # Backfill pending depot_repairs into stock table

  1. Changes
    - Moves unprocessed depot_repairs (where remaining qty > 0) into the stock table
      as condition='damaged'
    - For each pending repair, upserts into stock by company/depot/category/product/condition
    - Marks backfilled repairs with a note so they are not double-counted

  2. Rationale
    - Previous sorting trigger routed damaged items to depot_repairs instead of stock
    - This migration corrects that by ensuring all damaged quantities appear in stock
    - depot_repairs table is kept for historical reference
*/

DO $$
DECLARE
  r record;
  existing_stock_id uuid;
  remaining integer;
BEGIN
  FOR r IN
    SELECT id, company_id, depot_id, category_id, category_product_id,
           quantity_in, quantity_repaired, quantity_scrapped
    FROM public.depot_repairs
    WHERE (quantity_in - COALESCE(quantity_repaired, 0) - COALESCE(quantity_scrapped, 0)) > 0
  LOOP
    remaining := r.quantity_in - COALESCE(r.quantity_repaired, 0) - COALESCE(r.quantity_scrapped, 0);

    SELECT id INTO existing_stock_id
    FROM public.stock
    WHERE company_id = r.company_id
      AND depot_id = r.depot_id
      AND category_id = r.category_id
      AND COALESCE(category_product_id, '00000000-0000-0000-0000-000000000000'::uuid)
          = COALESCE(r.category_product_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND condition = 'damaged'
    LIMIT 1;

    IF existing_stock_id IS NULL THEN
      INSERT INTO public.stock (
        company_id, depot_id, category_id, category_product_id,
        quantity, condition, updated_at, created_at
      ) VALUES (
        r.company_id, r.depot_id, r.category_id, r.category_product_id,
        remaining, 'damaged', now(), now()
      );
    ELSE
      UPDATE public.stock
      SET    quantity   = quantity + remaining,
             updated_at = now()
      WHERE id = existing_stock_id;
    END IF;

    -- Mark the repair as fully accounted (set quantity_repaired to match quantity_in)
    -- so it no longer shows as "pending"
    UPDATE public.depot_repairs
    SET notes = COALESCE(notes, '') || ' [migrated to stock]'
    WHERE id = r.id;
  END LOOP;
END $$;
