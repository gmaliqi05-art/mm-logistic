/*
  # Driver auto-tracking toggle and shift start hour

  1. Profile columns
     - `auto_tracking_enabled` (boolean, default false) - driver opts-in to auto-start tracking.
     - `shift_start_hour` (smallint, default 7) - auto-start time in the driver's local timezone.

  2. Notes
     - When auto-tracking is enabled, the client activates the GPS watch at `shift_start_hour` each day.
     - `shift_end_hour` already controls the evening check-in prompt.

  3. Security
     - Existing RLS on profiles is unchanged; drivers update their own row.
*/

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='auto_tracking_enabled') THEN
    ALTER TABLE profiles ADD COLUMN auto_tracking_enabled boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='shift_start_hour') THEN
    ALTER TABLE profiles ADD COLUMN shift_start_hour smallint DEFAULT 7;
  END IF;
END $$;
