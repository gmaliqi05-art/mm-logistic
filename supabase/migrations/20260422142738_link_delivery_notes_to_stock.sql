/*
  # Lidhja automatike e fletedergesave me stokun

  ## Pershkrim
  Kjo migracion shton lidhjen qe mungonte midis fletedergesave (delivery_notes)
  dhe levizjeve te stokut (stock_movements / stock). Kur nje fletedergese kalon
  ne statusin "delivered" (ose "confirmed") per here te pare, sistemi automatikisht
  krijon levizjet perkatese dhe perditeson sasite e stokut ne depon e caktuar.

  Logjika:
  1. type = 'delivery' (dergese dalse) => stoku i depos zbritet (movement_type='exit')
  2. type = 'pickup' (marrje hyrese) => stoku i depos shtohet (movement_type='entry')
  3. Nese fletedergesa nuk ka depo te caktuar, nuk ndikon ne stok.

  ## Ndryshime
  1. Shtohet `delivery_notes.stock_posted` (boolean) - flamur per idempotence
  2. Funksioni `process_delivery_note_stock()` - perpunon levizjet
  3. Trigger `trg_delivery_note_stock` - thirret pas UPDATE te statusit

  ## Siguri
  - SECURITY DEFINER per te anashkaluar RLS ne perditesimin e sistemit
  - search_path i fiksuar per siguri
  - Verifikon gjendjen para zbritjeve (shmang sasi negative)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'delivery_notes' AND column_name = 'stock_posted'
  ) THEN
    ALTER TABLE delivery_notes ADD COLUMN stock_posted boolean DEFAULT false;
  END IF;
END $$;

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
    SELECT category_id, quantity, condition
    FROM delivery_note_items
    WHERE delivery_note_id = NEW.id AND category_id IS NOT NULL AND quantity > 0
  LOOP
    SELECT id, quantity INTO existing_id, existing_qty
    FROM stock
    WHERE company_id = NEW.company_id
      AND depot_id = NEW.assigned_depot_id
      AND category_id = item.category_id
      AND condition = COALESCE(item.condition, 'good')
    LIMIT 1;

    IF mv_type = 'entry' THEN
      IF existing_id IS NOT NULL THEN
        UPDATE stock SET quantity = existing_qty + item.quantity, updated_at = now() WHERE id = existing_id;
      ELSE
        INSERT INTO stock (company_id, depot_id, category_id, quantity, condition)
        VALUES (NEW.company_id, NEW.assigned_depot_id, item.category_id, item.quantity, COALESCE(item.condition, 'good'));
      END IF;
    ELSE
      IF existing_id IS NOT NULL THEN
        UPDATE stock SET quantity = GREATEST(0, existing_qty - item.quantity), updated_at = now() WHERE id = existing_id;
      END IF;
    END IF;

    INSERT INTO stock_movements (
      company_id, depot_id, category_id, movement_type, quantity,
      condition_before, condition_after, notes, performed_by
    ) VALUES (
      NEW.company_id, NEW.assigned_depot_id, item.category_id, mv_type, item.quantity,
      COALESCE(item.condition, 'good'), COALESCE(item.condition, 'good'),
      'Nga fletedergesa ' || NEW.note_number, performer_id
    );
  END LOOP;

  NEW.stock_posted := true;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_delivery_note_stock ON delivery_notes;
CREATE TRIGGER trg_delivery_note_stock
  BEFORE UPDATE OF status ON delivery_notes
  FOR EACH ROW
  WHEN (NEW.status IN ('delivered', 'confirmed') AND (OLD.status IS DISTINCT FROM NEW.status OR OLD.stock_posted IS DISTINCT FROM NEW.stock_posted))
  EXECUTE FUNCTION process_delivery_note_stock();
