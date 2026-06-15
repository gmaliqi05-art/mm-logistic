/*
  # MH4: wire up the unused hr_notifications.type='overtime_alert'

  ## Why
  Migration 20260518061704 added `hr_notifications.type` with
  'overtime_alert' as a permitted value (line 231) but never
  implemented the trigger that produces such a notification. Result:
  the type is defined in the enum, the UI knows how to render it, but
  zero rows are ever generated — employees and admins have no in-app
  signal when overtime is logged.

  ## What this adds
  - `hr_notify_overtime()` AFTER INSERT OR UPDATE OF overtime_hours
    on `work_hours_log`. Fires only when:
      - new overtime_hours > 0, AND
      - either this is the first row for the (user, date) pair OR the
        OLD value was 0 / NULL (so editing the same row's overtime up
        from 0 → 3 fires, but adjusting 3 → 4 does not re-spam).

  ## Notifications produced
  1. recipient = the employee themselves so they have a record that
     overtime was logged on their account (some setups have admins
     enter hours and the employee deserves an audit trail).
  2. recipient = each `company_admin` in the same company so the
     overtime is visible on the admin dashboard for approval / payroll
     review.

  Title and message are kept in Albanian (the source-of-truth language
  in the rest of `hr_update_leave_balance`) and include the date and
  the overtime amount. UI translations live in `src/i18n/*.ts`.

  ## Safety
  - No data backfill — only future writes are notified.
  - Idempotent: the function is CREATE OR REPLACE; the trigger uses
    DROP TRIGGER IF EXISTS first.
  - SECURITY DEFINER + pinned search_path matches the rest of the HR
    triggers in the canonical migration.
*/

CREATE OR REPLACE FUNCTION public.hr_notify_overtime()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_ot numeric;
  v_admin RECORD;
  v_employee_name text;
  v_overtime numeric := COALESCE(NEW.overtime_hours, 0);
  v_should_fire boolean;
BEGIN
  IF v_overtime <= 0 THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_should_fire := true;
  ELSE
    v_old_ot := COALESCE(OLD.overtime_hours, 0);
    v_should_fire := v_old_ot <= 0;
  END IF;

  IF NOT v_should_fire THEN
    RETURN NEW;
  END IF;

  SELECT full_name INTO v_employee_name FROM public.profiles WHERE id = NEW.user_id;

  -- Employee themselves
  INSERT INTO public.hr_notifications (company_id, recipient_id, type, related_id, title, message)
  VALUES (
    NEW.company_id, NEW.user_id, 'overtime_alert', NEW.id,
    'Ore shtese te regjistruara',
    'Per daten ' || NEW.date || ' jane regjistruar ' || v_overtime::text || 'h jashte orarit standard. Verifikoni regjistrimin nese keto ore nuk ju perkasin.'
  );

  -- Every active company_admin
  FOR v_admin IN
    SELECT id FROM public.profiles
     WHERE company_id = NEW.company_id
       AND role = 'company_admin'
       AND is_active = true
       AND id <> NEW.user_id
  LOOP
    INSERT INTO public.hr_notifications (company_id, recipient_id, type, related_id, title, message)
    VALUES (
      NEW.company_id, v_admin.id, 'overtime_alert', NEW.id,
      'Ore shtese',
      COALESCE(v_employee_name, 'Nje punonjes') || ' ka regjistruar ' || v_overtime::text || 'h jashte orarit standard me ' || NEW.date || '.'
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_notify_overtime ON public.work_hours_log;
CREATE TRIGGER trg_hr_notify_overtime
AFTER INSERT OR UPDATE OF overtime_hours ON public.work_hours_log
FOR EACH ROW EXECUTE FUNCTION public.hr_notify_overtime();

COMMENT ON FUNCTION public.hr_notify_overtime IS
  'Inserts hr_notifications of type ''overtime_alert'' to the employee and to every active company_admin when a work_hours_log row crosses into positive overtime. Fires only on the 0→>0 transition so editing the same row''s overtime up from 3h to 4h does not re-spam.';
