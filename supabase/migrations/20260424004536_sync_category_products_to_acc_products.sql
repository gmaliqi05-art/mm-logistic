/*
  # Unify company catalog with accounting products

  Companies create their products under "Kategorit" (table `category_products`).
  The accounting invoice picker queries `acc_products`. To make the same
  catalog appear in invoices/purchases, this migration:

  1. Modified tables
    - category_products: adds optional pricing columns
      - price_net numeric default 0
      - vat_rate numeric default 19 (allowed: 0, 7, 19)
      - unit text default 'pcs'
      - sku text default ''

  2. New objects
    - function `sync_category_product_to_acc()` mirrors a category_products
      row into acc_products using the same id, so invoice/purchase product
      pickers show the company-managed catalog.
    - trigger on category_products for INSERT / UPDATE / DELETE.

  3. Important notes
    - On DELETE the synced acc_products row is soft-deleted (is_active=false)
      so historical invoice line items keep their FK reference.
    - Existing category_products rows are backfilled at the end.
    - acc_products.category_id is left NULL because it points to
      `acc_product_categories`, a separate accounting taxonomy.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='category_products' AND column_name='price_net') THEN
    ALTER TABLE category_products ADD COLUMN price_net numeric(12,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='category_products' AND column_name='vat_rate') THEN
    ALTER TABLE category_products ADD COLUMN vat_rate numeric(5,2) DEFAULT 19.00;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='category_products' AND column_name='unit') THEN
    ALTER TABLE category_products ADD COLUMN unit text DEFAULT 'pcs';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='category_products' AND column_name='sku') THEN
    ALTER TABLE category_products ADD COLUMN sku text DEFAULT '';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION sync_category_product_to_acc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  safe_unit text;
  safe_vat numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE acc_products SET is_active = false, updated_at = now()
      WHERE id = OLD.id;
    RETURN OLD;
  END IF;

  safe_unit := COALESCE(NEW.unit, 'pcs');
  IF safe_unit NOT IN ('pcs', 'kg', 'liter', 'hour', 'meter', 'package', 'set') THEN
    safe_unit := 'pcs';
  END IF;

  safe_vat := COALESCE(NEW.vat_rate, 19.00);
  IF safe_vat NOT IN (0.00, 7.00, 19.00) THEN
    safe_vat := 19.00;
  END IF;

  INSERT INTO acc_products (
    id, company_id, name, description, sku, unit, price_net, vat_rate,
    category_id, is_active, created_at, updated_at
  ) VALUES (
    NEW.id, NEW.company_id, NEW.name, COALESCE(NEW.description, ''), COALESCE(NEW.sku, ''),
    safe_unit, COALESCE(NEW.price_net, 0), safe_vat,
    NULL, COALESCE(NEW.is_active, true), now(), now()
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    sku = EXCLUDED.sku,
    unit = EXCLUDED.unit,
    price_net = EXCLUDED.price_net,
    vat_rate = EXCLUDED.vat_rate,
    is_active = EXCLUDED.is_active,
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_category_product_to_acc ON category_products;
CREATE TRIGGER trg_sync_category_product_to_acc
AFTER INSERT OR UPDATE OR DELETE ON category_products
FOR EACH ROW EXECUTE FUNCTION sync_category_product_to_acc();

INSERT INTO acc_products (
  id, company_id, name, description, sku, unit, price_net, vat_rate,
  category_id, is_active, created_at, updated_at
)
SELECT
  cp.id, cp.company_id, cp.name, COALESCE(cp.description, ''), COALESCE(cp.sku, ''),
  CASE WHEN COALESCE(cp.unit, 'pcs') IN ('pcs','kg','liter','hour','meter','package','set') THEN cp.unit ELSE 'pcs' END,
  COALESCE(cp.price_net, 0),
  CASE WHEN COALESCE(cp.vat_rate, 19.00) IN (0.00, 7.00, 19.00) THEN cp.vat_rate ELSE 19.00 END,
  NULL,
  COALESCE(cp.is_active, true),
  now(), now()
FROM category_products cp
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  updated_at = now();
