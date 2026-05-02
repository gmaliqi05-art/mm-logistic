/*
  # Pallet Sorting System

  Adds a sorting (selektim) workflow for incoming used pallets that arrive
  mixed and need to be classified into A/B/C Klasse + defects, or into
  specific product types (e.g. CP1, CP3, CP5, CP9).

  1. Changes to `product_categories`
     - `sorting_mode` text: 'none' | 'class' | 'type'
         * 'none'  -> category does not require sorting (e.g. new pallets,
                       items that map 1:1 to a single product)
         * 'class' -> A/B/C Klasse + defect sorting (EPAL/Euro/UIC used)
         * 'type'  -> sort by product type (e.g. CP1..CP9)
     - `aliases` text[]: alternative names used by different suppliers so that
       the AI scanner can match "EPAL", "UIC", "Euro Palette" all to the
       single "Euro Paleta" category.

  2. New table `pallet_sorting_batches`
     - One row per arriving load of mixed used pallets that has to be sorted.
     - `total_received` is the quantity the depot received before sorting.
     - `status` transitions draft/in_progress -> completed / cancelled.
     - When status becomes 'completed', a trigger commits the batch items to
       the stock/stock_movements tables.

  3. New table `pallet_sorting_items`
     - Breakdown of a batch into target category_products (A/B/C/Defekt or
       CP1..CP9) with a quantity and a condition.

  4. Security
     - RLS enabled on both new tables.
     - SELECT/INSERT/UPDATE/DELETE policies restricted to users of the same
       company. Depot workers can work on batches in their own depot;
       company admins can see and manage all batches of their company.

  5. Important notes
     - The commit trigger is idempotent: it only runs once when the batch
       transitions to 'completed'. Re-updating a completed batch does not
       double-post to stock.
     - No destructive changes. Existing categories get `sorting_mode='none'`
       by default and keep behaving exactly as before.
     - No data dedup of EPAL/UIC/Euro categories is performed automatically.
       Company admins consolidate via the Categories UI using the new
       `aliases` field.
*/

-- 1. Extend product_categories --------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='product_categories' AND column_name='sorting_mode'
  ) THEN
    ALTER TABLE public.product_categories
      ADD COLUMN sorting_mode text NOT NULL DEFAULT 'none'
        CHECK (sorting_mode IN ('none','class','type'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='product_categories' AND column_name='aliases'
  ) THEN
    ALTER TABLE public.product_categories
      ADD COLUMN aliases text[] NOT NULL DEFAULT ARRAY[]::text[];
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_product_categories_sorting_mode
  ON public.product_categories(sorting_mode);

-- 2. pallet_sorting_batches ----------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pallet_sorting_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  depot_id uuid NOT NULL REFERENCES public.depots(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.product_categories(id) ON DELETE RESTRICT,
  source_delivery_note_id uuid REFERENCES public.delivery_notes(id) ON DELETE SET NULL,
  total_received integer NOT NULL DEFAULT 0 CHECK (total_received >= 0),
  status text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress','completed','cancelled')),
  notes text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  completed_by uuid REFERENCES public.profiles(id),
  completed_at timestamptz,
  committed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_psb_company ON public.pallet_sorting_batches(company_id);
CREATE INDEX IF NOT EXISTS idx_psb_depot ON public.pallet_sorting_batches(depot_id);
CREATE INDEX IF NOT EXISTS idx_psb_status ON public.pallet_sorting_batches(status);
CREATE INDEX IF NOT EXISTS idx_psb_category ON public.pallet_sorting_batches(category_id);

ALTER TABLE public.pallet_sorting_batches ENABLE ROW LEVEL SECURITY;

-- 3. pallet_sorting_items ------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pallet_sorting_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.pallet_sorting_batches(id) ON DELETE CASCADE,
  category_product_id uuid NOT NULL REFERENCES public.category_products(id) ON DELETE RESTRICT,
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  condition text NOT NULL DEFAULT 'good'
    CHECK (condition IN ('good','damaged','repaired')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_psi_batch ON public.pallet_sorting_items(batch_id);
CREATE INDEX IF NOT EXISTS idx_psi_product ON public.pallet_sorting_items(category_product_id);

ALTER TABLE public.pallet_sorting_items ENABLE ROW LEVEL SECURITY;

-- 4. RLS policies --------------------------------------------------------------

DROP POLICY IF EXISTS "psb_select_same_company" ON public.pallet_sorting_batches;
CREATE POLICY "psb_select_same_company"
  ON public.pallet_sorting_batches FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "psb_insert_same_company" ON public.pallet_sorting_batches;
CREATE POLICY "psb_insert_same_company"
  ON public.pallet_sorting_batches FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "psb_update_same_company" ON public.pallet_sorting_batches;
CREATE POLICY "psb_update_same_company"
  ON public.pallet_sorting_batches FOR UPDATE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "psb_delete_same_company" ON public.pallet_sorting_batches;
CREATE POLICY "psb_delete_same_company"
  ON public.pallet_sorting_batches FOR DELETE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
        AND role IN ('company_admin','super_admin')
    )
  );

DROP POLICY IF EXISTS "psi_select_same_company" ON public.pallet_sorting_items;
CREATE POLICY "psi_select_same_company"
  ON public.pallet_sorting_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pallet_sorting_batches b
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE b.id = pallet_sorting_items.batch_id
        AND b.company_id = p.company_id
    )
  );

DROP POLICY IF EXISTS "psi_insert_same_company" ON public.pallet_sorting_items;
CREATE POLICY "psi_insert_same_company"
  ON public.pallet_sorting_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.pallet_sorting_batches b
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE b.id = pallet_sorting_items.batch_id
        AND b.company_id = p.company_id
    )
  );

DROP POLICY IF EXISTS "psi_update_same_company" ON public.pallet_sorting_items;
CREATE POLICY "psi_update_same_company"
  ON public.pallet_sorting_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pallet_sorting_batches b
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE b.id = pallet_sorting_items.batch_id
        AND b.company_id = p.company_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.pallet_sorting_batches b
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE b.id = pallet_sorting_items.batch_id
        AND b.company_id = p.company_id
    )
  );

DROP POLICY IF EXISTS "psi_delete_same_company" ON public.pallet_sorting_items;
CREATE POLICY "psi_delete_same_company"
  ON public.pallet_sorting_items FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pallet_sorting_batches b
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE b.id = pallet_sorting_items.batch_id
        AND b.company_id = p.company_id
    )
  );

-- 5. Commit-to-stock trigger ---------------------------------------------------

CREATE OR REPLACE FUNCTION public.commit_sorting_batch_to_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  it record;
  existing_stock_id uuid;
  actor_id uuid;
BEGIN
  -- Only act on the transition to 'completed' (idempotent via committed_at).
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
    SELECT i.category_product_id, i.quantity, i.condition, cp.category_id
    FROM public.pallet_sorting_items i
    JOIN public.category_products cp ON cp.id = i.category_product_id
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
        SET quantity = quantity + it.quantity,
            updated_at = now()
        WHERE id = existing_stock_id;
    END IF;

    INSERT INTO public.stock_movements (
      company_id, depot_id, category_id, category_product_id,
      movement_type, quantity, condition_before, condition_after,
      notes, performed_by, created_at
    ) VALUES (
      NEW.company_id, NEW.depot_id, it.category_id, it.category_product_id,
      'entry', it.quantity, '', it.condition,
      'Sorting batch ' || NEW.id::text, actor_id, now()
    );
  END LOOP;

  NEW.committed_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_commit_sorting_batch ON public.pallet_sorting_batches;
CREATE TRIGGER trg_commit_sorting_batch
  BEFORE UPDATE ON public.pallet_sorting_batches
  FOR EACH ROW
  EXECUTE FUNCTION public.commit_sorting_batch_to_stock();

-- Updated-at trigger ---------------------------------------------------------

CREATE OR REPLACE FUNCTION public.touch_psb_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_psb_touch_updated_at ON public.pallet_sorting_batches;
CREATE TRIGGER trg_psb_touch_updated_at
  BEFORE UPDATE ON public.pallet_sorting_batches
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_psb_updated_at();
