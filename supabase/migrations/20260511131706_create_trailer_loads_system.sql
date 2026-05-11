/*
  # Create Trailer Loads System

  ## Purpose
  Adds a logistical module that lets depot workers register physical trailers
  with their plate number, a free-form title (e.g. "Kautex"), and a list of
  items (title/product/quantity). Drivers see these trailers on their dashboard
  and can claim one atomically. Depot workers can pre-assign a trailer to a
  specific driver; if so that driver receives a notification. This has NO
  impact on stock or stock movements.

  ## New Tables
  - `trailer_loads`
      - `id` uuid PK
      - `company_id` uuid FK companies (tenant scope)
      - `depot_id` uuid FK depots (optional)
      - `plate_number` text (e.g. "LO-QK 3004")
      - `title` text (free-form, e.g. "Kautex")
      - `notes` text
      - `status` text CHECK in (available|claimed|dispatched|cancelled)
      - `assigned_driver_id` uuid FK profiles (optional pre-assignment)
      - `claimed_by_driver_id` uuid FK profiles (driver who claimed)
      - `claimed_at` timestamptz
      - `created_by` uuid FK profiles
      - `created_at`, `updated_at` timestamptz
  - `trailer_load_items`
      - `id` uuid PK
      - `trailer_load_id` uuid FK trailer_loads cascade
      - `product_title` text (e.g. "Black")
      - `category_product_id` uuid FK category_products (optional)
      - `product_name` text (resolved name for display)
      - `quantity` integer >= 0
      - `position` integer (row order)
      - `created_at` timestamptz

  ## RPC
  - `claim_trailer_load(load_id uuid)` — atomic claim; validates driver belongs
    to the company and row is available or pre-assigned to the caller.

  ## Security (RLS)
  - Enabled on both tables.
  - Company admins + depot workers in same company: full CRUD.
  - Drivers in same company: SELECT where status='available' OR driver is
    assigned/claimed; UPDATE limited to claim via RPC (no direct UPDATE policy
    for drivers).

  ## Notes
  1. Does NOT touch stock, stock_movements, or accounting tables.
  2. Realtime-friendly (simple rows, no recursive triggers).
*/

CREATE TABLE IF NOT EXISTS trailer_loads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  depot_id uuid REFERENCES depots(id) ON DELETE SET NULL,
  plate_number text NOT NULL,
  title text NOT NULL DEFAULT '',
  notes text DEFAULT '',
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available','claimed','dispatched','cancelled')),
  assigned_driver_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  claimed_by_driver_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  claimed_at timestamptz,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trailer_loads_company_status ON trailer_loads(company_id, status);
CREATE INDEX IF NOT EXISTS idx_trailer_loads_assigned_driver ON trailer_loads(assigned_driver_id);
CREATE INDEX IF NOT EXISTS idx_trailer_loads_claimed_driver ON trailer_loads(claimed_by_driver_id);
CREATE INDEX IF NOT EXISTS idx_trailer_loads_created_at ON trailer_loads(created_at DESC);

CREATE TABLE IF NOT EXISTS trailer_load_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trailer_load_id uuid NOT NULL REFERENCES trailer_loads(id) ON DELETE CASCADE,
  product_title text NOT NULL DEFAULT '',
  category_product_id uuid REFERENCES category_products(id) ON DELETE SET NULL,
  product_name text DEFAULT '',
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trailer_load_items_load ON trailer_load_items(trailer_load_id, position);

ALTER TABLE trailer_loads ENABLE ROW LEVEL SECURITY;
ALTER TABLE trailer_load_items ENABLE ROW LEVEL SECURITY;

-- trailer_loads policies
DROP POLICY IF EXISTS "trailer_loads select by company members" ON trailer_loads;
CREATE POLICY "trailer_loads select by company members"
  ON trailer_loads FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.company_id = trailer_loads.company_id
        AND (
          p.role IN ('company_admin','depot_worker','logistics_admin')
          OR (
            p.role = 'driver' AND (
              trailer_loads.status = 'available'
              OR trailer_loads.assigned_driver_id = auth.uid()
              OR trailer_loads.claimed_by_driver_id = auth.uid()
            )
          )
        )
    )
  );

DROP POLICY IF EXISTS "trailer_loads insert by depot staff" ON trailer_loads;
CREATE POLICY "trailer_loads insert by depot staff"
  ON trailer_loads FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.company_id = trailer_loads.company_id
        AND p.role IN ('company_admin','depot_worker','logistics_admin')
    )
  );

DROP POLICY IF EXISTS "trailer_loads update by depot staff" ON trailer_loads;
CREATE POLICY "trailer_loads update by depot staff"
  ON trailer_loads FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.company_id = trailer_loads.company_id
        AND p.role IN ('company_admin','depot_worker','logistics_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.company_id = trailer_loads.company_id
        AND p.role IN ('company_admin','depot_worker','logistics_admin')
    )
  );

DROP POLICY IF EXISTS "trailer_loads delete by depot staff" ON trailer_loads;
CREATE POLICY "trailer_loads delete by depot staff"
  ON trailer_loads FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.company_id = trailer_loads.company_id
        AND p.role IN ('company_admin','depot_worker','logistics_admin')
    )
  );

-- trailer_load_items policies (inherit access via parent row)
DROP POLICY IF EXISTS "trailer_load_items select via parent" ON trailer_load_items;
CREATE POLICY "trailer_load_items select via parent"
  ON trailer_load_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM trailer_loads tl
      JOIN profiles p ON p.id = auth.uid()
      WHERE tl.id = trailer_load_items.trailer_load_id
        AND tl.company_id = p.company_id
        AND (
          p.role IN ('company_admin','depot_worker','logistics_admin')
          OR (
            p.role = 'driver' AND (
              tl.status = 'available'
              OR tl.assigned_driver_id = auth.uid()
              OR tl.claimed_by_driver_id = auth.uid()
            )
          )
        )
    )
  );

DROP POLICY IF EXISTS "trailer_load_items insert by depot staff" ON trailer_load_items;
CREATE POLICY "trailer_load_items insert by depot staff"
  ON trailer_load_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM trailer_loads tl
      JOIN profiles p ON p.id = auth.uid()
      WHERE tl.id = trailer_load_items.trailer_load_id
        AND tl.company_id = p.company_id
        AND p.role IN ('company_admin','depot_worker','logistics_admin')
    )
  );

DROP POLICY IF EXISTS "trailer_load_items update by depot staff" ON trailer_load_items;
CREATE POLICY "trailer_load_items update by depot staff"
  ON trailer_load_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM trailer_loads tl
      JOIN profiles p ON p.id = auth.uid()
      WHERE tl.id = trailer_load_items.trailer_load_id
        AND tl.company_id = p.company_id
        AND p.role IN ('company_admin','depot_worker','logistics_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM trailer_loads tl
      JOIN profiles p ON p.id = auth.uid()
      WHERE tl.id = trailer_load_items.trailer_load_id
        AND tl.company_id = p.company_id
        AND p.role IN ('company_admin','depot_worker','logistics_admin')
    )
  );

DROP POLICY IF EXISTS "trailer_load_items delete by depot staff" ON trailer_load_items;
CREATE POLICY "trailer_load_items delete by depot staff"
  ON trailer_load_items FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM trailer_loads tl
      JOIN profiles p ON p.id = auth.uid()
      WHERE tl.id = trailer_load_items.trailer_load_id
        AND tl.company_id = p.company_id
        AND p.role IN ('company_admin','depot_worker','logistics_admin')
    )
  );

-- Atomic claim RPC
CREATE OR REPLACE FUNCTION claim_trailer_load(load_id uuid)
RETURNS trailer_loads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_company uuid;
  caller_role text;
  result trailer_loads;
BEGIN
  SELECT company_id, role INTO caller_company, caller_role
  FROM profiles WHERE id = auth.uid();

  IF caller_role <> 'driver' THEN
    RAISE EXCEPTION 'Only drivers can claim trailer loads';
  END IF;

  UPDATE trailer_loads
  SET claimed_by_driver_id = auth.uid(),
      claimed_at = now(),
      status = 'claimed',
      updated_at = now()
  WHERE id = load_id
    AND company_id = caller_company
    AND status = 'available'
    AND (assigned_driver_id IS NULL OR assigned_driver_id = auth.uid())
  RETURNING * INTO result;

  IF result IS NULL THEN
    RAISE EXCEPTION 'Trailer load is no longer available';
  END IF;

  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION claim_trailer_load(uuid) FROM public;
GRANT EXECUTE ON FUNCTION claim_trailer_load(uuid) TO authenticated;

-- Update updated_at trigger
CREATE OR REPLACE FUNCTION trailer_loads_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_trailer_loads_touch ON trailer_loads;
CREATE TRIGGER trg_trailer_loads_touch
  BEFORE UPDATE ON trailer_loads
  FOR EACH ROW
  EXECUTE FUNCTION trailer_loads_touch_updated_at();
