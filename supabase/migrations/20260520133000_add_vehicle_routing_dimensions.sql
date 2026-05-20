-- ============================================================================
-- Vehicle routing dimensions
-- ----------------------------------------------------------------------------
-- The vehicles table already stores max_weight_kg, payload_kg and axles, but
-- it does not capture the physical dimensions and hazardous-goods metadata
-- that a real truck-routing engine needs to keep an HGV off restricted roads
-- and tunnels in Germany / EU (StVZO / ADR / European tunnel categories).
--
-- This migration adds optional columns; existing rows stay valid (defaults
-- are NULL or 0). The TypeScript Vehicle interface is updated in the same PR.
--
-- WHY each column
--   length_mm, width_mm, height_mm: enforced against road / underpass /
--     tunnel limits. 13m length is the standard ceiling for normal HGV in
--     DE; 4m height is the standard underpass clearance.
--   axle_load_kg: many bridges and side roads in DE are weight-restricted
--     by axle load, not total mass. A 7.5 t total truck can still be
--     barred from a road if its single axle exceeds the limit.
--   adr_class: presence of dangerous goods. NULL means the vehicle is not
--     equipped for ADR cargo. Otherwise one of the 9 main ADR classes.
--   tunnel_category: A..E per ADR 1.9.5. Determines which tunnels the
--     vehicle is permitted to use.
--   has_tachograph, tachograph_type: required by Regulation (EU) 165/2014
--     for vehicles >3.5t.
--
-- All columns are optional. Adding them does not block existing flows.
-- ============================================================================

ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS length_mm integer,
  ADD COLUMN IF NOT EXISTS width_mm integer,
  ADD COLUMN IF NOT EXISTS height_mm integer,
  ADD COLUMN IF NOT EXISTS axle_load_kg integer,
  ADD COLUMN IF NOT EXISTS adr_class text,
  ADD COLUMN IF NOT EXISTS tunnel_category text,
  ADD COLUMN IF NOT EXISTS has_tachograph boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS tachograph_type text;

-- Sanity-check ADR class values (NULL = no ADR cargo)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'vehicles_adr_class_check'
  ) THEN
    ALTER TABLE vehicles
      ADD CONSTRAINT vehicles_adr_class_check
      CHECK (
        adr_class IS NULL
        OR adr_class IN (
          'none',
          '1','2','3','4.1','4.2','4.3','5.1','5.2','6.1','6.2','7','8','9'
        )
      );
  END IF;
END $$;

-- Sanity-check ADR tunnel category (NULL = unspecified)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'vehicles_tunnel_category_check'
  ) THEN
    ALTER TABLE vehicles
      ADD CONSTRAINT vehicles_tunnel_category_check
      CHECK (
        tunnel_category IS NULL
        OR tunnel_category IN ('A','B','C','D','E')
      );
  END IF;
END $$;

-- Sanity-check tachograph type (NULL allowed; values match Reg. 165/2014)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'vehicles_tachograph_type_check'
  ) THEN
    ALTER TABLE vehicles
      ADD CONSTRAINT vehicles_tachograph_type_check
      CHECK (
        tachograph_type IS NULL
        OR tachograph_type IN ('analog','digital','smart_v1','smart_v2')
      );
  END IF;
END $$;
