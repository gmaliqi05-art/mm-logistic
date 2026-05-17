/*
  # Fix stock_movements movement_type constraint for sorting completion

  1. Changes
    - Adds 'repair_in' to the allowed values in `stock_movements_movement_type_check`
    - This value is used by the `commit_sorting_batch_to_stock()` trigger when
      damaged items from sorting are routed to repair

  2. Important notes
    - The trigger was inserting 'repair_in' but the constraint did not include it
    - This caused: "new row for relation stock_movements violates check constraint
      stock_movements_movement_type_check"
    - 'repair_in' = item entered repair from sorting (distinct from 'repair' = repair completed)
*/

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_movements_movement_type_check') THEN
    ALTER TABLE public.stock_movements DROP CONSTRAINT stock_movements_movement_type_check;
  END IF;
  ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_movement_type_check
    CHECK (movement_type IN ('entry','exit','repair','scrap','sort_in','sort_commit','transfer_in','transfer_out','custody_in','custody_out','adjust','repair_in'));
END $$;
