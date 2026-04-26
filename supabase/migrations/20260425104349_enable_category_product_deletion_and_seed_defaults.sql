/*
  # Enable safe category/product deletion + seed default pallet products

  ## Problem
  Deleting a row from product_categories failed with the foreign key error
  `acc_products_depot_category_id_fkey` on `acc_products`. The same RESTRICT
  behaviour blocked deletes on several other parent rows (delivery_note_items,
  stock_alerts, acc_invoice_items, acc_purchase_items, acc_delivery_note_items,
  acc_stock_movements). The sync trigger only nulled `acc_products.category_id`
  but not `depot_category_id`.

  ## Changes
  1. FK behaviour relaxed to ON DELETE SET NULL / CASCADE so admins and
     accountants can remove a category or product without manually unwinding
     historical references:
     - acc_products.depot_category_id        : SET NULL
     - delivery_note_items.category_id       : SET NULL
     - stock_alerts.category_id              : CASCADE (alerts orphan otherwise)
     - acc_invoice_items.product_id          : SET NULL
     - acc_purchase_items.product_id         : SET NULL
     - acc_delivery_note_items.product_id    : SET NULL
     - acc_stock_movements.product_id        : SET NULL

  2. Trigger `sync_product_category_to_acc()` is updated so that on DELETE it
     also nulls `acc_products.depot_category_id` before removing the mirror
     row in `acc_product_categories`.

  3. Default pallet products are seeded into the three empty categories of the
     demo company (Aenvek, Color Palette, CP) so the admin/accountant has a
     complete starter catalog they can edit, delete or extend.

  ## Security
  No RLS or policy changes; deletion is still permitted only by the existing
  policies on each table. The relaxed FK rules only affect what happens
  to dependent rows once a delete is authorised.
*/

-- 1. Relax foreign keys so deletion is allowed
ALTER TABLE acc_products
  DROP CONSTRAINT IF EXISTS acc_products_depot_category_id_fkey,
  ADD CONSTRAINT acc_products_depot_category_id_fkey
    FOREIGN KEY (depot_category_id) REFERENCES product_categories(id)
    ON DELETE SET NULL;

ALTER TABLE delivery_note_items
  DROP CONSTRAINT IF EXISTS delivery_note_items_category_id_fkey,
  ADD CONSTRAINT delivery_note_items_category_id_fkey
    FOREIGN KEY (category_id) REFERENCES product_categories(id)
    ON DELETE SET NULL;

ALTER TABLE stock_alerts
  DROP CONSTRAINT IF EXISTS stock_alerts_category_id_fkey,
  ADD CONSTRAINT stock_alerts_category_id_fkey
    FOREIGN KEY (category_id) REFERENCES product_categories(id)
    ON DELETE CASCADE;

ALTER TABLE acc_invoice_items
  DROP CONSTRAINT IF EXISTS acc_invoice_items_product_id_fkey,
  ADD CONSTRAINT acc_invoice_items_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES acc_products(id)
    ON DELETE SET NULL;

ALTER TABLE acc_purchase_items
  DROP CONSTRAINT IF EXISTS acc_purchase_items_product_id_fkey,
  ADD CONSTRAINT acc_purchase_items_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES acc_products(id)
    ON DELETE SET NULL;

ALTER TABLE acc_delivery_note_items
  DROP CONSTRAINT IF EXISTS acc_delivery_note_items_product_id_fkey,
  ADD CONSTRAINT acc_delivery_note_items_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES acc_products(id)
    ON DELETE SET NULL;

ALTER TABLE acc_stock_movements
  DROP CONSTRAINT IF EXISTS acc_stock_movements_product_id_fkey,
  ADD CONSTRAINT acc_stock_movements_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES acc_products(id)
    ON DELETE SET NULL;

-- 2. Update product_categories DELETE trigger to also clean depot_category_id
CREATE OR REPLACE FUNCTION sync_product_category_to_acc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE acc_products SET category_id = NULL WHERE category_id = OLD.id;
    UPDATE acc_products SET depot_category_id = NULL WHERE depot_category_id = OLD.id;
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

-- 3. Seed default pallet products into empty categories (per company)
DO $$
DECLARE
  v_company uuid;
  v_cat_id uuid;
  v_cat_name text;
BEGIN
  FOR v_company, v_cat_id, v_cat_name IN
    SELECT pc.company_id, pc.id, pc.name
    FROM product_categories pc
    LEFT JOIN category_products cp ON cp.category_id = pc.id AND cp.is_active = true
    WHERE pc.name IN ('Aenvek', 'Color Palette', 'CP')
    GROUP BY pc.company_id, pc.id, pc.name
    HAVING COUNT(cp.id) = 0
  LOOP
    IF v_cat_name = 'CP' THEN
      INSERT INTO category_products (company_id, category_id, name, sku, description, unit, price_net, vat_rate, is_active)
      VALUES
        (v_company, v_cat_id, 'CP 1',  'CP-1',  'CP1 Chemiepalette 800x1200',  'pcs', 12.00, 19.00, true),
        (v_company, v_cat_id, 'CP 2',  'CP-2',  'CP2 Chemiepalette 1200x1000', 'pcs', 13.00, 19.00, true),
        (v_company, v_cat_id, 'CP 3',  'CP-3',  'CP3 Chemiepalette 1140x1140', 'pcs', 13.50, 19.00, true),
        (v_company, v_cat_id, 'CP 5',  'CP-5',  'CP5 Chemiepalette 760x1140',  'pcs', 11.00, 19.00, true),
        (v_company, v_cat_id, 'CP 9',  'CP-9',  'CP9 Chemiepalette 1140x1140', 'pcs', 14.00, 19.00, true);
    ELSIF v_cat_name = 'Aenvek' THEN
      INSERT INTO category_products (company_id, category_id, name, sku, description, unit, price_net, vat_rate, is_active)
      VALUES
        (v_company, v_cat_id, 'Einwegpalette 800x1200',  'EW-800',  'Einwegpalette Standard',     'pcs', 7.50, 19.00, true),
        (v_company, v_cat_id, 'Einwegpalette 600x800',   'EW-600',  'Einwegpalette Halbformat',   'pcs', 5.00, 19.00, true),
        (v_company, v_cat_id, 'Einwegpalette 1000x1200', 'EW-1000', 'Einwegpalette Industrieformat', 'pcs', 9.00, 19.00, true);
    ELSIF v_cat_name = 'Color Palette' THEN
      INSERT INTO category_products (company_id, category_id, name, sku, description, unit, price_net, vat_rate, is_active)
      VALUES
        (v_company, v_cat_id, 'Color Palette Standard', 'CLP-STD', 'Color Pallet 1200x1000',  'pcs', 15.00, 19.00, true),
        (v_company, v_cat_id, 'Color Palette EUR',      'CLP-EUR', 'Color Pallet 800x1200',   'pcs', 14.00, 19.00, true);
    END IF;
  END LOOP;
END $$;
