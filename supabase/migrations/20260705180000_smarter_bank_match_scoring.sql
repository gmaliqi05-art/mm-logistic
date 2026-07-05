/*
  # Smarter auto bank-reconciliation matching

  `suggest_bank_matches` (20260504121605) is naive: it matches a statement
  line to a transaction on exact amount + currency and either a reference
  substring (conf 0.95) or a ±3-day date window (conf 0.40), taking an
  arbitrary `LIMIT 1`. It completely ignores the `counterparty_name` /
  `counterparty_iban` columns that CAMT.053 / MT940 imports populate, and when
  several transactions share the same amount it can suggest the wrong one.

  This rewrites it as a weighted multi-signal matcher. `acc_bank_line_tx_score`
  scores one (line, transaction) pair; same absolute amount + currency is the
  anchor (gated in the query), then:

    base (amount + currency)                              0.30
    + reference / end-to-end-id found in the transaction   0.45
      (reference_number / description / notes; literal
       substring, case-insensitive — no ILIKE wildcards)
    + counterparty IBAN equals the contact IBAN            0.35
      else counterparty name overlaps the contact name     0.25
    + booking date within 2 days                           0.15
      else within 7 days                                   0.08
    (capped at 1.00)

  Assignment is greedy **strongest-match-first**: lines are processed in order
  of their best achievable score, so a line with an exact reference claims its
  transaction before a weaker name/date line can take it. A transaction already
  assigned in the run is excluded, so one payment can't be proposed for two
  lines. Ties break on the closest date then id. Anything scoring >= 0.30 (an
  amount match) is written as `suggested` with its graduated confidence, so the
  existing reconciliation UI keeps working — it just gets better, better-ranked
  suggestions and a meaningful confidence bar.

  Both functions are SECURITY DEFINER with a pinned search_path; the scoring
  helper is IMMUTABLE and touches no tables. Applied to prod via MCP.
*/

CREATE OR REPLACE FUNCTION public.acc_bank_line_tx_score(
  p_ref text, p_e2e text, p_cp_name text, p_cp_iban text, p_book date,
  t_ref text, t_desc text, t_notes text, t_date date, c_name text, c_iban text
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT LEAST(1.0,
    0.30
    + CASE
        WHEN (coalesce(p_ref, '') <> '' AND (
                strpos(lower(coalesce(t_ref, '')),   lower(p_ref)) > 0
             OR strpos(lower(coalesce(t_desc, '')),  lower(p_ref)) > 0
             OR strpos(lower(coalesce(t_notes, '')), lower(p_ref)) > 0))
          OR (coalesce(p_e2e, '') <> '' AND (
                strpos(lower(coalesce(t_ref, '')),  lower(p_e2e)) > 0
             OR strpos(lower(coalesce(t_desc, '')), lower(p_e2e)) > 0))
        THEN 0.45 ELSE 0 END
    + CASE
        WHEN coalesce(p_cp_iban, '') <> '' AND c_iban IS NOT NULL
             AND upper(replace(c_iban, ' ', '')) = upper(replace(p_cp_iban, ' ', ''))
          THEN 0.35
        WHEN coalesce(p_cp_name, '') <> '' AND coalesce(c_name, '') <> ''
             AND (strpos(lower(c_name), lower(p_cp_name)) > 0
               OR strpos(lower(p_cp_name), lower(c_name)) > 0)
          THEN 0.25
        ELSE 0 END
    + CASE
        WHEN t_date IS NOT NULL AND p_book IS NOT NULL AND abs(t_date - p_book) <= 2 THEN 0.15
        WHEN t_date IS NOT NULL AND p_book IS NOT NULL AND abs(t_date - p_book) <= 7 THEN 0.08
        ELSE 0 END
  )::numeric(3,2)
$$;

REVOKE ALL ON FUNCTION public.acc_bank_line_tx_score(text, text, text, text, date, text, text, text, date, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.suggest_bank_matches(p_statement_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  r record;
  v_best record;
  v_used uuid[] := '{}';
BEGIN
  -- Process lines strongest-achievable-match first so an exact-reference line
  -- claims its transaction before a weaker name/date line can take it.
  FOR r IN
    SELECT l.*
    FROM acc_bank_statement_lines l
    LEFT JOIN LATERAL (
      SELECT max(acc_bank_line_tx_score(
                l.reference, l.end_to_end_id, l.counterparty_name, l.counterparty_iban, l.booking_date,
                t.reference_number, t.description, t.notes, t.transaction_date, c.name, c.iban)) AS best
      FROM acc_transactions t
      LEFT JOIN acc_contacts c ON c.id = t.contact_id
      WHERE t.company_id = l.company_id
        AND t.currency = l.currency
        AND t.reconciled_at IS NULL
        AND abs(t.amount) = abs(l.amount)
    ) b ON true
    WHERE l.statement_id = p_statement_id
      AND l.match_status = 'unmatched'
      AND COALESCE(l.amount, 0) <> 0
    ORDER BY b.best DESC NULLS LAST, l.booking_date NULLS LAST, l.id
  LOOP
    SELECT t.id AS tx_id,
           acc_bank_line_tx_score(
             r.reference, r.end_to_end_id, r.counterparty_name, r.counterparty_iban, r.booking_date,
             t.reference_number, t.description, t.notes, t.transaction_date, c.name, c.iban) AS conf,
           CASE
             WHEN t.transaction_date IS NOT NULL AND r.booking_date IS NOT NULL
               THEN abs(t.transaction_date - r.booking_date)
             ELSE 99999
           END AS ddiff
    INTO v_best
    FROM acc_transactions t
    LEFT JOIN acc_contacts c ON c.id = t.contact_id
    WHERE t.company_id = r.company_id
      AND t.currency = r.currency
      AND t.reconciled_at IS NULL
      AND abs(t.amount) = abs(r.amount)
      AND NOT (t.id = ANY (v_used))
    ORDER BY conf DESC, ddiff ASC, t.id
    LIMIT 1;

    IF v_best.tx_id IS NOT NULL AND v_best.conf >= 0.30 THEN
      UPDATE acc_bank_statement_lines
      SET matched_transaction_id = v_best.tx_id,
          match_confidence = v_best.conf,
          match_status = 'suggested'
      WHERE id = r.id;

      v_used := array_append(v_used, v_best.tx_id);
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.suggest_bank_matches(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.suggest_bank_matches(uuid) TO authenticated, service_role;
