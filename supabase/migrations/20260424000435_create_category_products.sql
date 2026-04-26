/*
  # Create category-linked products catalog

  Adds a new `category_products` table so companies can manage concrete
  products (e.g. "A Kualitet") under each pallet category (e.g. "Euro Palette").
  This is the catalog used across the depot, repair-worker reporting, and
  delivery/shipment forms. It is intentionally separate from `acc_products`
  (accounting catalog) because depot operations use `product_categories`.

  1. New tables
    - category_products
      - id uuid PK
      - company_id uuid (FK companies ON DELETE CASCADE) — scope
      - category_id uuid (FK product_categories ON DELETE CASCADE) — owner
      - name text — product label (e.g. "A Kualitet")
      - description text — optional notes
      - is_active boolean — soft disable
      - created_at timestamptz
      - updated_at timestamptz

  2. Security
    - RLS enabled
    - SELECT: any authenticated user of the same company
    - INSERT/UPDATE/DELETE: only company_admin or accountant of same company
*/

CREATE TABLE IF NOT EXISTS category_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES product_categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_category_products_company ON category_products(company_id);
CREATE INDEX IF NOT EXISTS idx_category_products_category ON category_products(category_id);

ALTER TABLE category_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company users can view category products" ON category_products;
CREATE POLICY "Company users can view category products"
  ON category_products FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Admins can insert category products" ON category_products;
CREATE POLICY "Admins can insert category products"
  ON category_products FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('company_admin', 'accountant')
    )
  );

DROP POLICY IF EXISTS "Admins can update category products" ON category_products;
CREATE POLICY "Admins can update category products"
  ON category_products FOR UPDATE
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('company_admin', 'accountant')
    )
  )
  WITH CHECK (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Admins can delete category products" ON category_products;
CREATE POLICY "Admins can delete category products"
  ON category_products FOR DELETE
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('company_admin', 'accountant')
    )
  );
