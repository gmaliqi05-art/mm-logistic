/*
  # Add document_number column to delivery_notes and linked_document_number to acc_invoices

  1. Modified Tables
    - `delivery_notes`
      - `document_number` (text, nullable) - The real document identifier extracted from
        the scanned physical document (e.g. "LS-12658"). Distinct from `note_number`
        which is the informal title used by the company admin for driver identification.
    - `acc_invoices`
      - `linked_document_number` (text, nullable) - Persisted copy of the delivery note
        document number at invoice creation time, so the invoice always references the
        correct document even if the delivery note is later modified.

  2. Data Backfill
    - Populates `document_number` from `ai_extracted_json->>'document_number'` for all
      existing delivery notes that have scanned data.

  3. Important Notes
    - No destructive operations
    - No RLS changes (columns inherit existing row policies)
    - Existing functionality is not broken; the new columns are purely additive
*/

-- 1. Add document_number to delivery_notes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'delivery_notes' AND column_name = 'document_number'
  ) THEN
    ALTER TABLE delivery_notes ADD COLUMN document_number text;
  END IF;
END $$;

-- 2. Add linked_document_number to acc_invoices
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acc_invoices' AND column_name = 'linked_document_number'
  ) THEN
    ALTER TABLE acc_invoices ADD COLUMN linked_document_number text;
  END IF;
END $$;

-- 3. Backfill document_number from ai_extracted_json for existing rows
UPDATE delivery_notes
SET document_number = ai_extracted_json->>'document_number'
WHERE ai_extracted_json IS NOT NULL
  AND ai_extracted_json->>'document_number' IS NOT NULL
  AND ai_extracted_json->>'document_number' != ''
  AND (document_number IS NULL OR document_number = '');

-- 4. Backfill linked_document_number on acc_invoices from their linked delivery notes
UPDATE acc_invoices ai
SET linked_document_number = COALESCE(dn.document_number, dn.note_number)
FROM delivery_notes dn
WHERE ai.delivery_note_id = dn.id
  AND ai.delivery_note_id IS NOT NULL
  AND (ai.linked_document_number IS NULL OR ai.linked_document_number = '');

-- 5. Update the create_invoice_from_delivery_note RPC to use document_number
CREATE OR REPLACE FUNCTION public.create_invoice_from_delivery_note(p_note_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_note       record;
  v_company_id uuid;
  v_user_id    uuid;
  v_invoice_id uuid;
  v_inv_num    text;
  v_contact_id uuid;
  v_doc_label  text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT dn.*, p.company_id AS user_company
  INTO v_note
  FROM delivery_notes dn
  JOIN profiles p ON p.id = v_user_id
  WHERE dn.id = p_note_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery note not found';
  END IF;

  IF v_note.company_id <> v_note.user_company THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  v_company_id := v_note.company_id;

  -- Idempotent: if already invoiced, return existing invoice id
  IF v_note.acc_invoice_id IS NOT NULL THEN
    RETURN v_note.acc_invoice_id;
  END IF;

  -- Resolve the document label: prefer scanned document_number, fall back to note_number
  v_doc_label := COALESCE(NULLIF(v_note.document_number, ''), v_note.note_number, '-');

  -- Try to find a matching acc_contact
  SELECT id INTO v_contact_id
  FROM acc_contacts
  WHERE company_id = v_company_id
    AND name = v_note.partner_name
  LIMIT 1;

  -- Generate invoice number
  SELECT 'INV-' || to_char(now(), 'YYYYMMDD') || '-' || lpad((count(*) + 1)::text, 4, '0')
  INTO v_inv_num
  FROM acc_invoices
  WHERE company_id = v_company_id;

  INSERT INTO acc_invoices (
    company_id, created_by, contact_id, invoice_number, invoice_date, due_date,
    status, subtotal, vat_amount, total, discount, currency,
    notes, invoice_type, delivery_note_id, linked_document_number
  ) VALUES (
    v_company_id, v_user_id, v_contact_id, v_inv_num, now()::date,
    (now() + interval '14 days')::date,
    'draft', 0, 0, 0, 0, 'EUR',
    'Fature ne baze te fletedergeses #' || v_doc_label,
    'invoice', p_note_id, v_doc_label
  ) RETURNING id INTO v_invoice_id;

  -- Copy delivery note items to invoice items
  INSERT INTO acc_invoice_items (
    invoice_id, description, quantity, unit_code, unit_price, vat_rate, vat_category, discount_amount
  )
  SELECT
    v_invoice_id,
    COALESCE(cp.name, pc.name, dni.notes, 'Artikull'),
    dni.quantity,
    'C62',
    COALESCE(cp.price_net, 0),
    COALESCE(cp.vat_rate, 19),
    'S',
    0
  FROM delivery_note_items dni
  LEFT JOIN category_products cp ON cp.id = dni.category_product_id
  LEFT JOIN product_categories pc ON pc.id = dni.category_id
  WHERE dni.delivery_note_id = p_note_id;

  -- Update totals
  UPDATE acc_invoices
  SET subtotal = COALESCE(sub.s, 0),
      vat_amount = COALESCE(sub.v, 0),
      total = COALESCE(sub.s, 0) + COALESCE(sub.v, 0)
  FROM (
    SELECT
      sum(quantity * unit_price - discount_amount) AS s,
      sum((quantity * unit_price - discount_amount) * vat_rate / 100) AS v
    FROM acc_invoice_items
    WHERE invoice_id = v_invoice_id
  ) sub
  WHERE acc_invoices.id = v_invoice_id;

  -- Mark delivery note as invoiced
  UPDATE delivery_notes
  SET acc_invoice_id = v_invoice_id,
      invoiced_at = now()
  WHERE id = p_note_id;

  RETURN v_invoice_id;
END;
$$;
