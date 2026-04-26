/*
  # Unify product/category catalog and subscription-aware cross-module sync

  Cleans up demo placeholder products, merges duplicate category EuroPalette
  into Euro Paletten, backfills depot_category_id on accounting products and
  introduces subscription-aware triggers so depot stock is only touched when
  the company has an active logistics subscription. See plan for full detail.
*/

-- 1. Null demo product references everywhere they may live
DO $$
DECLARE
  v_demo_ids uuid[] := ARRAY[
    'aa22dc27-471d-4e3c-bc36-4d70e1b9d54b'::uuid,
    'e91775c2-3034-4d28-b561-1dc836843bf1'::uuid,
    'b21936b5-1c34-4e2b-85d9-4b5afc09c3f0'::uuid,
    'b979f17a-9c24-48ca-a9f0-13db7e1630f0'::uuid,
    'c8eb5c8b-866e-4b3c-bfba-23fe9d32a367'::uuid,
    'bec86ff8-0ddb-437e-b672-53d7970ed606'::uuid,
    '52c3de6c-3702-4282-a439-46e1181a03b6'::uuid
  ];
BEGIN
  UPDATE acc_invoice_items SET product_id = NULL WHERE product_id = ANY(v_demo_ids);
  UPDATE acc_delivery_note_items SET product_id = NULL WHERE product_id = ANY(v_demo_ids);
  UPDATE delivery_note_items SET product_id = NULL WHERE product_id = ANY(v_demo_ids);
  UPDATE delivery_note_items SET category_product_id = NULL WHERE category_product_id = ANY(v_demo_ids);
  DELETE FROM category_products WHERE id = ANY(v_demo_ids);
  DELETE FROM acc_products WHERE id = ANY(v_demo_ids);
END $$;

-- 2. Merge category EuroPalette -> Euro Paletten
DO $$
DECLARE
  v_old uuid := '553d4aa5-bacb-4afb-b480-4b7871a6840e';
  v_new uuid := 'a51719b5-3e2a-4d39-999b-3530f0c8ed5b';
  v_other_old uuid;
BEGIN
  UPDATE delivery_note_items SET category_id = v_new WHERE category_id = v_old;
  UPDATE acc_products SET category_id = v_new WHERE category_id = v_old;
  UPDATE category_products SET category_id = v_new WHERE category_id = v_old;
  UPDATE stock_movements SET category_id = v_new WHERE category_id = v_old;
  UPDATE stock_alerts SET category_id = v_new WHERE category_id = v_old;

  FOR v_other_old IN SELECT id FROM stock WHERE category_id = v_old LOOP
    DECLARE
      v_existing uuid;
      v_old_row RECORD;
    BEGIN
      SELECT * INTO v_old_row FROM stock WHERE id = v_other_old;
      SELECT id INTO v_existing
      FROM stock
      WHERE company_id = v_old_row.company_id
        AND depot_id = v_old_row.depot_id
        AND category_id = v_new
        AND condition = v_old_row.condition
      LIMIT 1;

      IF v_existing IS NOT NULL THEN
        UPDATE stock
        SET quantity = quantity + v_old_row.quantity, updated_at = now()
        WHERE id = v_existing;
        DELETE FROM stock WHERE id = v_other_old;
      ELSE
        UPDATE stock SET category_id = v_new, updated_at = now() WHERE id = v_other_old;
      END IF;
    END;
  END LOOP;

  DELETE FROM product_categories WHERE id = v_old;
END $$;

-- 3. Backfill depot_category_id on accounting products
UPDATE acc_products
SET depot_category_id = category_id, updated_at = now()
WHERE depot_category_id IS NULL AND category_id IS NOT NULL;

-- 4. Subscription helpers
CREATE OR REPLACE FUNCTION public.company_has_logistics(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM company_subscriptions cs
    JOIN subscription_plans sp ON sp.id = cs.plan_id
    WHERE cs.company_id = p_company_id
      AND cs.status IN ('trial','active')
      AND sp.product_type = 'logistics'
  );
$$;

CREATE OR REPLACE FUNCTION public.company_has_accounting(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM company_subscriptions cs
    JOIN subscription_plans sp ON sp.id = cs.plan_id
    WHERE cs.company_id = p_company_id
      AND cs.status IN ('trial','active')
      AND sp.product_type = 'accounting'
  );
$$;

-- 5. Stock-decrement trigger gated by subscription
CREATE OR REPLACE FUNCTION public.acc_invoice_apply_stock_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  it RECORD;
  v_cat uuid;
  v_stock_id uuid;
  v_qty integer;
BEGIN
  IF NEW.source_depot_id IS NULL THEN RETURN NEW; END IF;
  IF NOT company_has_logistics(NEW.company_id) THEN RETURN NEW; END IF;

  IF (TG_OP = 'UPDATE')
    AND COALESCE(OLD.status,'') <> 'sent'
    AND NEW.status = 'sent' THEN

    FOR it IN
      SELECT ii.product_id, ii.quantity, p.depot_category_id
      FROM acc_invoice_items ii
      LEFT JOIN acc_products p ON p.id = ii.product_id
      WHERE ii.invoice_id = NEW.id
    LOOP
      v_cat := it.depot_category_id;
      v_qty := COALESCE(it.quantity, 0)::integer;
      IF v_cat IS NULL OR v_qty <= 0 THEN CONTINUE; END IF;

      INSERT INTO stock_movements(
        company_id, depot_id, category_id, movement_type, quantity,
        condition_before, condition_after, notes, performed_by
      ) VALUES (
        NEW.company_id, NEW.source_depot_id, v_cat, 'exit', v_qty,
        'good', 'good',
        'Auto: shitje fature ' || COALESCE(NEW.invoice_number,''),
        COALESCE(NEW.dispatched_by, NEW.created_by)
      );

      SELECT id INTO v_stock_id
      FROM stock
      WHERE company_id = NEW.company_id
        AND depot_id = NEW.source_depot_id
        AND category_id = v_cat
        AND condition = 'good'
      LIMIT 1;

      IF v_stock_id IS NOT NULL THEN
        UPDATE stock
        SET quantity = GREATEST(0, quantity - v_qty), updated_at = now()
        WHERE id = v_stock_id;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END $$;

-- 6. Sync trigger: new acc_product -> ensure depot_category_id, seed depot stock row
CREATE OR REPLACE FUNCTION public.acc_products_sync_to_depot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_depot uuid;
BEGIN
  IF NEW.depot_category_id IS NULL AND NEW.category_id IS NOT NULL THEN
    NEW.depot_category_id := NEW.category_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_acc_products_sync_to_depot ON acc_products;
CREATE TRIGGER trg_acc_products_sync_to_depot
  BEFORE INSERT OR UPDATE OF category_id, depot_category_id ON acc_products
  FOR EACH ROW EXECUTE FUNCTION acc_products_sync_to_depot();

CREATE OR REPLACE FUNCTION public.acc_products_seed_stock_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_depot uuid;
BEGIN
  IF NEW.depot_category_id IS NULL THEN RETURN NEW; END IF;
  IF NOT company_has_logistics(NEW.company_id) THEN RETURN NEW; END IF;

  SELECT id INTO v_depot FROM depots
  WHERE company_id = NEW.company_id AND is_active = true
  ORDER BY created_at ASC LIMIT 1;

  IF v_depot IS NOT NULL THEN
    INSERT INTO stock(company_id, depot_id, category_id, condition, quantity)
    SELECT NEW.company_id, v_depot, NEW.depot_category_id, 'good', 0
    WHERE NOT EXISTS (
      SELECT 1 FROM stock
      WHERE company_id = NEW.company_id
        AND depot_id = v_depot
        AND category_id = NEW.depot_category_id
        AND condition = 'good'
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_acc_products_seed_stock_row ON acc_products;
CREATE TRIGGER trg_acc_products_seed_stock_row
  AFTER INSERT ON acc_products
  FOR EACH ROW EXECUTE FUNCTION acc_products_seed_stock_row();

-- 7. Notify accountants when a category_product is created
CREATE OR REPLACE FUNCTION public.category_products_notify_accounting()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
BEGIN
  IF NOT (company_has_logistics(NEW.company_id) AND company_has_accounting(NEW.company_id)) THEN
    RETURN NEW;
  END IF;

  FOR rec IN
    SELECT id FROM profiles
    WHERE company_id = NEW.company_id
      AND role = 'accountant'
      AND is_active = true
  LOOP
    INSERT INTO notifications(user_id, title, message, type, reference_id, data)
    VALUES (
      rec.id,
      'Produkt i ri',
      COALESCE(NEW.name,'Produkt') || ' u shtua ne katalog',
      'system',
      NEW.id::text,
      jsonb_build_object('module','logistics','category_product_id', NEW.id)
    );
  END LOOP;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_category_products_notify_accounting ON category_products;
CREATE TRIGGER trg_category_products_notify_accounting
  AFTER INSERT ON category_products
  FOR EACH ROW EXECUTE FUNCTION category_products_notify_accounting();
