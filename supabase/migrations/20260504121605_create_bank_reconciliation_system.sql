/*
  # Bank Reconciliation System

  1. New Tables
    - `acc_bank_statements` - imported bank statements (CAMT.053 / MT940)
    - `acc_bank_statement_lines` - individual transaction lines parsed from statements,
      with match status to `acc_transactions`
  2. Modifications
    - `acc_transactions` - add `reconciled_at`, `bank_statement_line_id`
  3. Security
    - RLS enabled, company-scoped policies for authenticated users with company access
*/

CREATE TABLE IF NOT EXISTS acc_bank_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  bank_account_id uuid NOT NULL REFERENCES acc_bank_accounts(id) ON DELETE CASCADE,
  file_name text NOT NULL DEFAULT '',
  format text NOT NULL DEFAULT 'camt053' CHECK (format IN ('camt053','mt940')),
  statement_date date,
  opening_balance numeric(18,2) DEFAULT 0,
  closing_balance numeric(18,2) DEFAULT 0,
  currency text NOT NULL DEFAULT 'EUR',
  raw_content text DEFAULT '',
  line_count integer NOT NULL DEFAULT 0,
  imported_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  imported_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_acc_bank_statements_company ON acc_bank_statements (company_id, statement_date DESC);
CREATE INDEX IF NOT EXISTS idx_acc_bank_statements_account ON acc_bank_statements (bank_account_id, statement_date DESC);

CREATE TABLE IF NOT EXISTS acc_bank_statement_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id uuid NOT NULL REFERENCES acc_bank_statements(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  bank_account_id uuid NOT NULL REFERENCES acc_bank_accounts(id) ON DELETE CASCADE,
  booking_date date,
  value_date date,
  amount numeric(18,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'EUR',
  counterparty_name text DEFAULT '',
  counterparty_iban text DEFAULT '',
  reference text DEFAULT '',
  end_to_end_id text DEFAULT '',
  description text DEFAULT '',
  matched_transaction_id uuid REFERENCES acc_transactions(id) ON DELETE SET NULL,
  match_confidence numeric(3,2) DEFAULT 0,
  match_status text NOT NULL DEFAULT 'unmatched' CHECK (match_status IN ('unmatched','suggested','confirmed','ignored')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_acc_bsl_statement ON acc_bank_statement_lines (statement_id);
CREATE INDEX IF NOT EXISTS idx_acc_bsl_company_status ON acc_bank_statement_lines (company_id, match_status);
CREATE INDEX IF NOT EXISTS idx_acc_bsl_account_date ON acc_bank_statement_lines (bank_account_id, booking_date DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acc_transactions' AND column_name = 'reconciled_at'
  ) THEN
    ALTER TABLE acc_transactions ADD COLUMN reconciled_at timestamptz;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acc_transactions' AND column_name = 'bank_statement_line_id'
  ) THEN
    ALTER TABLE acc_transactions ADD COLUMN bank_statement_line_id uuid REFERENCES acc_bank_statement_lines(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_acc_transactions_reconciled ON acc_transactions (company_id, reconciled_at) WHERE reconciled_at IS NOT NULL;

ALTER TABLE acc_bank_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE acc_bank_statement_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view statements"
  ON acc_bank_statements FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Company admins/accountants insert statements"
  ON acc_bank_statements FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM profiles
      WHERE id = auth.uid() AND role IN ('company_admin','accountant','super_admin')
    )
  );

CREATE POLICY "Company admins/accountants delete statements"
  ON acc_bank_statements FOR DELETE TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM profiles
      WHERE id = auth.uid() AND role IN ('company_admin','accountant','super_admin')
    )
  );

CREATE POLICY "Company members view statement lines"
  ON acc_bank_statement_lines FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Company admins/accountants insert statement lines"
  ON acc_bank_statement_lines FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM profiles
      WHERE id = auth.uid() AND role IN ('company_admin','accountant','super_admin')
    )
  );

CREATE POLICY "Company admins/accountants update statement lines"
  ON acc_bank_statement_lines FOR UPDATE TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM profiles
      WHERE id = auth.uid() AND role IN ('company_admin','accountant','super_admin')
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM profiles
      WHERE id = auth.uid() AND role IN ('company_admin','accountant','super_admin')
    )
  );

CREATE POLICY "Company admins/accountants delete statement lines"
  ON acc_bank_statement_lines FOR DELETE TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM profiles
      WHERE id = auth.uid() AND role IN ('company_admin','accountant','super_admin')
    )
  );

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
BEGIN
  FOR r IN
    SELECT * FROM acc_bank_statement_lines
    WHERE statement_id = p_statement_id AND match_status = 'unmatched'
  LOOP
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

    IF v_tx.id IS NULL THEN
      SELECT t.id, 0.40::numeric AS conf INTO v_tx
      FROM acc_transactions t
      WHERE t.company_id = r.company_id
        AND t.amount = r.amount
        AND t.currency = r.currency
        AND t.reconciled_at IS NULL
        AND (t.transaction_date BETWEEN (r.booking_date - 3) AND (r.booking_date + 3))
      LIMIT 1;
    END IF;

    IF v_tx.id IS NOT NULL THEN
      UPDATE acc_bank_statement_lines
      SET matched_transaction_id = v_tx.id,
          match_confidence = v_tx.conf,
          match_status = 'suggested'
      WHERE id = r.id;
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.suggest_bank_matches(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.suggest_bank_matches(uuid) TO authenticated, service_role;
