/*
  # Add show_in_repair flag to product_categories

  Adds a per-category toggle so depot workers can hide categories that
  are not relevant for the repair process from the "Procesi i Reparimit"
  product picker, without affecting other features.

  1. Modified tables
    - `product_categories`
      - new column `show_in_repair` (boolean, default true)

  2. Security
    - Adds policy `categories_update_show_in_repair` allowing depot
      workers to toggle this flag for their company. Existing admin
      update policy remains for full edits.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_categories' AND column_name = 'show_in_repair'
  ) THEN
    ALTER TABLE product_categories ADD COLUMN show_in_repair boolean NOT NULL DEFAULT true;
  END IF;
END $$;

DROP POLICY IF EXISTS "categories_update_show_in_repair" ON product_categories;
CREATE POLICY "categories_update_show_in_repair"
  ON product_categories FOR UPDATE
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('depot_worker', 'company_admin', 'super_admin', 'accountant')
  )
  WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );
