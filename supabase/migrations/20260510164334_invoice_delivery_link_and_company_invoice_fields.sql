/*
  # Link invoices to delivery notes + company invoice header config

  1. New columns on `companies`
    - invoice_footer_text, invoice_header_note, default_payment_terms_days,
      default_vat_rate, invoice_prefix, default_currency
  2. New columns on `acc_invoices`
    - delivery_note_id (FK -> delivery_notes.id) for bidirectional link
  3. New column on `acc_invoice_items`
    - is_transport (bool) to tag transport-cost line items
  4. RPC `create_invoice_from_delivery_note(p_note_id uuid)` — security definer,
    creates a draft acc_invoice from a delivery_note's items, links both sides,
    returns the new invoice id. Uses partner_id as contact. Scoped to user's company.
  5. Security: all new policies are restrictive. RPC checks company membership.
*/

-- 1. Company invoice header fields
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='invoice_footer_text') THEN
    ALTER TABLE companies ADD COLUMN invoice_footer_text text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='invoice_header_note') THEN
    ALTER TABLE companies ADD COLUMN invoice_header_note text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='default_payment_terms_days') THEN
    ALTER TABLE companies ADD COLUMN default_payment_terms_days integer DEFAULT 14;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='default_vat_rate') THEN
    ALTER TABLE companies ADD COLUMN default_vat_rate numeric(5,2) DEFAULT 19.00;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='invoice_prefix') THEN
    ALTER TABLE companies ADD COLUMN invoice_prefix text DEFAULT 'RE';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='default_currency') THEN
    ALTER TABLE companies ADD COLUMN default_currency text DEFAULT 'EUR';
  END IF;
END $$;

-- 2. Bidirectional link on acc_invoices
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='acc_invoices' AND column_name='delivery_note_id') THEN
    ALTER TABLE acc_invoices ADD COLUMN delivery_note_id uuid REFERENCES delivery_notes(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_acc_invoices_delivery_note_id ON acc_invoices(delivery_note_id);
  END IF;
END $$;

-- 3. Transport cost flag
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='acc_invoice_items' AND column_name='is_transport') THEN
    ALTER TABLE acc_invoice_items ADD COLUMN is_transport boolean DEFAULT false;
  END IF;
END $$;

-- 4. RPC: create invoice from delivery note
CREATE OR REPLACE FUNCTION public.create_invoice_from_delivery_note(
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
BEGIN
  SELECT company_id INTO v_user_company FROM profiles WHERE id = auth.uid();
  IF v_user_company IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_note FROM delivery_notes WHERE id = p_note_id;
  IF v_note IS NULL THEN RAISE EXCEPTION 'Delivery note not found'; END IF;
  IF v_note.company_id <> v_user_company THEN RAISE EXCEPTION 'Access denied'; END IF;

  IF v_note.acc_invoice_id IS NOT NULL THEN
    RETURN v_note.acc_invoice_id;
  END IF;

  SELECT * INTO v_company FROM companies WHERE id = v_user_company;

  BEGIN
    v_invoice_number := get_next_acc_number(v_user_company, coalesce(v_company.invoice_prefix,'RE'));
  EXCEPTION WHEN others THEN
    v_invoice_number := coalesce(v_company.invoice_prefix,'RE') || '-' || to_char(now(),'YYYY') || '-' || lpad((floor(random()*9999))::text,4,'0');
  END;

  v_due_date := (current_date + coalesce(v_company.default_payment_terms_days,14));

  INSERT INTO acc_invoices (
    company_id, created_by, contact_id, invoice_number, invoice_date, due_date,
    status, invoice_type, currency, subtotal, vat_amount, total, notes,
    delivery_note_id
  ) VALUES (
    v_user_company, auth.uid(), v_note.partner_id, v_invoice_number, current_date, v_due_date,
    'draft', 'invoice', coalesce(v_company.default_currency,'EUR'), 0, 0, 0,
    'Fature ne baze te fletedergeses #' || coalesce(v_note.note_number,'-'),
    p_note_id
  ) RETURNING id INTO v_invoice_id;

  FOR v_item IN
    SELECT dni.quantity, dni.notes, pc.name AS category_name, cp.name AS product_name
    FROM delivery_note_items dni
    LEFT JOIN product_categories pc ON pc.id = dni.category_id
    LEFT JOIN category_products cp ON cp.id = dni.category_product_id
    WHERE dni.delivery_note_id = p_note_id
  LOOP
    INSERT INTO acc_invoice_items (
      invoice_id, description, quantity, unit, unit_price, vat_rate, line_total
    ) VALUES (
      v_invoice_id,
      trim(coalesce(v_item.product_name, v_item.category_name, v_item.notes, 'Artikull')),
      coalesce(v_item.quantity,0), 'cope', 0, coalesce(v_company.default_vat_rate,19), 0
    );
  END LOOP;

  UPDATE delivery_notes SET acc_invoice_id = v_invoice_id, invoiced_at = now() WHERE id = p_note_id;

  RETURN v_invoice_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.create_invoice_from_delivery_note(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.create_invoice_from_delivery_note(uuid) TO authenticated;
