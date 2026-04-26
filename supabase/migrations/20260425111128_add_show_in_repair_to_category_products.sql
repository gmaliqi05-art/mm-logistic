/*
  # Per-product repair visibility

  Adds a per-product flag that controls whether the product appears in
  the depot "Procesi i Reparimit" picker. Allows depot workers to hide
  products that are not relevant for repair (eg. base EPAL while keeping
  EPAL Klasse A/B), independently from category-level visibility.

  1. Modified tables
    - `category_products`
      - new column `show_in_repair` (boolean, default true)

  2. Security
    - New policy `category_products_update_show_in_repair` allows depot
      workers, accountants, company admins and super admins of the same
      company to update this flag.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'category_products' AND column_name = 'show_in_repair'
  ) THEN
    ALTER TABLE category_products ADD COLUMN show_in_repair boolean NOT NULL DEFAULT true;
  END IF;
END $$;

DROP POLICY IF EXISTS "category_products_update_show_in_repair" ON category_products;
CREATE POLICY "category_products_update_show_in_repair"
  ON category_products FOR UPDATE
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid())
        IN ('depot_worker', 'company_admin', 'super_admin', 'accountant')
  )
  WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );
