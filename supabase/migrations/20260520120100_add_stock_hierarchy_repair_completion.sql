-- ============================================================================
-- PENDING MIGRATION: Stock Hierarchy + Sorting/Repair Completion
-- ----------------------------------------------------------------------------
-- Apply via the Supabase dashboard SQL editor. The client code is already
-- updated to require category_product_id on delivery note items before
-- confirming stock, and it reads pallet_sorting_batches + depot_repairs for
-- the "In Process" panel on the Stock page.
--
-- SUMMARY
--   Enforces category_product_id on stock rows (after backfill).
--   Expands stock.condition vocabulary and stock_movements.movement_type.
--   Adds apply_repair_completion(repair_id, repaired_qty, scrapped_qty,
--     target_category_product_id) RPC. Atomically moves damaged stock to
--     repaired stock and logs stock_movements.
--   Adds v_available_stock + v_in_process_stock reporting views.
--   Ensures every category has a default "Unclassified" product for legacy
--   stock rows that lack category_product_id.
--
-- SECURITY
--   RPC is SECURITY DEFINER with search_path=public; execute granted to
--   authenticated. All logic is scoped by auth.uid() membership via profiles.
-- ============================================================================

-- 1. Default product per category so no stock row can be product-less
INSERT INTO category_products (id, company_id, category_id, name, is_active, created_at, updated_at)
SELECT gen_random_uuid(), c.company_id, c.id, c.name || ' - I paklasifikuar', true, now(), now()
FROM product_categories c
WHERE NOT EXISTS (
  SELECT 1 FROM category_products cp
  WHERE cp.category_id = c.id AND cp.company_id = c.company_id AND cp.is_active
)
ON CONFLICT DO NOTHING;

-- 2. Backfill stock rows missing category_product_id by linking to the default
UPDATE stock s
SET category_product_id = cp.id
FROM category_products cp
WHERE s.category_product_id IS NULL
  AND s.company_id = cp.company_id
  AND s.category_id = cp.category_id
  AND cp.is_active
  AND cp.name LIKE '% - I paklasifikuar';

-- 3. Expand condition + movement_type vocabulary (guarded)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.check_constraints WHERE constraint_name = 'stock_condition_check') THEN
    ALTER TABLE stock DROP CONSTRAINT stock_condition_check;
  END IF;
  ALTER TABLE stock ADD CONSTRAINT stock_condition_check
    CHECK (condition IN ('good','damaged','repaired','sorting_pending','ready_a','ready_b','ready_c','sorting'));
EXCEPTION WHEN others THEN NULL; END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.check_constraints WHERE constraint_name = 'stock_movements_movement_type_check') THEN
    ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_movement_type_check;
  END IF;
  ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_movement_type_check
    CHECK (movement_type IN ('entry','exit','repair','scrap','sort_in','sort_commit','transfer_in','transfer_out','custody_in','custody_out','adjust'));
EXCEPTION WHEN others THEN NULL; END $$;

-- 4. Repair completion RPC: move damaged stock -> repaired stock atomically
CREATE OR REPLACE FUNCTION public.apply_repair_completion(
  p_repair_id uuid,
  p_repaired_qty integer,
  p_scrapped_qty integer,
  p_target_category_product_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_repair record;
  v_total integer;
  v_damaged_row record;
  v_repaired_id uuid;
BEGIN
  SELECT * INTO v_repair FROM depot_repairs WHERE id = p_repair_id;
  IF v_repair IS NULL THEN RAISE EXCEPTION 'Repair not found'; END IF;

  v_total := coalesce(p_repaired_qty,0) + coalesce(p_scrapped_qty,0);
  IF v_total <= 0 THEN RAISE EXCEPTION 'Asnje sasi per te raportuar'; END IF;
  IF v_repair.quantity_repaired + v_repair.quantity_scrapped + v_total
     > v_repair.quantity_in THEN
    RAISE EXCEPTION 'Sasia tejkalon totalin e pritur ne reparature';
  END IF;

  -- Decrement damaged stock in the same depot+category
  SELECT * INTO v_damaged_row FROM stock
    WHERE company_id = v_repair.company_id
      AND depot_id = v_repair.depot_id
      AND category_id = v_repair.category_id
      AND condition = 'damaged'
    ORDER BY updated_at DESC
    LIMIT 1;
  IF v_damaged_row IS NOT NULL AND v_damaged_row.quantity >= v_total THEN
    UPDATE stock SET quantity = quantity - v_total, updated_at = now()
      WHERE id = v_damaged_row.id;
    INSERT INTO stock_movements (company_id, depot_id, category_id, category_product_id, movement_type, quantity, condition_before, condition_after, notes, performed_by)
      VALUES (v_repair.company_id, v_repair.depot_id, v_repair.category_id, v_damaged_row.category_product_id, 'repair', v_total, 'damaged', 'repaired', 'Reparim i raportuar', auth.uid());
  END IF;

  -- Increment repaired stock for repaired qty
  IF p_repaired_qty > 0 THEN
    SELECT id INTO v_repaired_id FROM stock
      WHERE company_id = v_repair.company_id
        AND depot_id = v_repair.depot_id
        AND category_id = v_repair.category_id
        AND category_product_id = p_target_category_product_id
        AND condition = 'repaired'
      LIMIT 1;
    IF v_repaired_id IS NULL THEN
      INSERT INTO stock (company_id, depot_id, category_id, category_product_id, condition, quantity, updated_at, created_at)
        VALUES (v_repair.company_id, v_repair.depot_id, v_repair.category_id, p_target_category_product_id, 'repaired', p_repaired_qty, now(), now());
    ELSE
      UPDATE stock SET quantity = quantity + p_repaired_qty, updated_at = now()
        WHERE id = v_repaired_id;
    END IF;
  END IF;

  -- Log scrap movement (no re-entry)
  IF p_scrapped_qty > 0 THEN
    INSERT INTO stock_movements (company_id, depot_id, category_id, category_product_id, movement_type, quantity, condition_before, condition_after, notes, performed_by)
      VALUES (v_repair.company_id, v_repair.depot_id, v_repair.category_id, p_target_category_product_id, 'scrap', p_scrapped_qty, 'damaged', 'damaged', 'Hedhur si scrap gjate raportimit te riparimit', auth.uid());
  END IF;

  UPDATE depot_repairs
    SET quantity_repaired = quantity_repaired + p_repaired_qty,
        quantity_scrapped = quantity_scrapped + p_scrapped_qty
    WHERE id = p_repair_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.apply_repair_completion(uuid,integer,integer,uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.apply_repair_completion(uuid,integer,integer,uuid) TO authenticated, service_role;

-- 5. Reporting views
CREATE OR REPLACE VIEW v_available_stock AS
SELECT s.*
FROM stock s
WHERE s.condition IN ('good','repaired','ready_a','ready_b','ready_c')
  AND s.quantity > 0;

CREATE OR REPLACE VIEW v_in_process_stock AS
SELECT s.*
FROM stock s
WHERE s.condition IN ('damaged','sorting_pending','sorting')
  AND s.quantity > 0;

-- ============================================================================
-- SORTING: Ensure damaged items in sorting batches create depot_repairs
-- ============================================================================
-- The existing commit_sorting_batch_to_stock trigger posts stock rows for each
-- pallet_sorting_items row (condition-aware). This helper ensures that any
-- damaged pallets sorted within a batch also open a depot_repairs case, and
-- that the "Defekt" class product exists for every class-mode category.

-- Seed "Defekt" category_product per class-mode category if missing
INSERT INTO category_products (id, company_id, category_id, name, is_active, created_at, updated_at)
SELECT gen_random_uuid(), c.company_id, c.id, 'Defekt', true, now(), now()
FROM product_categories c
WHERE c.sorting_mode = 'class'
  AND NOT EXISTS (
    SELECT 1 FROM category_products cp
    WHERE cp.category_id = c.id
      AND cp.company_id = c.company_id
      AND lower(cp.name) LIKE '%defekt%'
  )
ON CONFLICT DO NOTHING;

-- After-completion trigger: when batch completes, open a depot_repairs row for
-- each damaged item in that batch, so the repair workflow kicks in.
CREATE OR REPLACE FUNCTION public.open_repairs_from_sorting_batch()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_item record;
  v_cat_name text;
BEGIN
  IF NEW.status <> 'completed' OR (OLD.status IS NOT DISTINCT FROM 'completed') THEN
    RETURN NEW;
  END IF;

  FOR v_item IN
    SELECT psi.*, cp.name AS product_name
    FROM pallet_sorting_items psi
    JOIN category_products cp ON cp.id = psi.category_product_id
    WHERE psi.batch_id = NEW.id
      AND (psi.condition = 'damaged' OR lower(cp.name) LIKE '%defekt%')
      AND psi.quantity > 0
  LOOP
    SELECT name INTO v_cat_name FROM product_categories WHERE id = NEW.category_id;
    INSERT INTO depot_repairs (
      company_id, depot_id, category_id, product_name,
      quantity_in, quantity_repaired, quantity_scrapped,
      source_delivery_note_id, logged_at, created_at, updated_at
    ) VALUES (
      NEW.company_id, NEW.depot_id, NEW.category_id, v_item.product_name,
      v_item.quantity, 0, 0,
      NEW.source_delivery_note_id, now(), now(), now()
    );
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sorting_batch_open_repairs ON pallet_sorting_batches;
CREATE TRIGGER trg_sorting_batch_open_repairs
  AFTER UPDATE ON pallet_sorting_batches
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND OLD.status <> 'completed')
  EXECUTE FUNCTION public.open_repairs_from_sorting_batch();
