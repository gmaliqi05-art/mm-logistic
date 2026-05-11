/*
  # Allow drivers to edit trailer loads

  Drivers gain full edit rights on trailer_loads and trailer_load_items within
  their own company, matching the UX where drivers can manage trailers from a
  dedicated page (same capabilities as depot staff).

  1. Changes
    - Add INSERT/UPDATE/DELETE policies on `trailer_loads` for role `driver`.
    - Add INSERT/UPDATE/DELETE policies on `trailer_load_items` for role `driver`.
    - Existing depot staff policies remain untouched.

  2. Security
    - Scope is strictly limited to the driver's own `company_id`.
    - Drivers cannot touch trailers belonging to other companies.
*/

DROP POLICY IF EXISTS "trailer_loads insert by drivers" ON trailer_loads;
CREATE POLICY "trailer_loads insert by drivers"
  ON trailer_loads FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.company_id = trailer_loads.company_id
        AND p.role = 'driver'
    )
  );

DROP POLICY IF EXISTS "trailer_loads update by drivers" ON trailer_loads;
CREATE POLICY "trailer_loads update by drivers"
  ON trailer_loads FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.company_id = trailer_loads.company_id
        AND p.role = 'driver'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.company_id = trailer_loads.company_id
        AND p.role = 'driver'
    )
  );

DROP POLICY IF EXISTS "trailer_loads delete by drivers" ON trailer_loads;
CREATE POLICY "trailer_loads delete by drivers"
  ON trailer_loads FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.company_id = trailer_loads.company_id
        AND p.role = 'driver'
    )
  );

DROP POLICY IF EXISTS "trailer_load_items insert by drivers" ON trailer_load_items;
CREATE POLICY "trailer_load_items insert by drivers"
  ON trailer_load_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM trailer_loads tl
      JOIN profiles p ON p.id = auth.uid()
      WHERE tl.id = trailer_load_items.trailer_load_id
        AND tl.company_id = p.company_id
        AND p.role = 'driver'
    )
  );

DROP POLICY IF EXISTS "trailer_load_items update by drivers" ON trailer_load_items;
CREATE POLICY "trailer_load_items update by drivers"
  ON trailer_load_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM trailer_loads tl
      JOIN profiles p ON p.id = auth.uid()
      WHERE tl.id = trailer_load_items.trailer_load_id
        AND tl.company_id = p.company_id
        AND p.role = 'driver'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM trailer_loads tl
      JOIN profiles p ON p.id = auth.uid()
      WHERE tl.id = trailer_load_items.trailer_load_id
        AND tl.company_id = p.company_id
        AND p.role = 'driver'
    )
  );

DROP POLICY IF EXISTS "trailer_load_items delete by drivers" ON trailer_load_items;
CREATE POLICY "trailer_load_items delete by drivers"
  ON trailer_load_items FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM trailer_loads tl
      JOIN profiles p ON p.id = auth.uid()
      WHERE tl.id = trailer_load_items.trailer_load_id
        AND tl.company_id = p.company_id
        AND p.role = 'driver'
    )
  );
