/*
  # Optional time on delivery note schedule

  Companies want to enter only a date for a delivery/pickup, with the time
  being optional. We keep the existing `scheduled_pickup_at` and
  `scheduled_delivery_at` timestamptz columns (so reports/sorting keep working)
  and add boolean flags that record whether the user actually entered a time.
  When the flag is false the UI hides the time portion in the printed/preview
  delivery note.

  1. Modified tables
    - delivery_notes
      - new column `scheduled_pickup_time_set` boolean default false
      - new column `scheduled_delivery_time_set` boolean default false

  2. Security
    - No RLS changes required.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'delivery_notes' AND column_name = 'scheduled_pickup_time_set'
  ) THEN
    ALTER TABLE delivery_notes ADD COLUMN scheduled_pickup_time_set boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'delivery_notes' AND column_name = 'scheduled_delivery_time_set'
  ) THEN
    ALTER TABLE delivery_notes ADD COLUMN scheduled_delivery_time_set boolean DEFAULT false;
  END IF;
END $$;
