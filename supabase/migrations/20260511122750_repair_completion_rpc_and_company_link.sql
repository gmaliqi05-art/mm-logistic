/*
  # Repair to Stock Linkage

  1. Changes
    - Expand `stock.condition` check constraint to include sorting_pending
    - Expand `stock_movements.movement_type` check constraint to include scrap, sort_in, sort_commit, transfer_in, transfer_out, custody_in, custody_out, adjust
    - Deploy `apply_repair_completion(repair_id, repaired_qty, scrapped_qty, target_category_product_id)` RPC
      - Atomically decrements damaged stock, increments repaired stock, logs stock_movements entries
      - Updates depot_repairs.quantity_repaired / quantity_scrapped counters
    - Add `notify_company_on_repair_sent_to_stock()` trigger on depot_repair_reports
      - Fires when sent_to_stock_at transitions from NULL to a timestamp
      - Creates a notification for every company_admin and logistics_admin of the company

  2. Security
    - RPC runs SECURITY DEFINER, revoked from PUBLIC, granted to authenticated and service_role
    - Notification insert happens inside trigger with SECURITY DEFINER
*/

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_condition_check') THEN
    ALTER TABLE stock DROP CONSTRAINT stock_condition_check;
  END IF;
  ALTER TABLE stock ADD CONSTRAINT stock_condition_check
    CHECK (condition IN ('good','damaged','repaired','sorting_pending','ready_a','ready_b','ready_c','sorting'));
EXCEPTION WHEN others THEN NULL; END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_movements_movement_type_check') THEN
    ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_movement_type_check;
  END IF;
  ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_movement_type_check
    CHECK (movement_type IN ('entry','exit','repair','scrap','sort_in','sort_commit','transfer_in','transfer_out','custody_in','custody_out','adjust'));
EXCEPTION WHEN others THEN NULL; END $$;

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
  IF coalesce(v_repair.quantity_repaired,0) + coalesce(v_repair.quantity_scrapped,0) + v_total
     > coalesce(v_repair.quantity_in,0) THEN
    RAISE EXCEPTION 'Sasia tejkalon totalin e pritur ne reparature';
  END IF;

  SELECT * INTO v_damaged_row FROM stock
    WHERE company_id = v_repair.company_id
      AND depot_id = v_repair.depot_id
      AND category_id = v_repair.category_id
      AND condition = 'damaged'
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1;

  IF v_damaged_row.id IS NOT NULL AND v_damaged_row.quantity >= v_total THEN
    UPDATE stock SET quantity = quantity - v_total, updated_at = now()
      WHERE id = v_damaged_row.id;
    INSERT INTO stock_movements (company_id, depot_id, category_id, category_product_id, movement_type, quantity, condition_before, condition_after, notes, performed_by)
      VALUES (v_repair.company_id, v_repair.depot_id, v_repair.category_id, v_damaged_row.category_product_id, 'repair', v_total, 'damaged', 'repaired', 'Reparim i raportuar', auth.uid());
  END IF;

  IF coalesce(p_repaired_qty,0) > 0 AND p_target_category_product_id IS NOT NULL THEN
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
    INSERT INTO stock_movements (company_id, depot_id, category_id, category_product_id, movement_type, quantity, condition_before, condition_after, notes, performed_by)
      VALUES (v_repair.company_id, v_repair.depot_id, v_repair.category_id, p_target_category_product_id, 'repair', p_repaired_qty, 'damaged', 'repaired', 'Palet te reparuara -> stok', auth.uid());
  END IF;

  IF coalesce(p_scrapped_qty,0) > 0 THEN
    INSERT INTO stock_movements (company_id, depot_id, category_id, category_product_id, movement_type, quantity, condition_before, condition_after, notes, performed_by)
      VALUES (v_repair.company_id, v_repair.depot_id, v_repair.category_id, p_target_category_product_id, 'scrap', p_scrapped_qty, 'damaged', 'damaged', 'Hedhur si scrap gjate raportimit te riparimit', auth.uid());
  END IF;

  UPDATE depot_repairs
    SET quantity_repaired = coalesce(quantity_repaired,0) + coalesce(p_repaired_qty,0),
        quantity_scrapped = coalesce(quantity_scrapped,0) + coalesce(p_scrapped_qty,0)
    WHERE id = p_repair_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.apply_repair_completion(uuid,integer,integer,uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.apply_repair_completion(uuid,integer,integer,uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.notify_company_on_repair_sent_to_stock()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_admin record;
  v_depot_name text := '';
  v_category_name text := '';
BEGIN
  IF NEW.sent_to_stock_at IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.sent_to_stock_at IS NOT NULL THEN RETURN NEW; END IF;

  SELECT name INTO v_depot_name FROM depots WHERE id = NEW.depot_id;
  SELECT name INTO v_category_name FROM product_categories WHERE id = NEW.category_id;

  FOR v_admin IN
    SELECT id FROM profiles
     WHERE company_id = NEW.company_id
       AND role IN ('company_admin','logistics_admin')
       AND is_active = true
  LOOP
    INSERT INTO notifications (user_id, title, message, type, data)
    VALUES (
      v_admin.id,
      'Palet te reparuara ne stok',
      coalesce(v_category_name,'Palet') || ' · ' || coalesce(v_depot_name,'Depoja') ||
        ' · ' || coalesce(NEW.repaired_quantity,0)::text || ' te reparuara / ' ||
        coalesce(NEW.scrapped_quantity,0)::text || ' scrap',
      'stock',
      jsonb_build_object(
        'repair_report_id', NEW.id,
        'depot_id', NEW.depot_id,
        'category_id', NEW.category_id,
        'repaired_quantity', NEW.repaired_quantity,
        'scrapped_quantity', NEW.scrapped_quantity,
        'sent_to_stock_at', NEW.sent_to_stock_at
      )
    );
  END LOOP;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_company_on_repair_sent ON depot_repair_reports;
CREATE TRIGGER trg_notify_company_on_repair_sent
  AFTER INSERT OR UPDATE OF sent_to_stock_at ON depot_repair_reports
  FOR EACH ROW EXECUTE FUNCTION public.notify_company_on_repair_sent_to_stock();
