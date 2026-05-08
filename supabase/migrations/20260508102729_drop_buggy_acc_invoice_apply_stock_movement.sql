/*
  # Drop broken acc_invoice_apply_stock_movement trigger

  1. Reason
    - The trigger matched stock rows by `category_id` only (ignoring
      `category_product_id`), which caused it to either decrement the
      wrong stock row or a zero-qty row, masking real stock state.
    - Double-write risk: the logistic `delivery_notes` confirmation flow
      (`process_delivery_note_stock` + `trg_stock_sync_acc_product`) is
      now the single source of truth for physical stock movement.

  2. Architectural decision
    - Physical stock (the `stock` table and the derived
      `acc_products.current_stock`) moves ONLY when a `delivery_notes`
      row transitions to `confirmed`. Invoices going `sent` no longer
      touch physical stock — the invoice can be sent while goods remain
      in the depot.

  3. Changes
    - DROP TRIGGER `trg_acc_invoice_apply_stock` on `acc_invoices`
      (this is the trigger wired to `acc_invoice_apply_stock_movement`).
    - DROP FUNCTION `acc_invoice_apply_stock_movement()`.
    - Leaves `acc_handle_invoice_stock` (which only records
      acc_stock_movements audit rows) in place, but since it no longer
      mutates physical stock it is harmless.
*/

DROP TRIGGER IF EXISTS trg_acc_invoice_apply_stock ON acc_invoices;
DROP TRIGGER IF EXISTS trg_acc_invoice_apply_stock_movement ON acc_invoices;
DROP FUNCTION IF EXISTS public.acc_invoice_apply_stock_movement();
