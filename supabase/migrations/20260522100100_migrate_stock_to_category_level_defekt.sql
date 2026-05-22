/*
  # Migrate existing stock to category-level defekt model

  Follows 20260522100000 (which allowed NULL category_product_id on
  pallet_sorting_items). Aligns the existing `stock` rows with the model
  pallet companies actually use:

    - Damaged ("defekt") pallets are tracked per category, not per
      product. They only get a product once they have been repaired.
    - ready_a / ready_b / ready_c are legacy condition codes used while
      defekt stock was still attached to the Klasse A/B/C placeholder
      products. The sorted output should live as condition='good' on the
      matching Klasse product (or on the existing product if no Klasse
      match is found — e.g. K Palette where the category itself is the
      class).
    - Stock rows with condition='sorting' are mid-sort items pending
      classification; per the new model they are category-level and
      should be condition='sorting_pending' with NULL product_id.

  This is a one-shot data migration. The migration file itself is the
  audit trail; we do not append stock_movements rows (those require a
  non-null performed_by, which a SQL migration does not have).
*/

DO $$
DECLARE
  r record;
  v_existing_id uuid;
  v_total int;
BEGIN
  -- ---------------------------------------------------------------------
  -- 1) Consolidate damaged rows: set category_product_id = NULL and merge
  --    duplicates onto a single (company, depot, category, NULL, damaged)
  --    row per (company, depot, category).
  -- ---------------------------------------------------------------------
  FOR r IN
    SELECT company_id, depot_id, category_id, SUM(quantity)::int AS qty
    FROM public.stock
    WHERE condition = 'damaged'
    GROUP BY company_id, depot_id, category_id
  LOOP
    SELECT id INTO v_existing_id
    FROM public.stock
    WHERE company_id = r.company_id
      AND depot_id = r.depot_id
      AND category_id = r.category_id
      AND category_product_id IS NULL
      AND condition = 'damaged'
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      UPDATE public.stock
      SET quantity = r.qty, updated_at = now()
      WHERE id = v_existing_id;

      DELETE FROM public.stock
      WHERE company_id = r.company_id
        AND depot_id = r.depot_id
        AND category_id = r.category_id
        AND condition = 'damaged'
        AND id <> v_existing_id;
    ELSE
      -- Promote the largest-quantity row to NULL product, delete the rest.
      WITH ranked AS (
        SELECT id,
               ROW_NUMBER() OVER (ORDER BY quantity DESC, id) AS rn
        FROM public.stock
        WHERE company_id = r.company_id
          AND depot_id = r.depot_id
          AND category_id = r.category_id
          AND condition = 'damaged'
      )
      UPDATE public.stock s
      SET category_product_id = NULL,
          quantity = r.qty,
          updated_at = now()
      FROM ranked
      WHERE s.id = ranked.id AND ranked.rn = 1
      RETURNING s.id INTO v_existing_id;

      DELETE FROM public.stock
      WHERE company_id = r.company_id
        AND depot_id = r.depot_id
        AND category_id = r.category_id
        AND condition = 'damaged'
        AND id <> v_existing_id;
    END IF;
  END LOOP;

  -- ---------------------------------------------------------------------
  -- 2) ready_a / ready_b / ready_c → good of matching Klasse product
  --    Match Klasse by case-insensitive name within the same category.
  --    Falls back to keeping the row's existing product_id if no Klasse
  --    match exists (e.g. K Palette, where the category itself is the
  --    class). Quantity-zero ready rows are dropped.
  -- ---------------------------------------------------------------------
  DELETE FROM public.stock
  WHERE condition IN ('ready_a','ready_b','ready_c') AND quantity = 0;

  FOR r IN
    SELECT s.*
    FROM public.stock s
    WHERE s.condition IN ('ready_a','ready_b','ready_c')
  LOOP
    DECLARE
      v_klass_name text := CASE r.condition
        WHEN 'ready_a' THEN 'klasse a'
        WHEN 'ready_b' THEN 'klasse b'
        WHEN 'ready_c' THEN 'klasse c'
      END;
      v_target_product_id uuid;
    BEGIN
      SELECT cp.id INTO v_target_product_id
      FROM public.category_products cp
      WHERE cp.category_id = r.category_id
        AND lower(cp.name) = v_klass_name
      LIMIT 1;

      IF v_target_product_id IS NULL THEN
        v_target_product_id := r.category_product_id;
      END IF;

      SELECT id INTO v_existing_id
      FROM public.stock
      WHERE company_id = r.company_id
        AND depot_id = r.depot_id
        AND category_id = r.category_id
        AND COALESCE(category_product_id, '00000000-0000-0000-0000-000000000000'::uuid)
            = COALESCE(v_target_product_id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND condition = 'good'
        AND id <> r.id
      LIMIT 1;

      IF v_existing_id IS NOT NULL THEN
        UPDATE public.stock
        SET quantity = quantity + r.quantity, updated_at = now()
        WHERE id = v_existing_id;

        DELETE FROM public.stock WHERE id = r.id;
      ELSE
        UPDATE public.stock
        SET category_product_id = v_target_product_id,
            condition = 'good',
            updated_at = now()
        WHERE id = r.id;
      END IF;
    END;
  END LOOP;

  -- ---------------------------------------------------------------------
  -- 3) sorting → sorting_pending with NULL product (category-level
  --    pending bucket). Quantity-zero rows are dropped.
  -- ---------------------------------------------------------------------
  DELETE FROM public.stock
  WHERE condition = 'sorting' AND quantity = 0;

  FOR r IN
    SELECT s.*
    FROM public.stock s
    WHERE s.condition = 'sorting'
  LOOP
    SELECT id INTO v_existing_id
    FROM public.stock
    WHERE company_id = r.company_id
      AND depot_id = r.depot_id
      AND category_id = r.category_id
      AND category_product_id IS NULL
      AND condition = 'sorting_pending'
      AND id <> r.id
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      UPDATE public.stock
      SET quantity = quantity + r.quantity, updated_at = now()
      WHERE id = v_existing_id;

      DELETE FROM public.stock WHERE id = r.id;
    ELSE
      UPDATE public.stock
      SET category_product_id = NULL,
          condition = 'sorting_pending',
          updated_at = now()
      WHERE id = r.id;
    END IF;
  END LOOP;

  -- ---------------------------------------------------------------------
  -- 4) Drop empty (quantity=0) good rows with NULL product (legacy
  --    placeholders).
  -- ---------------------------------------------------------------------
  DELETE FROM public.stock
  WHERE condition = 'good'
    AND category_product_id IS NULL
    AND quantity = 0;

  v_total := (SELECT COUNT(*) FROM public.stock);
  RAISE NOTICE 'Migration complete. Stock rows: %', v_total;
END $$;
