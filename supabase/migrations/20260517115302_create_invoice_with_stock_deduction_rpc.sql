/*
  # Create invoice with stock deduction (atomic)

  1. Changes
    - New RPC `create_invoice_with_stock_deduction` that:
      * Deducts stock for each delivery note item
      * Creates stock_movements entries of type 'exit'
      * Creates the invoice with full company/contact data
      * Links delivery note to invoice
    - Only for OUTGOING deliveries (sales)

  2. Important notes
    - Atomic: if any step fails, entire operation rolls back
    - Allows negative stock (with recorded movement) to not block business operations
    - Uses corrected item data (from delivery_note_items, not AI extract)
*/

CREATE OR REPLACE FUNCTION public.create_invoice_with_stock_deduction(
  p_note_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_note record;
  v_company record;
  v_user_company uuid;
  v_invoice_id uuid;
  v_invoice_number text;
  v_due_date date;
  v_item record;
  v_stock_id uuid;
  v_performer uuid;
  v_depot_id uuid;
BEGIN
  v_performer := auth.uid();
  SELECT company_id INTO v_user_company FROM profiles WHERE id = v_performer;
  IF v_user_company IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_note FROM delivery_notes WHERE id = p_note_id;
  IF v_note IS NULL THEN RAISE EXCEPTION 'Delivery note not found'; END IF;
  IF v_note.company_id <> v_user_company THEN RAISE EXCEPTION 'Access denied'; END IF;

  -- If already invoiced, return existing
  IF v_note.acc_invoice_id IS NOT NULL THEN
    RETURN v_note.acc_invoice_id;
  END IF;

  SELECT * INTO v_company FROM companies WHERE id = v_user_company;
  v_depot_id := v_note.assigned_depot_id;

  -- Generate invoice number
  BEGIN
    v_invoice_number := get_next_acc_number(v_user_company, coalesce(v_company.invoice_prefix,'RE'));
  EXCEPTION WHEN others THEN
    v_invoice_number := coalesce(v_company.invoice_prefix,'RE') || '-' || to_char(now(),'YYYY') || '-' || lpad((floor(random()*9999))::text,4,'0');
  END;

  v_due_date := (current_date + coalesce(v_company.default_payment_terms_days,14));

  -- Create invoice
  INSERT INTO acc_invoices (
    company_id, created_by, contact_id, invoice_number, invoice_date, due_date,
    status, invoice_type, currency, subtotal, vat_amount, total, notes,
    delivery_note_id, seller_vat_number, payment_terms_days
  ) VALUES (
    v_user_company, v_performer, v_note.partner_id, v_invoice_number, current_date, v_due_date,
    'draft', 'invoice', coalesce(v_company.default_currency,'EUR'), 0, 0, 0,
    'Fature ne baze te fletedergeses #' || coalesce(v_note.note_number,'-'),
    p_note_id, coalesce(v_company.vat_number,''), coalesce(v_company.default_payment_terms_days,14)
  ) RETURNING id INTO v_invoice_id;

  -- Create invoice items from delivery note items + deduct stock
  FOR v_item IN
    SELECT
      dni.id AS item_id,
      dni.quantity,
      dni.notes AS item_notes,
      dni.category_id,
      dni.category_product_id,
      dni.condition,
      pc.name AS category_name,
      cp.name AS product_name,
      cp.sku AS product_sku,
      cp.price_net,
      cp.vat_rate AS product_vat_rate,
      cp.unit AS product_unit
    FROM delivery_note_items dni
    LEFT JOIN product_categories pc ON pc.id = dni.category_id
    LEFT JOIN category_products cp ON cp.id = dni.category_product_id
    WHERE dni.delivery_note_id = p_note_id
  LOOP
    -- Insert invoice line item
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

    -- Deduct from stock (allow negative)
    IF v_depot_id IS NOT NULL AND v_item.category_id IS NOT NULL THEN
      SELECT id INTO v_stock_id
      FROM stock
      WHERE company_id = v_user_company
        AND depot_id = v_depot_id
        AND category_id = v_item.category_id
        AND COALESCE(category_product_id, '00000000-0000-0000-0000-000000000000'::uuid)
            = COALESCE(v_item.category_product_id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND condition = COALESCE(v_item.condition, 'good')
      LIMIT 1;

      IF v_stock_id IS NOT NULL THEN
        UPDATE stock
        SET quantity = quantity - coalesce(v_item.quantity, 0),
            updated_at = now()
        WHERE id = v_stock_id;
      ELSE
        -- Create stock entry with negative value if not exists
        INSERT INTO stock (company_id, depot_id, category_id, category_product_id, quantity, condition)
        VALUES (v_user_company, v_depot_id, v_item.category_id, v_item.category_product_id,
                -coalesce(v_item.quantity, 0), COALESCE(v_item.condition, 'good'));
      END IF;

      -- Record stock movement
      INSERT INTO stock_movements (
        company_id, depot_id, category_id, category_product_id,
        movement_type, quantity, condition_before, condition_after,
        notes, performed_by, delivery_note_id, created_at
      ) VALUES (
        v_user_company, v_depot_id, v_item.category_id, v_item.category_product_id,
        'exit', coalesce(v_item.quantity, 0),
        COALESCE(v_item.condition, 'good'), COALESCE(v_item.condition, 'good'),
        'Shitje — Fatura ' || v_invoice_number,
        v_performer, p_note_id, now()
      );
    END IF;
  END LOOP;

  -- Update invoice totals
  UPDATE acc_invoices SET
    subtotal = (SELECT coalesce(sum(line_total), 0) FROM acc_invoice_items WHERE invoice_id = v_invoice_id),
    vat_amount = (SELECT coalesce(sum(line_total * vat_rate / 100.0), 0) FROM acc_invoice_items WHERE invoice_id = v_invoice_id),
    total = (SELECT coalesce(sum(line_total * (1 + vat_rate / 100.0)), 0) FROM acc_invoice_items WHERE invoice_id = v_invoice_id)
  WHERE id = v_invoice_id;

  -- Link delivery note
  UPDATE delivery_notes SET acc_invoice_id = v_invoice_id, invoiced_at = now() WHERE id = p_note_id;

  RETURN v_invoice_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.create_invoice_with_stock_deduction(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.create_invoice_with_stock_deduction(uuid) TO authenticated;
