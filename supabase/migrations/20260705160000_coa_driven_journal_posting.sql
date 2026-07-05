/*
  # B-C4: Chart-of-accounts-driven journal posting

  `acc_post_invoice_to_journal` / `acc_post_purchase_to_journal`
  (20260521080000) hardcode SKR03 German account codes (1400, 8400, 1770,
  3400, 1700, 1200 …) in CASE statements. But every company is seeded its own
  chart from a template (SKR03/SKR04, Swiss KMU, French PCG, Balkan/CEE, etc.
  — see the coa_* seed migrations), and those charts use entirely different
  numbering. The one company that actually has a chart today uses the Swiss
  **KMU** template (A/R 1100, Bank 1020, A/P 2000, USt 2200, Vorsteuer 1170,
  revenue 3000, Materialaufwand 4000) and has NONE of the SKR03 codes — so its
  journal lines referenced accounts that do not exist in its own chart, and
  its Bilanz / GuV / DATEV would be inconsistent.

  This makes posting chart-driven via a resolver with three tiers:

    1. Explicit override in the new `acc_posting_accounts` table
       (company_id, role[, rate-qualified]) — lets an accountant pin an exact
       account per posting role.
    2. Inference from the company's own `company_chart_of_accounts`, keyed on
       `account_type` + `vat_relevance` + name heuristics. Deterministic; it
       resolves the KMU chart (and SKR03) correctly with zero configuration.
    3. The original SKR03 constant as a hard fallback, so a company with no
       chart at all keeps posting exactly as before — no regression.

  Roles: ar, ap, bank, vat_output, vat_input, revenue, expense_goods. Revenue
  and VAT resolution accept the line's VAT rate so a chart that splits revenue
  per rate (SKR03: 8400/8300/8120) can still do so via rate-qualified
  overrides (e.g. role 'revenue_19'); a chart with a single revenue account
  (KMU: 3000) collapses all rates onto it automatically.

  The two posting functions are rewritten to resolve every account through
  `acc_get_posting_account`, passing the previous hardcoded value as the
  fallback. Function bodies are otherwise identical to 20260521080000.

  Applied to prod via MCP; recorded here. After applying, the single existing
  posted invoice is re-posted so its lines use the correct KMU codes.
*/

-- 1. Override table ----------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.acc_posting_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role text NOT NULL,
  account_code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, role)
);

ALTER TABLE public.acc_posting_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members read posting map" ON public.acc_posting_accounts;
CREATE POLICY "Company members read posting map"
  ON public.acc_posting_accounts FOR SELECT TO authenticated
  USING (company_id = private.get_user_company_id() OR private.is_super_admin());

DROP POLICY IF EXISTS "Company admins write posting map" ON public.acc_posting_accounts;
CREATE POLICY "Company admins write posting map"
  ON public.acc_posting_accounts FOR ALL TO authenticated
  USING (
    private.is_super_admin()
    OR (company_id = private.get_user_company_id()
        AND private.get_user_role() IN ('company_admin', 'accountant'))
  )
  WITH CHECK (
    private.is_super_admin()
    OR (company_id = private.get_user_company_id()
        AND private.get_user_role() IN ('company_admin', 'accountant'))
  );

-- 2. Inference from the company's own chart ----------------------------------

CREATE OR REPLACE FUNCTION public.acc_infer_posting_account(p_company_id uuid, p_role text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
BEGIN
  SELECT account_code INTO v_code
  FROM company_chart_of_accounts c
  WHERE c.company_id = p_company_id
    AND c.is_active
    AND CASE p_role
      WHEN 'ar' THEN c.account_type = 'asset'
        AND c.account_name ~* '(forderung|debitor|kunde|client|receivable|clientes|arketueshme)'
      WHEN 'bank' THEN c.account_type = 'asset'
        AND c.account_name ~* '(bank|giro|postfinance)'
      WHEN 'cash' THEN c.account_type = 'asset'
        AND c.account_name ~* '(kasse|cash|arka)'
      WHEN 'ap' THEN c.account_type = 'liability'
        AND c.account_name ~* '(verbindlichkeit|kreditor|lieferant|payable|furnitor|pagueshme)'
      WHEN 'vat_output' THEN c.account_type = 'liability'
        AND (c.vat_relevance = 'output' OR c.account_name ~* '(umsatzsteuer|mehrwertsteuer|output|dalese|tvsh e pag)')
      WHEN 'vat_input' THEN c.account_type = 'asset'
        AND (c.vat_relevance = 'input' OR c.account_name ~* '(vorsteuer|input|zbritshme)')
      WHEN 'revenue' THEN c.account_type = 'income'
      WHEN 'expense_goods' THEN c.account_type = 'expense'
        AND (c.vat_relevance = 'input' OR c.account_name ~* '(material|waren|wareneinsatz|blerje|aufwand)')
      ELSE false
    END
  ORDER BY
    -- prefer VAT-relevant revenue accounts, then lowest code for stability
    CASE WHEN p_role = 'revenue' AND c.vat_relevance = 'output' THEN 0 ELSE 1 END,
    CASE WHEN p_role = 'expense_goods' AND c.account_name ~* '(material|waren|blerje)' THEN 0 ELSE 1 END,
    c.sort_order, c.account_code
  LIMIT 1;

  RETURN v_code;
END;
$$;

-- 3. Resolver: override -> inference -> fallback -----------------------------

CREATE OR REPLACE FUNCTION public.acc_get_posting_account(
  p_company_id uuid,
  p_role text,
  p_rate numeric DEFAULT NULL,
  p_fallback text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_suffix text;
BEGIN
  -- 1a. rate-qualified explicit override (e.g. 'revenue_19')
  IF p_rate IS NOT NULL THEN
    v_suffix := trim_scale(p_rate)::text;
    SELECT account_code INTO v_code
    FROM acc_posting_accounts
    WHERE company_id = p_company_id AND role = p_role || '_' || v_suffix;
    IF v_code IS NOT NULL THEN RETURN v_code; END IF;
  END IF;

  -- 1b. base-role explicit override
  SELECT account_code INTO v_code
  FROM acc_posting_accounts
  WHERE company_id = p_company_id AND role = p_role;
  IF v_code IS NOT NULL THEN RETURN v_code; END IF;

  -- 2. infer from the company's chart
  v_code := acc_infer_posting_account(p_company_id, p_role);
  IF v_code IS NOT NULL THEN RETURN v_code; END IF;

  -- 3. SKR03 constant fallback (unchanged legacy behaviour)
  RETURN p_fallback;
END;
$$;

-- Internal-only helpers: not meant to be reachable via PostgREST RPC. Revoke
-- from PUBLIC and the Supabase-default anon/authenticated grants (advisor
-- 0028/0029). They are still callable by the SECURITY DEFINER posting
-- functions, which do not depend on the caller's EXECUTE grant.
REVOKE ALL ON FUNCTION public.acc_infer_posting_account(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.acc_get_posting_account(uuid, text, numeric, text) FROM PUBLIC, anon, authenticated;

-- 4. Rewrite invoice poster to resolve via chart -----------------------------

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
  v_fallback        text;
BEGIN
  SELECT * INTO v_inv FROM acc_invoices WHERE id = p_invoice_id;
  IF v_inv.id IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM acc_journal_entries
   WHERE company_id = v_inv.company_id
     AND reference_type IN ('acc_invoice', 'acc_invoice_payment')
     AND reference_id = v_inv.id;

  IF v_inv.status IN ('draft', 'cancelled') THEN
    RETURN;
  END IF;

  v_exchange := COALESCE(NULLIF(v_inv.exchange_rate_to_eur, 0), NULLIF(v_inv.exchange_rate, 0), 1);

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
  VALUES (v_entry_id, acc_get_posting_account(v_inv.company_id, 'ar', NULL, '1400'),
          ROUND((COALESCE(v_inv.total, 0) * v_exchange)::numeric, 2), 0,
          'A/R ' || COALESCE(v_inv.invoice_number, ''), v_line_order);
  v_line_order := v_line_order + 1;

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

    v_fallback := CASE
      WHEN v_inv.reverse_charge OR v_inv.intra_community_supply THEN '8125'
      WHEN v_rate = 0  THEN '8120'
      WHEN v_rate = 7  THEN '8300'
      WHEN v_rate = 19 THEN '8400'
      ELSE '8590'
    END;
    v_revenue_code := acc_get_posting_account(v_inv.company_id, 'revenue', v_rate, v_fallback);

    INSERT INTO acc_journal_lines (entry_id, account_code, debit, credit, description, vat_code, line_order)
    VALUES (v_entry_id, v_revenue_code, 0, v_net_eur,
            'Te ardhura ' || v_rate || '%', v_rate::text, v_line_order);
    v_line_order := v_line_order + 1;

    IF v_vat_eur > 0 AND NOT v_inv.reverse_charge AND NOT v_inv.intra_community_supply THEN
      v_fallback := CASE
        WHEN v_rate = 7  THEN '1771'
        WHEN v_rate = 19 THEN '1770'
        ELSE NULL
      END;
      v_vat_output_code := acc_get_posting_account(v_inv.company_id, 'vat_output', v_rate, v_fallback);
      IF v_vat_output_code IS NOT NULL THEN
        INSERT INTO acc_journal_lines (entry_id, account_code, debit, credit, description, vat_code, line_order)
        VALUES (v_entry_id, v_vat_output_code, 0, v_vat_eur,
                'TVSH dalese ' || v_rate || '%', v_rate::text, v_line_order);
        v_line_order := v_line_order + 1;
      END IF;
    END IF;
  END LOOP;

  UPDATE acc_journal_entries
     SET total_debit  = (SELECT COALESCE(SUM(debit), 0)  FROM acc_journal_lines WHERE entry_id = v_entry_id),
         total_credit = (SELECT COALESCE(SUM(credit), 0) FROM acc_journal_lines WHERE entry_id = v_entry_id)
   WHERE id = v_entry_id;

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
      (v_payment_entry, acc_get_posting_account(v_inv.company_id, 'bank', NULL, '1200'), v_gross_eur, 0,
        'Banka — pagese ' || COALESCE(v_inv.invoice_number, ''), 1),
      (v_payment_entry, acc_get_posting_account(v_inv.company_id, 'ar', NULL, '1400'), 0, v_gross_eur,
        'A/R pagese ' || COALESCE(v_inv.invoice_number, ''), 2);
  END IF;
END;
$$;

-- 5. Rewrite purchase poster to resolve via chart ----------------------------

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
  v_fallback       text;
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

    v_fallback := CASE
      WHEN v_rate = 7  THEN '3300'
      WHEN v_rate = 19 THEN '3400'
      ELSE '3550'
    END;
    v_expense_code := acc_get_posting_account(v_pur.company_id, 'expense_goods', v_rate, v_fallback);

    INSERT INTO acc_journal_lines (entry_id, account_code, debit, credit, description, vat_code, line_order)
    VALUES (v_entry_id, v_expense_code, v_net_eur, 0,
            'Blerje lendesh ' || v_rate || '%', v_rate::text, v_line_order);
    v_line_order := v_line_order + 1;

    IF v_vat_eur > 0 THEN
      v_fallback := CASE
        WHEN v_rate = 7  THEN '1571'
        WHEN v_rate = 19 THEN '1570'
        ELSE NULL
      END;
      v_vat_input_code := acc_get_posting_account(v_pur.company_id, 'vat_input', v_rate, v_fallback);
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
  VALUES (v_entry_id, acc_get_posting_account(v_pur.company_id, 'ap', NULL, '1700'), 0,
          ROUND((COALESCE(v_pur.total, 0) * v_exchange)::numeric, 2),
          'A/P ' || COALESCE(v_pur.purchase_number, ''), v_line_order);

  UPDATE acc_journal_entries
     SET total_debit  = (SELECT COALESCE(SUM(debit), 0)  FROM acc_journal_lines WHERE entry_id = v_entry_id),
         total_credit = (SELECT COALESCE(SUM(credit), 0) FROM acc_journal_lines WHERE entry_id = v_entry_id)
   WHERE id = v_entry_id;

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
      (v_payment_entry, acc_get_posting_account(v_pur.company_id, 'ap', NULL, '1700'), v_gross_eur, 0,
        'A/P pagese ' || COALESCE(v_pur.purchase_number, ''), 1),
      (v_payment_entry, acc_get_posting_account(v_pur.company_id, 'bank', NULL, '1200'), 0, v_gross_eur,
        'Banka — pagese ' || COALESCE(v_pur.purchase_number, ''), 2);
  END IF;
END;
$$;

-- 6. Re-post existing rows so lines use resolved (chart-correct) codes --------

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
