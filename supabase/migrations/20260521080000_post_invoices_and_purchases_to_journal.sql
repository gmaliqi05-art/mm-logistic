/*
  # Auto-post invoices and purchases to the double-entry journal

  The mm-logistic accounting tables (acc_journal_entries / acc_journal_lines)
  were created in migration `20260422133219_create_coa_journal_imports.sql`
  but no code path ever wrote to them. As a result there was zero
  double-entry bookkeeping — invoices and purchases existed only as source
  documents, and DATEV / UStVA / Bilanz / GuV exports that read from the
  journal returned empty results.

  This migration installs:
    - acc_post_invoice_to_journal(uuid)   — re-posts a single invoice
    - acc_post_purchase_to_journal(uuid)  — re-posts a single purchase
    - trg_acc_invoice_post_journal        — AFTER INSERT/UPDATE on acc_invoices
    - trg_acc_purchase_post_journal       — AFTER INSERT/UPDATE on acc_purchases

  Posting logic (SKR03/SKR04 mapped via acc_chart_of_accounts):

  Sales invoice (status sent / partial / overdue / paid):
    Dr 1400 Llogari klientesh                        (gross total)
    Cr 8400/8300/8125/8120/8590 Te ardhura            (net per VAT rate)
    Cr 1770/1771 TVSH e pagueshme                     (VAT per rate)

  Sales invoice (status paid): additionally
    Dr 1200 Banka                                     (gross)
    Cr 1400 Llogari klientesh                         (gross)

  Sales invoice (status draft / cancelled): no journal — any prior entry is removed.

  Purchase (status received / partial / paid):
    Dr 3400/3300/3550 Blerje lendesh                  (net per VAT rate)
    Dr 1570/1571 TVSH e zbritshme                     (VAT per rate)
    Cr 1700 Llogari furnitoresh                       (gross total)

  Purchase (status paid): additionally
    Dr 1700 Llogari furnitoresh                       (gross)
    Cr 1200 Banka                                     (gross)

  Purchase (status draft / awaiting_document / cancelled): no journal.

  Reverse-charge / intra-Community supply: revenue posted to 8125, no VAT line.
  Each operation is idempotent — re-running for the same source row replaces
  the entries; no double-posting. Currency is honoured via exchange_rate_to_eur
  on the source document.

  Backfill: at the end of this migration we call the posters for every
  existing invoice and purchase so historical numbers reach the journal too.
*/

-- 1. Invoice posting function -------------------------------------------------

CREATE OR REPLACE FUNCTION public.acc_post_invoice_to_journal(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  v_exchange        numeric;
  v_revenue_code    text;
  v_vat_output_code text;
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

  -- Skip posting for non-financial states.
  IF v_inv.status IN ('draft', 'cancelled') THEN
    RETURN;
  END IF;

  v_exchange := COALESCE(NULLIF(v_inv.exchange_rate_to_eur, 0), NULLIF(v_inv.exchange_rate, 0), 1);

  -- Main entry: A/R against revenue + VAT.
  v_entry_number := get_next_acc_number(v_inv.company_id, 'JE');

  INSERT INTO acc_journal_entries
    (company_id, entry_number, entry_date, description, reference_type, reference_id,
     status, total_debit, total_credit, created_by, posted_at)
  VALUES
    (v_inv.company_id, v_entry_number, COALESCE(v_inv.invoice_date, CURRENT_DATE),
     'Fature shitje ' || COALESCE(v_inv.invoice_number, '?'),
     'acc_invoice', v_inv.id,
     'posted', 0, 0, v_inv.created_by, now())
  RETURNING id INTO v_entry_id;

  -- Dr A/R (gross)
  INSERT INTO acc_journal_lines (entry_id, account_code, debit, credit, description, line_order)
  VALUES (v_entry_id, '1400', ROUND((COALESCE(v_inv.total, 0) * v_exchange)::numeric, 2), 0,
          'A/R ' || COALESCE(v_inv.invoice_number, ''), v_line_order);
  v_line_order := v_line_order + 1;

  -- Cr Revenue + Cr VAT, grouped by vat_rate
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

    -- Revenue account picks
    v_revenue_code := CASE
      WHEN v_inv.reverse_charge OR v_inv.intra_community_supply THEN '8125'
      WHEN v_rate = 0  THEN '8120'
      WHEN v_rate = 7  THEN '8300'
      WHEN v_rate = 19 THEN '8400'
      ELSE '8590'
    END;

    INSERT INTO acc_journal_lines (entry_id, account_code, debit, credit, description, vat_code, line_order)
    VALUES (v_entry_id, v_revenue_code, 0, v_net_eur,
            'Te ardhura ' || v_rate || '%', v_rate::text, v_line_order);
    v_line_order := v_line_order + 1;

    -- VAT output (only for normal VAT-charged sales)
    IF v_vat_eur > 0 AND NOT v_inv.reverse_charge AND NOT v_inv.intra_community_supply THEN
      v_vat_output_code := CASE
        WHEN v_rate = 7  THEN '1771'
        WHEN v_rate = 19 THEN '1770'
        ELSE NULL
      END;
      IF v_vat_output_code IS NOT NULL THEN
        INSERT INTO acc_journal_lines (entry_id, account_code, debit, credit, description, vat_code, line_order)
        VALUES (v_entry_id, v_vat_output_code, 0, v_vat_eur,
                'TVSH dalese ' || v_rate || '%', v_rate::text, v_line_order);
        v_line_order := v_line_order + 1;
      END IF;
    END IF;
  END LOOP;

  -- Update header totals to keep entry balanced
  UPDATE acc_journal_entries
     SET total_debit  = (SELECT COALESCE(SUM(debit), 0)  FROM acc_journal_lines WHERE entry_id = v_entry_id),
         total_credit = (SELECT COALESCE(SUM(credit), 0) FROM acc_journal_lines WHERE entry_id = v_entry_id)
   WHERE id = v_entry_id;

  -- Payment leg if invoice is settled
  IF v_inv.status = 'paid' THEN
    v_payment_number := get_next_acc_number(v_inv.company_id, 'JE');
    v_gross_eur := ROUND((COALESCE(v_inv.total, 0) * v_exchange)::numeric, 2);

    INSERT INTO acc_journal_entries
      (company_id, entry_number, entry_date, description, reference_type, reference_id,
       status, total_debit, total_credit, created_by, posted_at)
    VALUES
      (v_inv.company_id, v_payment_number, COALESCE(v_inv.invoice_date, CURRENT_DATE),
       'Pagese fature ' || COALESCE(v_inv.invoice_number, '?'),
       'acc_invoice_payment', v_inv.id,
       'posted', v_gross_eur, v_gross_eur, v_inv.created_by, now())
    RETURNING id INTO v_payment_entry;

    INSERT INTO acc_journal_lines (entry_id, account_code, debit, credit, description, line_order)
    VALUES
      (v_payment_entry, '1200', v_gross_eur, 0,
        'Banka — pagese ' || COALESCE(v_inv.invoice_number, ''), 1),
      (v_payment_entry, '1400', 0, v_gross_eur,
        'A/R pagese ' || COALESCE(v_inv.invoice_number, ''), 2);
  END IF;
END;
$$;

-- 2. Purchase posting function ------------------------------------------------

CREATE OR REPLACE FUNCTION public.acc_post_purchase_to_journal(p_purchase_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pur            acc_purchases%ROWTYPE;
  v_entry_id       uuid;
  v_payment_entry  uuid;
  v_entry_number   text;
  v_payment_number text;
  v_line_order     int := 1;
  v_rate_row       record;
  v_rate           numeric;
  v_net_eur        numeric;
  v_vat_eur        numeric;
  v_gross_eur      numeric;
  v_exchange       numeric;
  v_expense_code   text;
  v_vat_input_code text;
BEGIN
  SELECT * INTO v_pur FROM acc_purchases WHERE id = p_purchase_id;
  IF v_pur.id IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM acc_journal_entries
   WHERE company_id = v_pur.company_id
     AND reference_type IN ('acc_purchase', 'acc_purchase_payment')
     AND reference_id = v_pur.id;

  IF v_pur.status IN ('draft', 'awaiting_document', 'cancelled') THEN
    RETURN;
  END IF;

  -- Skip stubs with no real amounts.
  IF COALESCE(v_pur.total, 0) = 0 THEN
    RETURN;
  END IF;

  v_exchange := COALESCE(NULLIF(v_pur.exchange_rate_to_eur, 0), 1);

  v_entry_number := get_next_acc_number(v_pur.company_id, 'JE');

  INSERT INTO acc_journal_entries
    (company_id, entry_number, entry_date, description, reference_type, reference_id,
     status, total_debit, total_credit, created_by, posted_at)
  VALUES
    (v_pur.company_id, v_entry_number, COALESCE(v_pur.purchase_date, CURRENT_DATE),
     'Blerje ' || COALESCE(v_pur.purchase_number, '?'),
     'acc_purchase', v_pur.id,
     'posted', 0, 0, v_pur.created_by, now())
  RETURNING id INTO v_entry_id;

  -- Dr Expense + Dr VAT input, grouped by rate
  FOR v_rate_row IN
    SELECT
      COALESCE(pi.vat_rate, 0)::numeric AS rate,
      SUM(COALESCE(pi.line_total, 0))::numeric AS net_amount
    FROM acc_purchase_items pi
    WHERE pi.purchase_id = v_pur.id
    GROUP BY COALESCE(pi.vat_rate, 0)
    ORDER BY 1
  LOOP
    v_rate    := v_rate_row.rate;
    v_net_eur := ROUND((v_rate_row.net_amount * v_exchange)::numeric, 2);
    v_vat_eur := ROUND((v_net_eur * v_rate / 100)::numeric, 2);

    v_expense_code := CASE
      WHEN v_rate = 7  THEN '3300'
      WHEN v_rate = 19 THEN '3400'
      ELSE '3550'
    END;

    INSERT INTO acc_journal_lines (entry_id, account_code, debit, credit, description, vat_code, line_order)
    VALUES (v_entry_id, v_expense_code, v_net_eur, 0,
            'Blerje lendesh ' || v_rate || '%', v_rate::text, v_line_order);
    v_line_order := v_line_order + 1;

    IF v_vat_eur > 0 THEN
      v_vat_input_code := CASE
        WHEN v_rate = 7  THEN '1571'
        WHEN v_rate = 19 THEN '1570'
        ELSE NULL
      END;
      IF v_vat_input_code IS NOT NULL THEN
        INSERT INTO acc_journal_lines (entry_id, account_code, debit, credit, description, vat_code, line_order)
        VALUES (v_entry_id, v_vat_input_code, v_vat_eur, 0,
                'TVSH e zbritshme ' || v_rate || '%', v_rate::text, v_line_order);
        v_line_order := v_line_order + 1;
      END IF;
    END IF;
  END LOOP;

  -- Cr A/P (gross)
  INSERT INTO acc_journal_lines (entry_id, account_code, debit, credit, description, line_order)
  VALUES (v_entry_id, '1700', 0, ROUND((COALESCE(v_pur.total, 0) * v_exchange)::numeric, 2),
          'A/P ' || COALESCE(v_pur.purchase_number, ''), v_line_order);

  UPDATE acc_journal_entries
     SET total_debit  = (SELECT COALESCE(SUM(debit), 0)  FROM acc_journal_lines WHERE entry_id = v_entry_id),
         total_credit = (SELECT COALESCE(SUM(credit), 0) FROM acc_journal_lines WHERE entry_id = v_entry_id)
   WHERE id = v_entry_id;

  -- Payment leg if settled
  IF v_pur.status = 'paid' THEN
    v_payment_number := get_next_acc_number(v_pur.company_id, 'JE');
    v_gross_eur := ROUND((COALESCE(v_pur.total, 0) * v_exchange)::numeric, 2);

    INSERT INTO acc_journal_entries
      (company_id, entry_number, entry_date, description, reference_type, reference_id,
       status, total_debit, total_credit, created_by, posted_at)
    VALUES
      (v_pur.company_id, v_payment_number, COALESCE(v_pur.purchase_date, CURRENT_DATE),
       'Pagese blerjeje ' || COALESCE(v_pur.purchase_number, '?'),
       'acc_purchase_payment', v_pur.id,
       'posted', v_gross_eur, v_gross_eur, v_pur.created_by, now())
    RETURNING id INTO v_payment_entry;

    INSERT INTO acc_journal_lines (entry_id, account_code, debit, credit, description, line_order)
    VALUES
      (v_payment_entry, '1700', v_gross_eur, 0,
        'A/P pagese ' || COALESCE(v_pur.purchase_number, ''), 1),
      (v_payment_entry, '1200', 0, v_gross_eur,
        'Banka — pagese ' || COALESCE(v_pur.purchase_number, ''), 2);
  END IF;
END;
$$;

-- 3. Triggers -----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_acc_invoice_post_journal_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Post on insert only when the row arrives in a non-draft state.
    IF NEW.status NOT IN ('draft', 'cancelled') THEN
      PERFORM acc_post_invoice_to_journal(NEW.id);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status
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

DROP TRIGGER IF EXISTS trg_acc_invoice_post_journal ON public.acc_invoices;
CREATE TRIGGER trg_acc_invoice_post_journal
AFTER INSERT OR UPDATE ON public.acc_invoices
FOR EACH ROW
EXECUTE FUNCTION public.trg_acc_invoice_post_journal_fn();

CREATE OR REPLACE FUNCTION public.trg_acc_purchase_post_journal_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('draft', 'awaiting_document', 'cancelled') AND COALESCE(NEW.total, 0) > 0 THEN
      PERFORM acc_post_purchase_to_journal(NEW.id);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.total      IS DISTINCT FROM OLD.total
       OR NEW.subtotal   IS DISTINCT FROM OLD.subtotal
       OR NEW.vat_amount IS DISTINCT FROM OLD.vat_amount
       OR NEW.purchase_date IS DISTINCT FROM OLD.purchase_date
       OR NEW.exchange_rate_to_eur IS DISTINCT FROM OLD.exchange_rate_to_eur THEN
      PERFORM acc_post_purchase_to_journal(NEW.id);
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_acc_purchase_post_journal ON public.acc_purchases;
CREATE TRIGGER trg_acc_purchase_post_journal
AFTER INSERT OR UPDATE ON public.acc_purchases
FOR EACH ROW
EXECUTE FUNCTION public.trg_acc_purchase_post_journal_fn();

-- 4. Backfill existing rows ---------------------------------------------------

DO $backfill$
DECLARE
  v_id uuid;
BEGIN
  FOR v_id IN
    SELECT id FROM acc_invoices
     WHERE status NOT IN ('draft', 'cancelled')
     ORDER BY invoice_date NULLS LAST, created_at
  LOOP
    PERFORM acc_post_invoice_to_journal(v_id);
  END LOOP;

  FOR v_id IN
    SELECT id FROM acc_purchases
     WHERE status NOT IN ('draft', 'awaiting_document', 'cancelled')
       AND COALESCE(total, 0) > 0
     ORDER BY purchase_date NULLS LAST, created_at
  LOOP
    PERFORM acc_post_purchase_to_journal(v_id);
  END LOOP;
END;
$backfill$;
