/*
  # Assign demo notes to a driver + refresh overdue seed

  1. Purpose
     - The earlier overdue demo seed created delivery notes with no
       assigned_driver_id, so the driver dashboard (which filters by
       assigned_driver_id) shows zero tasks. This migration updates those
       demo notes to belong to the first active driver of each company.
  2. Behaviour
     - Only touches rows whose note_number starts with FD-DEMO-OV or
       FM-DEMO-OV so production data is untouched.
     - Refreshes scheduled dates around "now" each time the migration runs
       to keep overdue / today / tomorrow cases realistic.
     - Sets a sensible initial status (sent / in_transit) so the notes
       appear on the driver dashboard and the overdue page.
  3. Safety
     - Uses IF EXISTS and company-scoped updates only.
*/

DO $$
DECLARE
  r_company record;
  v_driver  uuid;
  v_now     timestamptz := now();
BEGIN
  FOR r_company IN SELECT id FROM companies LOOP
    SELECT id INTO v_driver
      FROM profiles
      WHERE company_id = r_company.id AND role = 'driver' AND is_active = true
      ORDER BY created_at ASC NULLS LAST
      LIMIT 1;

    IF v_driver IS NULL THEN
      CONTINUE;
    END IF;

    -- 5 delivery demos: offsets -3, -1, 0, +1, +3 days
    UPDATE delivery_notes SET assigned_driver_id = v_driver, status = 'sent',
      scheduled_delivery_at = v_now + interval '-3 days'
      WHERE company_id = r_company.id AND note_number = 'FD-DEMO-OV-D1';
    UPDATE delivery_notes SET assigned_driver_id = v_driver, status = 'in_transit',
      scheduled_delivery_at = v_now + interval '-1 days'
      WHERE company_id = r_company.id AND note_number = 'FD-DEMO-OV-D2';
    UPDATE delivery_notes SET assigned_driver_id = v_driver, status = 'sent',
      scheduled_delivery_at = v_now
      WHERE company_id = r_company.id AND note_number = 'FD-DEMO-OV-D3';
    UPDATE delivery_notes SET assigned_driver_id = v_driver, status = 'sent',
      scheduled_delivery_at = v_now + interval '1 day'
      WHERE company_id = r_company.id AND note_number = 'FD-DEMO-OV-D4';
    UPDATE delivery_notes SET assigned_driver_id = v_driver, status = 'sent',
      scheduled_delivery_at = v_now + interval '3 days'
      WHERE company_id = r_company.id AND note_number = 'FD-DEMO-OV-D5';

    -- 5 pickup demos: offsets -3, -1, 0, +1, +3 days
    UPDATE delivery_notes SET assigned_driver_id = v_driver, status = 'in_transit',
      scheduled_pickup_at = v_now + interval '-3 days'
      WHERE company_id = r_company.id AND note_number = 'FM-DEMO-OV-P1';
    UPDATE delivery_notes SET assigned_driver_id = v_driver, status = 'sent',
      scheduled_pickup_at = v_now + interval '-1 days'
      WHERE company_id = r_company.id AND note_number = 'FM-DEMO-OV-P2';
    UPDATE delivery_notes SET assigned_driver_id = v_driver, status = 'sent',
      scheduled_pickup_at = v_now
      WHERE company_id = r_company.id AND note_number = 'FM-DEMO-OV-P3';
    UPDATE delivery_notes SET assigned_driver_id = v_driver, status = 'sent',
      scheduled_pickup_at = v_now + interval '1 day'
      WHERE company_id = r_company.id AND note_number = 'FM-DEMO-OV-P4';
    UPDATE delivery_notes SET assigned_driver_id = v_driver, status = 'sent',
      scheduled_pickup_at = v_now + interval '3 days'
      WHERE company_id = r_company.id AND note_number = 'FM-DEMO-OV-P5';
  END LOOP;
END $$;
