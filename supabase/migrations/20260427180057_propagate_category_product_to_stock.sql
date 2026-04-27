/*
  # Propagate category_product_id through stock flows

  ## Pershkrim
  Para kesaj ndryshimi, fletedergesat dhe raportet e reparaturave humbnin
  identitetin e produktit specifik (p.sh. "A Klasse" / "EPAL") kur kalonin
  ne tabelen `stock`. Kategoria mbahej, por jo produkti i sakte. Si pasoje,
  raportet e stokut paraqisnin sasi te grumbulluara nen kategori dhe nuk
  shfaqnin ndarjen sipas produktit (A Klasse, B Klasse, C Klasse, etj).

  ## Ndryshimet
  1. `depot_repairs` shton kolonen `category_product_id` (uuid, nullable, FK)
     - Lejon punetorin te zgjedhe produktin specifik gjate logimit te
       reparaturave (p.sh. "A Klasse" brenda "Euro Palette")
     - Indeks i ri per filtrim te shpejte
  2. Funksioni `process_delivery_note_stock()` perditesohet:
     - Lexon `category_product_id` nga `delivery_note_items`
     - E perdor si kriter shtese ne match-imin e stokut ekzistues
     - E shkruan ne `stock` dhe `stock_movements` per te ruajtur identitetin

  ## Siguri
  - Migration eshte additive (nuk fshin asnje kolone, asnje politike RLS)
  - Funksioni mbetet SECURITY DEFINER me search_path te fiksuar
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'depot_repairs' AND column_name = 'category_product_id'
  ) THEN
    ALTER TABLE depot_repairs
      ADD COLUMN category_product_id uuid REFERENCES category_products(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_depot_repairs_category_product
  ON depot_repairs(category_product_id);

CREATE OR REPLACE FUNCTION process_delivery_note_stock()
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
    SELECT category_id, category_product_id, quantity, condition
    FROM delivery_note_items
    WHERE delivery_note_id = NEW.id AND category_id IS NOT NULL AND quantity > 0
  LOOP
    SELECT id, quantity INTO existing_id, existing_qty
    FROM stock
    WHERE company_id = NEW.company_id
      AND depot_id = NEW.assigned_depot_id
      AND category_id = item.category_id
      AND condition = COALESCE(item.condition, 'good')
      AND (
        (item.category_product_id IS NULL AND category_product_id IS NULL)
        OR category_product_id = item.category_product_id
      )
    LIMIT 1;

    IF mv_type = 'entry' THEN
      IF existing_id IS NOT NULL THEN
        UPDATE stock SET quantity = existing_qty + item.quantity, updated_at = now() WHERE id = existing_id;
      ELSE
        INSERT INTO stock (company_id, depot_id, category_id, category_product_id, quantity, condition)
        VALUES (NEW.company_id, NEW.assigned_depot_id, item.category_id, item.category_product_id, item.quantity, COALESCE(item.condition, 'good'));
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
      COALESCE(item.condition, 'good'), COALESCE(item.condition, 'good'),
      'Nga fletedergesa ' || NEW.note_number, performer_id
    );
  END LOOP;

  NEW.stock_posted := true;
  RETURN NEW;
END;
$$;
