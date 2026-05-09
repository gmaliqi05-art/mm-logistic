/*
  # Add driver base location

  Adds optional base address (home depot / parking) columns on profiles so that
  when a driver has no active delivery destination, the fleet map can still show
  a routing guide back to base.

  1. Changes
    - profiles: add base_address (text), base_lat (double precision), base_lng (double precision)

  2. Notes
    - All columns are nullable; UI must gracefully handle missing values
    - Only the driver themselves can update their own base
    - No new RLS policies needed (inherits existing profiles policies)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'base_address'
  ) THEN
    ALTER TABLE profiles ADD COLUMN base_address text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'base_lat'
  ) THEN
    ALTER TABLE profiles ADD COLUMN base_lat double precision;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'base_lng'
  ) THEN
    ALTER TABLE profiles ADD COLUMN base_lng double precision;
  END IF;
END $$;
