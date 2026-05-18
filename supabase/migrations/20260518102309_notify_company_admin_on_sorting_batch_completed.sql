/*
  # Notify company_admin when sorting batch is completed

  1. New Trigger
    - `trg_sorting_batch_completed_notify` on `pallet_sorting_batches`
    - Fires AFTER UPDATE when status changes to 'completed'
    - Notifies all company_admin users in the same company

  2. Purpose
    - Company admins need to know when sorting is done to review results
    - Includes batch reference number and total received for quick context

  3. Security
    - SECURITY DEFINER with fixed search_path
*/

CREATE OR REPLACE FUNCTION public.sorting_batch_completed_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  ref_label text;
BEGIN
  IF NEW.status <> 'completed' OR OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  ref_label := COALESCE(NEW.reference_number_snapshot, '');

  INSERT INTO notifications (user_id, title, message, type, reference_id, data)
  SELECT
    p.id,
    'Sortimi perfundoi',
    'Batch ' || ref_label || ' u klasifikua (' || COALESCE(NEW.total_received, 0) || ' cope).',
    'stock',
    NEW.id,
    jsonb_build_object(
      'event', 'sorting_completed',
      'batch_id', NEW.id::text,
      'reference_number', ref_label,
      'total_received', COALESCE(NEW.total_received, 0),
      'url', '/company/stock'
    )
  FROM profiles p
  WHERE p.company_id = NEW.company_id
    AND p.role IN ('company_admin', 'logistics_admin')
    AND p.is_active = true;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sorting_batch_completed_notify ON pallet_sorting_batches;

CREATE TRIGGER trg_sorting_batch_completed_notify
  AFTER UPDATE OF status ON pallet_sorting_batches
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION sorting_batch_completed_notify();
