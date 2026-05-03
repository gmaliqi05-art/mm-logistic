/*
  # Lidhja mes Fletmarrjeve → Sortim / Riparim / Stok

  ## Permbledhje
  Ky migration e lidh procesin e krijimit te fletmarrjes/fletedergeses nga kompania
  me tri rrjedhjet e depos: Stok i gatshem, Klasifikim (Sortire), dhe Defekt (per riparim).

  ## Ndryshime ne tabela

  1. `delivery_note_items`
     - Shton kolonen `intended_action` text (default `stock`) me CHECK per
       vlerat `stock`, `sorting`, `repair`. Kjo percakton se ku shkon paleta
       kur fletmarrja mberrin ne depo.
     - Relaksohet CHECK-u i `condition` per te pranuar edhe `sorting` dhe
       `ready_a/b/c` (ne rast se eshte tashme e klasifikuar).

  2. `pallet_sorting_batches`
     - Shton `source_delivery_note_id` (FK -> delivery_notes, SET NULL)
     - Shton `source_item_id` (FK -> delivery_note_items, SET NULL)
     - Shton `reference_number_snapshot` per gjurmueshmeri
     - Index per filtrimin e shpejte

  3. `depot_repairs`
     - Shton `source_delivery_note_id` dhe `source_item_id`

  ## Siguria
  - Pa ndryshime ne RLS ekzistues
  - Te gjitha kolonat e reja kane default, asnje rresht ekzistues nuk preket
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'delivery_note_items' AND column_name = 'intended_action'
  ) THEN
    ALTER TABLE delivery_note_items
      ADD COLUMN intended_action text NOT NULL DEFAULT 'stock';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'delivery_note_items_intended_action_check'
  ) THEN
    ALTER TABLE delivery_note_items
      ADD CONSTRAINT delivery_note_items_intended_action_check
      CHECK (intended_action IN ('stock', 'sorting', 'repair'));
  END IF;
END $$;

-- Allow expanded condition values (old check might not exist, we just add one if missing)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'delivery_note_items_condition_check'
  ) THEN
    ALTER TABLE delivery_note_items DROP CONSTRAINT delivery_note_items_condition_check;
  END IF;
  ALTER TABLE delivery_note_items
    ADD CONSTRAINT delivery_note_items_condition_check
    CHECK (condition IN ('good','damaged','sorting','ready_a','ready_b','ready_c'));
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pallet_sorting_batches' AND column_name = 'source_delivery_note_id'
  ) THEN
    ALTER TABLE pallet_sorting_batches
      ADD COLUMN source_delivery_note_id uuid REFERENCES delivery_notes(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pallet_sorting_batches' AND column_name = 'source_item_id'
  ) THEN
    ALTER TABLE pallet_sorting_batches
      ADD COLUMN source_item_id uuid REFERENCES delivery_note_items(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pallet_sorting_batches' AND column_name = 'reference_number_snapshot'
  ) THEN
    ALTER TABLE pallet_sorting_batches
      ADD COLUMN reference_number_snapshot text DEFAULT '';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pallet_sorting_batches_source_note
  ON pallet_sorting_batches(source_delivery_note_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'depot_repairs' AND column_name = 'source_delivery_note_id'
  ) THEN
    ALTER TABLE depot_repairs
      ADD COLUMN source_delivery_note_id uuid REFERENCES delivery_notes(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'depot_repairs' AND column_name = 'source_item_id'
  ) THEN
    ALTER TABLE depot_repairs
      ADD COLUMN source_item_id uuid REFERENCES delivery_note_items(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_depot_repairs_source_note
  ON depot_repairs(source_delivery_note_id);
