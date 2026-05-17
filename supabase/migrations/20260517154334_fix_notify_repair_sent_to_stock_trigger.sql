/*
  # Fix notify_company_on_repair_sent_to_stock trigger

  1. Problem
    - The trigger references columns that don't exist on depot_repair_reports:
      NEW.category_id, NEW.repaired_quantity, NEW.scrapped_quantity
    - This causes "record new has no field category_id" error

  2. Solution
    - Rewrite to use actual columns: total_quantity, details, depot_id
    - Use depot_name and worker_name from existing data
*/

CREATE OR REPLACE FUNCTION public.notify_company_on_repair_sent_to_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_admin record;
  v_depot_name text := '';
  v_worker_name text := '';
BEGIN
  IF NEW.sent_to_stock_at IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.sent_to_stock_at IS NOT NULL THEN RETURN NEW; END IF;

  SELECT name INTO v_depot_name FROM depots WHERE id = NEW.depot_id;

  IF NEW.worker_id IS NOT NULL THEN
    SELECT full_name INTO v_worker_name FROM profiles WHERE id = NEW.worker_id;
  END IF;

  FOR v_admin IN
    SELECT id FROM profiles
    WHERE company_id = NEW.company_id
      AND role IN ('company_admin','logistics_admin')
      AND is_active = true
  LOOP
    INSERT INTO notifications (user_id, title, message, type, data)
    VALUES (
      v_admin.id,
      'Raport reparimesh ne stok',
      COALESCE(v_worker_name, 'Depo') || ' · ' || COALESCE(v_depot_name, 'Depoja') ||
        ' · ' || COALESCE(NEW.total_quantity, 0)::text || ' cope te reparuara',
      'stock',
      jsonb_build_object(
        'repair_report_id', NEW.id,
        'depot_id', NEW.depot_id,
        'total_quantity', NEW.total_quantity,
        'report_date', NEW.report_date,
        'sent_to_stock_at', NEW.sent_to_stock_at
      )
    );
  END LOOP;

  RETURN NEW;
END $function$;
