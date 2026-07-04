/*
  # GoBD B-C3: sign-correct credit-note posting + skip proforma in the journal

  `acc_post_invoice_to_journal` (20260521080000) always booked a sale:
  Dr 1400 A/R (gross) / Cr revenue (net) / Cr VAT — regardless of
  `invoice_type`. Two consequences:

  1. **Credit notes posted backwards.** A `credit_note` (Gutschrift /
     Rechnungskorrektur) must REVERSE the sale — Dr revenue, Dr VAT, Cr A/R —
     so it reduces revenue and receivables. The old poster instead INCREASED
     them, overstating turnover and output VAT.

  2. **Proforma invoices posted at all.** A `proforma` is a quote, not an
     accounting document; it must never hit the journal. The old poster booked
     revenue for it.

  Fix: skip proforma entirely (like draft/cancelled), and for credit notes
  swap debit↔credit on every line (main entry + payment leg) via a single
  `v_is_credit` flag. Normal invoices are unchanged. The entry stays balanced.

  Also extend the invoice trigger to re-post when `invoice_type` changes, so a
  document that is reclassified doesn't keep a stale journal entry.

  Forward-only: there are currently no credit_note/proforma rows in the data,
  so no historical journal is rewritten by the function change (the idempotent
  DELETE-then-repost still corrects any that appear later). Normal invoices
  re-post identically.
*/

CREATE OR REPLACE FUNCTION public.acc_post_invoice_to_journal(p_invoice_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_inv             acc_invoices%ROWTYPE;
  v_entry_id        uuid;
  v_payment_entry   uuid;
  v_entry_number    text;
  v_payment_number  text;
  v_line_order      int := 1;
  v_rate_row        record;
  v_rate            numeric;
  v_net_eur         numeric;
  v_vat_eur         numeric;
  v_gross_eur       numeric;
  v_ar_eur          numeric;
  v_exchange        numeric;
  v_revenue_code    text;
  v_vat_output_code text;
  v_is_credit       boolean;
  v_desc            text;
BEGIN
  SELECT * INTO v_inv FROM acc_invoices WHERE id = p_invoice_id;
  IF v_inv.id IS NULL THEN
    RETURN;
  END IF;

  -- Always wipe prior journal entries for this invoice — idempotent.
  DELETE FROM acc_journal_entries
   WHERE company_id = v_inv.company_id
     AND reference_type IN ('acc_invoice', 'acc_invoice_payment')
     AND reference_id = v_inv.id;

  -- Non-financial states and proforma quotes never reach the ledger.
  IF v_inv.status IN ('draft', 'cancelled') OR v_inv.invoice_type = 'proforma' THEN
    RETURN;
  END IF;

  v_is_credit := (v_inv.invoice_type = 'credit_note');
  v_desc      := CASE WHEN v_is_credit THEN 'Nota kreditit ' ELSE 'Fature shitje ' END;

  v_exchange := COALESCE(NULLIF(v_inv.exchange_rate_to_eur, 0), NULLIF(v_inv.exchange_rate, 0), 1);
  v_ar_eur   := ROUND((COALESCE(v_inv.total, 0) * v_exchange)::numeric, 2);

  v_entry_number := get_next_acc_number(v_inv.company_id, 'JE');

  INSERT INTO acc_journal_entries
    (company_id, entry_number, entry_date, description, reference_type, reference_id,
     status, total_debit, total_credit, created_by, posted_at)
  VALUES
    (v_inv.company_id, v_entry_number, COALESCE(v_inv.invoice_date, CURRENT_DATE),
     v_desc || COALESCE(v_inv.invoice_number, '?'),
     'acc_invoice', v_inv.id,
     'posted', 0, 0, v_inv.created_by, now())
  RETURNING id INTO v_entry_id;

  -- A/R: Dr for an invoice, Cr for a credit note (reverses the receivable).
  INSERT INTO acc_journal_lines (entry_id, account_code, debit, credit, description, line_order)
  VALUES (v_entry_id, '1400',
          CASE WHEN v_is_credit THEN 0 ELSE v_ar_eur END,
          CASE WHEN v_is_credit THEN v_ar_eur ELSE 0 END,
          'A/R ' || COALESCE(v_inv.invoice_number, ''), v_line_order);
  v_line_order := v_line_order + 1;

  -- Revenue + VAT, grouped by vat_rate. Cr for an invoice, Dr for a credit note.
  FOR v_rate_row IN
    SELECT
      COALESCE(it.vat_rate, 0)::numeric AS rate,
      SUM(COALESCE(it.line_total, 0))::numeric AS net_amount
    FROM acc_invoice_items it
    WHERE it.invoice_id = v_inv.id
    GROUP BY COALESCE(it.vat_rate, 0)
    ORDER BY 1
  LOOP
    v_rate     := v_rate_row.rate;
    v_net_eur  := ROUND((v_rate_row.net_amount * v_exchange)::numeric, 2);
    v_vat_eur  := ROUND((v_net_eur * v_rate / 100)::numeric, 2);

    v_revenue_code := CASE
      WHEN v_inv.reverse_charge OR v_inv.intra_community_supply THEN '8125'
      WHEN v_rate = 0  THEN '8120'
      WHEN v_rate = 7  THEN '8300'
      WHEN v_rate = 19 THEN '8400'
      ELSE '8590'
    END;

    INSERT INTO acc_journal_lines (entry_id, account_code, debit, credit, description, vat_code, line_order)
    VALUES (v_entry_id, v_revenue_code,
            CASE WHEN v_is_credit THEN v_net_eur ELSE 0 END,
            CASE WHEN v_is_credit THEN 0 ELSE v_net_eur END,
            'Te ardhura ' || v_rate || '%', v_rate::text, v_line_order);
    v_line_order := v_line_order + 1;

    IF v_vat_eur > 0 AND NOT v_inv.reverse_charge AND NOT v_inv.intra_community_supply THEN
      v_vat_output_code := CASE
        WHEN v_rate = 7  THEN '1771'
        WHEN v_rate = 19 THEN '1770'
        ELSE NULL
      END;
      IF v_vat_output_code IS NOT NULL THEN
        INSERT INTO acc_journal_lines (entry_id, account_code, debit, credit, description, vat_code, line_order)
        VALUES (v_entry_id, v_vat_output_code,
                CASE WHEN v_is_credit THEN v_vat_eur ELSE 0 END,
                CASE WHEN v_is_credit THEN 0 ELSE v_vat_eur END,
                'TVSH dalese ' || v_rate || '%', v_rate::text, v_line_order);
        v_line_order := v_line_order + 1;
      END IF;
    END IF;
  END LOOP;

  UPDATE acc_journal_entries
     SET total_debit  = (SELECT COALESCE(SUM(debit), 0)  FROM acc_journal_lines WHERE entry_id = v_entry_id),
         total_credit = (SELECT COALESCE(SUM(credit), 0) FROM acc_journal_lines WHERE entry_id = v_entry_id)
   WHERE id = v_entry_id;

  -- Payment leg. For an invoice: Dr Bank / Cr A/R (cash in). For a credit note
  -- a "paid" state means the refund went out: Cr Bank / Dr A/R.
  IF v_inv.status = 'paid' THEN
    v_payment_number := get_next_acc_number(v_inv.company_id, 'JE');
    v_gross_eur := v_ar_eur;

    INSERT INTO acc_journal_entries
      (company_id, entry_number, entry_date, description, reference_type, reference_id,
       status, total_debit, total_credit, created_by, posted_at)
    VALUES
      (v_inv.company_id, v_payment_number, COALESCE(v_inv.invoice_date, CURRENT_DATE),
       (CASE WHEN v_is_credit THEN 'Rimbursim ' ELSE 'Pagese fature ' END) || COALESCE(v_inv.invoice_number, '?'),
       'acc_invoice_payment', v_inv.id,
       'posted', v_gross_eur, v_gross_eur, v_inv.created_by, now())
    RETURNING id INTO v_payment_entry;

    INSERT INTO acc_journal_lines (entry_id, account_code, debit, credit, description, line_order)
    VALUES
      (v_payment_entry, '1200',
        CASE WHEN v_is_credit THEN 0 ELSE v_gross_eur END,
        CASE WHEN v_is_credit THEN v_gross_eur ELSE 0 END,
        'Banka pagese ' || COALESCE(v_inv.invoice_number, ''), 1),
      (v_payment_entry, '1400',
        CASE WHEN v_is_credit THEN v_gross_eur ELSE 0 END,
        CASE WHEN v_is_credit THEN 0 ELSE v_gross_eur END,
        'A/R pagese ' || COALESCE(v_inv.invoice_number, ''), 2);
  END IF;
END;
$function$;

-- Re-post when the document type is reclassified too, so a stale entry can't
-- survive an invoice ↔ credit_note ↔ proforma change.
CREATE OR REPLACE FUNCTION public.trg_acc_invoice_post_journal_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('draft', 'cancelled') AND COALESCE(NEW.invoice_type, 'invoice') <> 'proforma' THEN
      PERFORM acc_post_invoice_to_journal(NEW.id);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.invoice_type IS DISTINCT FROM OLD.invoice_type
       OR NEW.total      IS DISTINCT FROM OLD.total
       OR NEW.subtotal   IS DISTINCT FROM OLD.subtotal
       OR NEW.vat_amount IS DISTINCT FROM OLD.vat_amount
       OR NEW.invoice_date IS DISTINCT FROM OLD.invoice_date
       OR NEW.exchange_rate_to_eur IS DISTINCT FROM OLD.exchange_rate_to_eur
       OR NEW.reverse_charge IS DISTINCT FROM OLD.reverse_charge
       OR NEW.intra_community_supply IS DISTINCT FROM OLD.intra_community_supply THEN
      PERFORM acc_post_invoice_to_journal(NEW.id);
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;
