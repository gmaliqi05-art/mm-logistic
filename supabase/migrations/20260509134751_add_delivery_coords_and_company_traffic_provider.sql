/*
  # Delivery destination coordinates + per-company traffic provider

  1. Changes
    - `delivery_notes`: add `delivery_lat`, `delivery_lng` (double precision, nullable) for exact destination pin.
    - `companies`: add `traffic_provider` (text, default 'none') and `traffic_api_key` (text, nullable) for per-company TomTom/HERE toggles.

  2. Security
    - No new tables; existing RLS on companies/delivery_notes continues to govern access.
    - `traffic_api_key` is only updated by company_admin or super_admin through existing update policies.

  3. Notes
    - Valid traffic_provider values: 'none', 'tomtom'. Additional providers (here, google) can be added later without schema change.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='delivery_notes' AND column_name='delivery_lat'
  ) THEN
    ALTER TABLE public.delivery_notes ADD COLUMN delivery_lat double precision;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='delivery_notes' AND column_name='delivery_lng'
  ) THEN
    ALTER TABLE public.delivery_notes ADD COLUMN delivery_lng double precision;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='companies' AND column_name='traffic_provider'
  ) THEN
    ALTER TABLE public.companies ADD COLUMN traffic_provider text NOT NULL DEFAULT 'none'
      CHECK (traffic_provider IN ('none','tomtom'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='companies' AND column_name='traffic_api_key'
  ) THEN
    ALTER TABLE public.companies ADD COLUMN traffic_api_key text;
  END IF;
END $$;
