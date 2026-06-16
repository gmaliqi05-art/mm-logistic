/*
  # L3: Tighten suggest_bank_matches fallback to avoid false positives

  ## Why
  General-audit Wave 3 L3. supabase/migrations/20260504121605_
  create_bank_reconciliation_system.sql shipped a two-tier
  `suggest_bank_matches(p_statement_id)`:

    1. High-confidence (0.95): amount + currency + at least one
       string match in `description` against `reference` or
       `end_to_end_id`.
    2. Fallback (0.40): amount + currency + booking_date within
       ±3 days. *No string discriminator at all.*

  On a high-volume account that runs the same round figures
  daily — €5 000 payroll runs, €1 000 supplier instalments,
  monthly rent — the fallback matches the WRONG transaction.
  Even worse, when several `acc_transactions` qualify the
  `LIMIT 1` picks one arbitrarily and stamps it as a
  suggested match without flagging the ambiguity. The
  operator then accepts the suggestion in the reconciliation
  UI and the wrong invoice ends up marked paid.

  ## What this ships
  Two changes inside the fallback branch:

    1. **Require a second signal.** The fallback now demands a
       case-insensitive match between `r.counterparty_name`
       (populated by import-bank-statement from the SEPA
       counterparty name) AND either the transaction
       description OR the linked `acc_contacts.name`. Pure
       amount + date + currency is no longer enough.

       Lines without a counterparty_name (rare — only when the
       bank's payload omits :NM:) skip the fallback entirely.
       That's intentional: an unsigned amount with no party
       attribution is exactly the kind of line the operator
       must look at by hand.

    2. **Skip on ambiguity.** When more than one
       `acc_transactions` row satisfies the tightened fallback,
       leave the bank line as `unmatched`. Auto-suggesting a
       50/50 guess is worse than suggesting nothing: it primes
       the operator to accept the wrong one. The UI already
       renders unmatched rows in red so the operator picks
       manually.

  Confidence label for the fallback bumped from 0.40 → 0.55
  to reflect the extra discriminator. The UI badge thresholds
  (≥ 0.7 = green, ≥ 0.5 = amber, < 0.5 = red) stay as-is, so
  this row still renders amber.

  High-confidence (0.95) tier is unchanged — it's already
  defensible because it requires a string match.

  ## Safety
  - Pure logic change inside the RPC. No data migration.
  - acc_bank_statement_lines.counterparty_name is populated by
    import-bank-statement for SEPA / MT940 payloads; when null
    the new check produces no match.
  - Idempotent: CREATE OR REPLACE.
  - Prod has 0 statements with auto-suggested matches today;
    rollout is forward-looking.
*/

CREATE OR REPLACE FUNCTION public.suggest_bank_matches(p_statement_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  r record;
  v_tx record;
  v_cp_name text;
  v_ambig_count integer;
BEGIN
  FOR r IN
    SELECT * FROM acc_bank_statement_lines
    WHERE statement_id = p_statement_id AND match_status = 'unmatched'
  LOOP
    -- High-confidence: amount + currency + a string match in the
    -- description against the SEPA reference or end-to-end id.
    SELECT t.id, 0.95::numeric AS conf INTO v_tx
    FROM acc_transactions t
    WHERE t.company_id = r.company_id
      AND t.amount = r.amount
      AND t.currency = r.currency
      AND t.reconciled_at IS NULL
      AND (
        (r.reference <> '' AND t.description ILIKE '%' || r.reference || '%')
        OR (r.end_to_end_id <> '' AND t.description ILIKE '%' || r.end_to_end_id || '%')
      )
    LIMIT 1;

    -- Fallback (audit L3): require a counterparty_name signal AND
    -- check for ambiguity. Pure amount + date + currency is no
    -- longer enough; when several candidates qualify we leave the
    -- line unmatched so the operator picks manually rather than
    -- accept a 50/50 guess.
    IF v_tx.id IS NULL THEN
      v_cp_name := NULLIF(trim(COALESCE(r.counterparty_name, '')), '');
      IF v_cp_name IS NOT NULL THEN
        SELECT count(*) INTO v_ambig_count
        FROM acc_transactions t
        WHERE t.company_id = r.company_id
          AND t.amount = r.amount
          AND t.currency = r.currency
          AND t.reconciled_at IS NULL
          AND (t.transaction_date BETWEEN (r.booking_date - 3) AND (r.booking_date + 3))
          AND (
            t.description ILIKE '%' || v_cp_name || '%'
            OR EXISTS (
              SELECT 1 FROM acc_contacts c
               WHERE c.id = t.contact_id
                 AND c.name ILIKE '%' || v_cp_name || '%'
            )
          );

        IF v_ambig_count = 1 THEN
          SELECT t.id, 0.55::numeric AS conf INTO v_tx
          FROM acc_transactions t
          WHERE t.company_id = r.company_id
            AND t.amount = r.amount
            AND t.currency = r.currency
            AND t.reconciled_at IS NULL
            AND (t.transaction_date BETWEEN (r.booking_date - 3) AND (r.booking_date + 3))
            AND (
              t.description ILIKE '%' || v_cp_name || '%'
              OR EXISTS (
                SELECT 1 FROM acc_contacts c
                 WHERE c.id = t.contact_id
                   AND c.name ILIKE '%' || v_cp_name || '%'
              )
            )
          LIMIT 1;
        END IF;
      END IF;
    END IF;

    IF v_tx.id IS NOT NULL THEN
      UPDATE acc_bank_statement_lines
      SET matched_transaction_id = v_tx.id,
          match_confidence = v_tx.conf,
          match_status = 'suggested',
          updated_at = now()
      WHERE id = r.id;
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;
