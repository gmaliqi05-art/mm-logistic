/*
  # Cancellation workflow + overdue demo seed

  1. Status changes
     - Extends delivery_notes.status CHECK constraint with the "cancelled" value
       so admins can cancel overdue delivery notes/pickups.
  2. New columns on delivery_notes
     - cancelled_at (timestamptz) — stamped when a note is cancelled
     - cancelled_by (uuid) — FK to profiles, who cancelled the note
     - cancel_reason (text) — optional reason the admin provided
  3. Demo data
     - Inserts 5 demo delivery notes and 5 demo pickups for the first existing
       company. Scheduled dates span: 3 days ago (overdue), yesterday (overdue),
       today, tomorrow, and 3 days from now. Statuses intentionally cover
       sent / in_transit so overdue screens have content to show. Records are
       idempotent by note_number so re-running the migration is safe.

  Notes:
    - No destructive changes; all DDL uses IF NOT EXISTS / IF EXISTS guards.
    - Seed is skipped cleanly if there is no company yet.
*/

ALTER TABLE delivery_notes DROP CONSTRAINT IF EXISTS delivery_notes_status_check;
ALTER TABLE delivery_notes ADD CONSTRAINT delivery_notes_status_check
  CHECK (status IN (
    'draft',
    'sent',
    'in_transit',
    'pending_company_review',
    'pending_stock_confirmation',
    'delivered',
    'completed',
    'confirmed',
    'cancelled'
  ));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='delivery_notes' AND column_name='cancelled_at'
  ) THEN
    ALTER TABLE delivery_notes ADD COLUMN cancelled_at timestamptz;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='delivery_notes' AND column_name='cancelled_by'
  ) THEN
    ALTER TABLE delivery_notes ADD COLUMN cancelled_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='delivery_notes' AND column_name='cancel_reason'
  ) THEN
    ALTER TABLE delivery_notes ADD COLUMN cancel_reason text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_delivery_notes_status_scheduled
  ON delivery_notes(status, scheduled_delivery_at, scheduled_pickup_at);

DO $$
DECLARE
  v_company_id uuid;
  v_creator    uuid;
  v_depot_id   uuid;
  v_now        timestamptz := now();
  v_delivery_offsets integer[] := ARRAY[-3, -1, 0, 1, 3];
  v_pickup_offsets   integer[] := ARRAY[-3, -1, 0, 1, 3];
  v_delivery_statuses text[] := ARRAY['sent', 'in_transit', 'sent', 'draft', 'sent'];
  v_pickup_statuses   text[] := ARRAY['in_transit', 'sent', 'sent', 'draft', 'sent'];
  i integer;
  v_note_number text;
  v_scheduled   timestamptz;
BEGIN
  SELECT id INTO v_company_id FROM companies ORDER BY created_at NULLS LAST LIMIT 1;
  IF v_company_id IS NULL THEN
    RETURN;
  END IF;

  SELECT id INTO v_creator FROM profiles
   WHERE company_id = v_company_id AND role = 'company_admin'
   ORDER BY created_at NULLS LAST LIMIT 1;
  IF v_creator IS NULL THEN
    SELECT id INTO v_creator FROM profiles WHERE company_id = v_company_id LIMIT 1;
  END IF;

  SELECT id INTO v_depot_id FROM depots WHERE company_id = v_company_id ORDER BY created_at NULLS LAST LIMIT 1;

  -- 5 delivery demos
  FOR i IN 1..5 LOOP
    v_note_number := 'FD-DEMO-OV-D' || i;
    v_scheduled := v_now + make_interval(days => v_delivery_offsets[i]);
    IF NOT EXISTS (
      SELECT 1 FROM delivery_notes
       WHERE company_id = v_company_id AND note_number = v_note_number
    ) THEN
      INSERT INTO delivery_notes (
        company_id, created_by, note_number, type, status,
        delivery_address, partner_name,
        scheduled_delivery_at, assigned_depot_id, notes
      ) VALUES (
        v_company_id, v_creator, v_note_number, 'delivery', v_delivery_statuses[i],
        'Demo Adresa Dorezimit ' || i || ', Tirane',
        'Demo Klient ' || i,
        v_scheduled, v_depot_id,
        'Demo overdue test: dorezim #' || i
      );
    END IF;
  END LOOP;

  -- 5 pickup demos
  FOR i IN 1..5 LOOP
    v_note_number := 'FM-DEMO-OV-P' || i;
    v_scheduled := v_now + make_interval(days => v_pickup_offsets[i]);
    IF NOT EXISTS (
      SELECT 1 FROM delivery_notes
       WHERE company_id = v_company_id AND note_number = v_note_number
    ) THEN
      INSERT INTO delivery_notes (
        company_id, created_by, note_number, type, status,
        pickup_address, partner_name,
        scheduled_pickup_at, assigned_depot_id, notes
      ) VALUES (
        v_company_id, v_creator, v_note_number, 'pickup', v_pickup_statuses[i],
        'Demo Adresa Marrjes ' || i || ', Durres',
        'Demo Furnitor ' || i,
        v_scheduled, v_depot_id,
        'Demo overdue test: marrje #' || i
      );
    END IF;
  END LOOP;
END $$;
