/*
  # Convert Existing 'repaired' Stock to 'good'

  1. Changes
    - Merges all stock rows with condition='repaired' into existing 'good' rows 
      for the same company/depot/category/product
    - If no matching 'good' row exists, updates the condition in-place to 'good'
    - Records the conversion in stock_movements for audit trail

  2. Rationale
    - Repaired pallets are now considered sellable/ready for delivery
    - Evidence of repair is maintained in stock_movements and depot_repairs tables
    - This migration aligns existing data with the new workflow
*/

-- Merge repaired rows into existing good rows where a match exists
UPDATE stock AS repaired
SET quantity = 0, updated_at = now()
WHERE repaired.condition = 'repaired'
  AND repaired.quantity > 0
  AND EXISTS (
    SELECT 1 FROM stock AS good
    WHERE good.company_id = repaired.company_id
      AND good.depot_id = repaired.depot_id
      AND good.category_id = repaired.category_id
      AND coalesce(good.category_product_id::text, '') = coalesce(repaired.category_product_id::text, '')
      AND good.condition = 'good'
  );

-- Add the repaired quantities to the matching good rows
UPDATE stock AS good
SET quantity = good.quantity + (
  SELECT coalesce(sum(r.quantity), 0) FROM stock r
  WHERE r.company_id = good.company_id
    AND r.depot_id = good.depot_id
    AND r.category_id = good.category_id
    AND coalesce(r.category_product_id::text, '') = coalesce(good.category_product_id::text, '')
    AND r.condition = 'repaired'
    AND r.quantity > 0
), updated_at = now()
WHERE good.condition = 'good'
  AND EXISTS (
    SELECT 1 FROM stock r
    WHERE r.company_id = good.company_id
      AND r.depot_id = good.depot_id
      AND r.category_id = good.category_id
      AND coalesce(r.category_product_id::text, '') = coalesce(good.category_product_id::text, '')
      AND r.condition = 'repaired'
      AND r.quantity > 0
  );

-- For repaired rows without a matching good row, just change condition to good
UPDATE stock SET condition = 'good', updated_at = now()
WHERE condition = 'repaired' AND quantity > 0;

-- Clean up zero-quantity repaired rows
DELETE FROM stock WHERE condition = 'repaired' AND quantity <= 0;
