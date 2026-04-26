/*
  # Unify company categories with accounting categories

  The accounting module reads `acc_product_categories`/`acc_products` while
  the rest of the app uses `product_categories`/`category_products`. A
  previous migration mirrors category_products -> acc_products. This
  migration completes the unification by mirroring product_categories ->
  acc_product_categories using the same id, and updates the product sync
  to carry the category link so accounting groupings match.

  1. New objects
    - function `sync_product_category_to_acc()` and trigger on
      `product_categories` (INSERT/UPDATE/DELETE).

  2. Modified objects
    - `sync_category_product_to_acc()` now mirrors `category_id` into
      `acc_products` (acc_product_categories now shares the same ids).

  3. Backfill
    - Existing `product_categories` upserted into `acc_product_categories`.
    - Existing `category_products` re-synced with `category_id`.

  4. Security / safety
    - All functions SECURITY DEFINER with pinned search_path; no policy
      changes. DELETE on `product_categories` sets matching
      `acc_products.category_id` to NULL before removing the mirror, so
      invoice line items referencing products remain intact.
*/

CREATE OR REPLACE FUNCTION sync_product_category_to_acc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE acc_products SET category_id = NULL WHERE category_id = OLD.id;
    DELETE FROM acc_product_categories WHERE id = OLD.id;
    RETURN OLD;
  END IF;

  INSERT INTO acc_product_categories (id, company_id, name, description, sort_order, created_at)
  VALUES (NEW.id, NEW.company_id, NEW.name, COALESCE(NEW.description, ''), 0, now())
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_product_category_to_acc ON product_categories;
CREATE TRIGGER trg_sync_product_category_to_acc
AFTER INSERT OR UPDATE OR DELETE ON product_categories
FOR EACH ROW EXECUTE FUNCTION sync_product_category_to_acc();

INSERT INTO acc_product_categories (id, company_id, name, description, sort_order, created_at)
SELECT id, company_id, name, COALESCE(description, ''), 0, now()
FROM product_categories
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

CREATE OR REPLACE FUNCTION sync_category_product_to_acc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  safe_unit text;
  safe_vat numeric;
  safe_category uuid;
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

  safe_category := NEW.category_id;
  IF safe_category IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM acc_product_categories WHERE id = safe_category
  ) THEN
    safe_category := NULL;
  END IF;

  INSERT INTO acc_products (
    id, company_id, name, description, sku, unit, price_net, vat_rate,
    category_id, is_active, created_at, updated_at
  ) VALUES (
    NEW.id, NEW.company_id, NEW.name, COALESCE(NEW.description, ''), COALESCE(NEW.sku, ''),
    safe_unit, COALESCE(NEW.price_net, 0), safe_vat,
    safe_category, COALESCE(NEW.is_active, true), now(), now()
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    sku = EXCLUDED.sku,
    unit = EXCLUDED.unit,
    price_net = EXCLUDED.price_net,
    vat_rate = EXCLUDED.vat_rate,
    category_id = EXCLUDED.category_id,
    is_active = EXCLUDED.is_active,
    updated_at = now();

  RETURN NEW;
END;
$$;

UPDATE acc_products AS ap
SET category_id = cp.category_id
FROM category_products AS cp
WHERE ap.id = cp.id
  AND cp.category_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM acc_product_categories pc WHERE pc.id = cp.category_id);
