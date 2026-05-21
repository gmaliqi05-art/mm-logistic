/*
  # Stop create_invoice_with_stock_deduction from double-decrementing stock

  When invoicing an existing delivery note, two layers were touching
  operational stock:
    1) the delivery-note `process_delivery_note_stock` trigger, fired
       when the note reaches `confirmed` (the canonical decrement)
    2) the RPC `create_invoice_with_stock_deduction(p_note_id)`, called
       from DeliveryReviewPanel when the user clicks "Invoice this
       delivery"

  Both wrote to `stock.quantity` and `stock_movements`. Result: every
  delivery that got invoiced had its stock deducted twice, driving
  `ready_a` / `ready_b` rows into the negative. The view
  `v_company_stock_breakdown` summed these without clamping, so the
  company dashboard's "Total stock" KPI silently netted negatives.

  This migration:

  1. Replaces `create_invoice_with_stock_deduction` with a version that
     ONLY creates the invoice + items + DN link. Stock deduction stays
     in `process_delivery_note_stock` where it belongs.
  2. Deletes the duplicate "Shitje — Fatura …" stock_movements rows
     (those that share a `delivery_note_id` + `category_product_id` +
     `condition_before` + `movement_type` + `quantity` with a non-"Shitje"
     row from the same delivery — the auto-decrement is the truth).
  3. For each deleted duplicate, adds its quantity back to the matching
     `stock` row so the running balance lines up with the cleaned-up
     movement history.
  4. Floors any still-negative `stock.quantity` to 0 — these are
     orphan negatives (delivery items pulled from a condition bucket
     that had no stock to begin with, e.g. `ready_a` decrements with
     no prior `ready_a` entries). Leaving them negative would corrupt
     dashboards forever; the user can re-register real stock if they
     want a positive balance again.

  No new constraints are added: legitimate `stock.quantity < 0` may
  arise from sorting batches that are re-balanced later in the same
  flow, so a hard CHECK would over-fit.
*/

-- 1. Replace the buggy function -----------------------------------------------

CREATE OR REPLACE FUNCTION public.create_invoice_with_stock_deduction(p_note_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_note           record;
  v_company        record;
  v_user_company   uuid;
  v_invoice_id     uuid;
  v_invoice_number text;
  v_due_date       date;
  v_item           record;
  v_performer      uuid;
BEGIN
  v_performer := auth.uid();
  SELECT company_id INTO v_user_company FROM profiles WHERE id = v_performer;
  IF v_user_company IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_note FROM delivery_notes WHERE id = p_note_id;
  IF v_note IS NULL THEN
    RAISE EXCEPTION 'Delivery note not found';
  END IF;
  IF v_note.company_id <> v_user_company THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF v_note.acc_invoice_id IS NOT NULL THEN
    RETURN v_note.acc_invoice_id;
  END IF;

  SELECT * INTO v_company FROM companies WHERE id = v_user_company;

  BEGIN
    v_invoice_number := get_next_acc_number(v_user_company, coalesce(v_company.invoice_prefix, 'RE'));
  EXCEPTION WHEN others THEN
    v_invoice_number := coalesce(v_company.invoice_prefix, 'RE') || '-' ||
      to_char(now(), 'YYYY') || '-' || lpad((floor(random() * 9999))::text, 4, '0');
  END;

  v_due_date := (current_date + coalesce(v_company.default_payment_terms_days, 14));

  INSERT INTO acc_invoices (
    company_id, created_by, contact_id, invoice_number, invoice_date, due_date,
    status, invoice_type, currency, subtotal, vat_amount, total, notes,
    delivery_note_id, seller_vat_number, payment_terms_days
  ) VALUES (
    v_user_company, v_performer, v_note.partner_id, v_invoice_number, current_date, v_due_date,
    'draft', 'invoice', coalesce(v_company.default_currency, 'EUR'), 0, 0, 0,
    'Fature ne baze te fletedergeses #' || coalesce(v_note.note_number, '-'),
    p_note_id, coalesce(v_company.vat_number, ''), coalesce(v_company.default_payment_terms_days, 14)
  ) RETURNING id INTO v_invoice_id;

  -- Create invoice items from delivery note items. Stock has already been
  -- moved by process_delivery_note_stock when the note was confirmed; we do
  -- NOT touch stock or stock_movements here.
  FOR v_item IN
    SELECT
      dni.quantity,
      dni.notes        AS item_notes,
      dni.category_id,
      dni.category_product_id,
      dni.condition,
      pc.name          AS category_name,
      cp.name          AS product_name,
      cp.sku           AS product_sku,
      cp.price_net,
      cp.vat_rate      AS product_vat_rate,
      cp.unit          AS product_unit
    FROM delivery_note_items dni
    LEFT JOIN product_categories pc ON pc.id = dni.category_id
    LEFT JOIN category_products  cp ON cp.id = dni.category_product_id
    WHERE dni.delivery_note_id = p_note_id
  LOOP
    INSERT INTO acc_invoice_items (
      invoice_id, description, product_code, quantity, unit, unit_price, vat_rate, line_total
    ) VALUES (
      v_invoice_id,
      trim(coalesce(v_item.product_name, v_item.category_name, v_item.item_notes, 'Artikull')),
      coalesce(v_item.product_sku, ''),
      coalesce(v_item.quantity, 0),
      coalesce(v_item.product_unit, 'cope'),
      coalesce(v_item.price_net, 0),
      coalesce(v_item.product_vat_rate, v_company.default_vat_rate, 19),
      coalesce(v_item.quantity, 0) * coalesce(v_item.price_net, 0)
    );
  END LOOP;

  UPDATE acc_invoices SET
    subtotal   = (SELECT coalesce(sum(line_total), 0) FROM acc_invoice_items WHERE invoice_id = v_invoice_id),
    vat_amount = (SELECT coalesce(sum(line_total * vat_rate / 100.0), 0) FROM acc_invoice_items WHERE invoice_id = v_invoice_id),
    total      = (SELECT coalesce(sum(line_total * (1 + vat_rate / 100.0)), 0) FROM acc_invoice_items WHERE invoice_id = v_invoice_id)
  WHERE id = v_invoice_id;

  UPDATE delivery_notes SET acc_invoice_id = v_invoice_id, invoiced_at = now() WHERE id = p_note_id;

  RETURN v_invoice_id;
END;
$$;

-- 2 + 3. Backfill: undo the double-deduct by deleting the "Shitje" duplicates
-- and adding their quantities back to stock.

WITH duplicates AS (
  SELECT
    sm.id          AS dup_id,
    sm.company_id,
    sm.depot_id,
    sm.category_product_id,
    sm.category_id,
    COALESCE(sm.condition_after, sm.condition_before) AS cond,
    sm.quantity
  FROM stock_movements sm
  WHERE sm.notes LIKE 'Shitje — Fatura %'
    AND sm.delivery_note_id IS NOT NULL
    AND sm.movement_type = 'exit'
    AND EXISTS (
      SELECT 1
      FROM stock_movements other
      WHERE other.delivery_note_id  = sm.delivery_note_id
        AND other.category_product_id IS NOT DISTINCT FROM sm.category_product_id
        AND other.condition_before  IS NOT DISTINCT FROM sm.condition_before
        AND other.movement_type     = sm.movement_type
        AND other.quantity          = sm.quantity
        AND other.id <> sm.id
        AND (other.notes IS NULL OR other.notes NOT LIKE 'Shitje — Fatura %')
    )
),
restored AS (
  UPDATE stock s
  SET    quantity   = s.quantity + agg.qty_to_restore,
         updated_at = now()
  FROM (
    SELECT company_id, depot_id, category_product_id, category_id, cond,
           SUM(quantity)::numeric AS qty_to_restore
    FROM duplicates
    GROUP BY company_id, depot_id, category_product_id, category_id, cond
  ) agg
  WHERE s.company_id           = agg.company_id
    AND s.depot_id             = agg.depot_id
    AND COALESCE(s.category_product_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = COALESCE(agg.category_product_id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND s.category_id          IS NOT DISTINCT FROM agg.category_id
    AND s.condition            = agg.cond
  RETURNING s.id
)
DELETE FROM stock_movements
WHERE id IN (SELECT dup_id FROM duplicates);

-- 4. Floor any remaining negative stock.quantity to 0 (orphan negatives).
UPDATE stock
SET    quantity = 0, updated_at = now()
WHERE  quantity < 0;
