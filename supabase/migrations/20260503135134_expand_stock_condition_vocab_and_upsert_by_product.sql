/*
  # Expand stock condition vocabulary & post by product

  ## Summary
  Align the `stock` table and the delivery-note posting trigger with the
  pallet-class and sorting conditions already used by the UI. This removes
  the `stock_condition_check` violation that blocked "Regjistro ne stok"
  when an item was Klasse A/B/C, "Per sortim" or routed to repair.

  ## Changes
  1. Data normalization
     - Any existing `stock.condition` value outside the new allow-list is
       normalised to `good` before relaxing the constraint.
  2. Constraint relaxation
     - `stock_condition_check` now allows: good, damaged, repaired, sorting,
       ready_a, ready_b, ready_c.
  3. Trigger rewrite
     - `process_delivery_note_stock` keys upsert on
       (company_id, depot_id, category_id, category_product_id, condition)
       so each pallet class / product accumulates separately.
     - Item condition is mapped through a safe whitelist before insert.
     - `stock_movements` records `category_product_id` when available.

  ## Security
  - No RLS changes. Trigger remains SECURITY DEFINER with fixed search_path.
*/

UPDATE public.stock
SET condition = 'good'
WHERE condition NOT IN ('good','damaged','repaired','sorting','ready_a','ready_b','ready_c');

ALTER TABLE public.stock DROP CONSTRAINT IF EXISTS stock_condition_check;
ALTER TABLE public.stock
  ADD CONSTRAINT stock_condition_check
  CHECK (condition IN ('good','damaged','repaired','sorting','ready_a','ready_b','ready_c'));

CREATE OR REPLACE FUNCTION public.process_delivery_note_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item RECORD;
  existing_qty integer;
  existing_id uuid;
  mv_type text;
  performer_id uuid;
  eff_condition text;
BEGIN
  IF NEW.status NOT IN ('delivered', 'confirmed') THEN
    RETURN NEW;
  END IF;

  IF NEW.stock_posted = true THEN
    RETURN NEW;
  END IF;

  IF NEW.assigned_depot_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.type = 'delivery' THEN
    mv_type := 'exit';
  ELSE
    mv_type := 'entry';
  END IF;

  performer_id := COALESCE(NEW.assigned_driver_id, NEW.created_by);

  FOR item IN
    SELECT category_id, category_product_id, quantity, condition, intended_action
    FROM delivery_note_items
    WHERE delivery_note_id = NEW.id AND category_id IS NOT NULL AND quantity > 0
  LOOP
    eff_condition := CASE
      WHEN item.intended_action = 'repair' THEN 'damaged'
      WHEN item.intended_action = 'sorting' AND item.condition NOT IN ('ready_a','ready_b','ready_c') THEN 'sorting'
      WHEN item.condition IN ('good','damaged','repaired','sorting','ready_a','ready_b','ready_c') THEN item.condition
      ELSE 'good'
    END;

    SELECT id, quantity INTO existing_id, existing_qty
    FROM stock
    WHERE company_id = NEW.company_id
      AND depot_id = NEW.assigned_depot_id
      AND category_id = item.category_id
      AND COALESCE(category_product_id::text,'') = COALESCE(item.category_product_id::text,'')
      AND condition = eff_condition
    LIMIT 1;

    IF mv_type = 'entry' THEN
      IF existing_id IS NOT NULL THEN
        UPDATE stock SET quantity = existing_qty + item.quantity, updated_at = now() WHERE id = existing_id;
      ELSE
        INSERT INTO stock (company_id, depot_id, category_id, category_product_id, quantity, condition)
        VALUES (NEW.company_id, NEW.assigned_depot_id, item.category_id, item.category_product_id, item.quantity, eff_condition);
      END IF;
    ELSE
      IF existing_id IS NOT NULL THEN
        UPDATE stock SET quantity = GREATEST(0, existing_qty - item.quantity), updated_at = now() WHERE id = existing_id;
      END IF;
    END IF;

    INSERT INTO stock_movements (
      company_id, depot_id, category_id, category_product_id, movement_type, quantity,
      condition_before, condition_after, notes, performed_by
    ) VALUES (
      NEW.company_id, NEW.assigned_depot_id, item.category_id, item.category_product_id, mv_type, item.quantity,
      eff_condition, eff_condition,
      'Nga fletedergesa ' || NEW.note_number, performer_id
    );
  END LOOP;

  NEW.stock_posted := true;
  RETURN NEW;
END;
$$;
