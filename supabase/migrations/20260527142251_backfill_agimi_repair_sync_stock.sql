/*
  # Backfill: Sync Agimi's unsynced repair (15 Klasse A) with stock

  1. Changes
    - Deducts 15 from damaged stock row (category-level Euro Paletten, id 19beec44...)
    - Adds 15 to good stock for Klasse A product (a7fe5f97...)
    - Creates stock_movements for audit trail
    - Marks the depot_repairs row as stock_synced = true with correct category_product_id

  2. Important Notes
    - This is a one-time data fix for repair b43b3674... which was logged
      via the quick-batch UI without stock synchronization
    - The damaged stock row has 257 units, so deducting 15 is safe
*/

DO $$
DECLARE
  v_company   uuid := '406a195e-5dd7-4ff6-881c-76b051256e71';
  v_depot     uuid := '6110a849-b3c3-48dc-bf2e-4db5ef0c8136';
  v_category  uuid := 'a51719b5-3e2a-4d39-999b-3530f0c8ed5b';
  v_damaged_stock uuid := '19beec44-517d-49e6-9f60-c7f12f82f4a9';
  v_target_product uuid := 'a7fe5f97-6fbd-4725-b5f1-079a557ee75b';
  v_repair    uuid := 'b43b3674-d9d4-4b94-8a24-ffeb9801687c';
  v_qty       integer := 15;
  v_good_id   uuid;
BEGIN
  -- 1. Deduct from damaged stock
  UPDATE stock SET quantity = quantity - v_qty, updated_at = now()
  WHERE id = v_damaged_stock AND quantity >= v_qty;

  -- 2. Add to good stock (Klasse A)
  SELECT id INTO v_good_id FROM stock
  WHERE company_id = v_company
    AND depot_id = v_depot
    AND category_id = v_category
    AND category_product_id = v_target_product
    AND condition = 'good'
  LIMIT 1;

  IF v_good_id IS NULL THEN
    INSERT INTO stock (company_id, depot_id, category_id, category_product_id, condition, quantity, updated_at, created_at)
    VALUES (v_company, v_depot, v_category, v_target_product, 'good', v_qty, now(), now());
  ELSE
    UPDATE stock SET quantity = quantity + v_qty, updated_at = now()
    WHERE id = v_good_id;
  END IF;

  -- 3. Stock movements for audit trail
  INSERT INTO stock_movements (company_id, depot_id, category_id, category_product_id, movement_type, quantity, condition_before, condition_after, notes, created_at)
  VALUES (v_company, v_depot, v_category, NULL, 'repair', v_qty, 'damaged', 'good', 'Backfill: Reparim Agimi 15 Klasse A (sync)', now());

  INSERT INTO stock_movements (company_id, depot_id, category_id, category_product_id, movement_type, quantity, condition_before, condition_after, notes, created_at)
  VALUES (v_company, v_depot, v_category, v_target_product, 'repair', v_qty, 'damaged', 'good', 'Backfill: Palet te reparuara -> Klasse A (te mira)', now());

  -- 4. Mark repair as synced with correct product
  UPDATE depot_repairs
  SET stock_synced = true,
      category_product_id = v_target_product
  WHERE id = v_repair;
END $$;
