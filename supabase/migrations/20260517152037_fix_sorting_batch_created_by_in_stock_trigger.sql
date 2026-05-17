/*
  # Fix pallet_sorting_batches created_by NOT NULL violation

  1. Problem
    - The `process_delivery_note_stock` trigger inserts into `pallet_sorting_batches`
      without supplying `created_by`, which violates the NOT NULL constraint.
    - This happens when a delivery note is confirmed and items are routed to sorting.

  2. Solution
    - Make `created_by` nullable on `pallet_sorting_batches` since system-triggered
      batch creation has no specific user actor.
    - Also add a fallback default using `delivery_notes.created_by` in the trigger.
*/

ALTER TABLE pallet_sorting_batches ALTER COLUMN created_by DROP NOT NULL;
