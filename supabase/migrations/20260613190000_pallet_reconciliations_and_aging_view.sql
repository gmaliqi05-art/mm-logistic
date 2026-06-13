/*
  # Saldenbestätigung foundation: reconciliations table + aging view

  Pure additive migration. No existing column, constraint or trigger
  changes. Aimed at supporting:

  - Per-partner periodic balance confirmations (Saldenbestätigung) that
    operators sign with their EPAL exchange partners.
  - A reliable "oldest unreconciled transaction date" per account so the
    UI can alarm before the §439 HGB 1-year limitation expires (German
    Handelsrecht: pallet receivables prescribe in 1 year unless restarted
    by a signed Saldenbestätigung — §212 BGB).

  ## What's added

  1. Table `pallet_reconciliations`
     One row per balance confirmation per partner. Lifecycle:
     'draft' → 'sent' → 'signed' (or 'disputed' / 'cancelled').
     A signed row restarts the limitation clock on every transaction
     dated within or before its period_end.

  2. View `public.v_pallet_account_aging`
     Read-only, security_invoker. For every `pallet_accounts` row it
     exposes:
       - The latest signed Saldenbestätigung (signed_at, confirmed_balance,
         period_end).
       - The oldest unreconciled `pallet_account_transactions` row —
         i.e. the first transaction whose date is AFTER the latest
         signed reconciliation's period_end (or any transaction if no
         signed reconciliation exists).
       - The age in days of that oldest open transaction. This is the
         number the UI compares against the 365-day threshold.

  ## Safety

  - No ALTER on existing tables.
  - No trigger added; the existing `apply_pallet_transaction()` and
    `auto_pallet_ledger_on_delivery()` triggers are untouched, so the
    ledger continues to function exactly as today.
  - RLS follows the exact pattern from pallet_accounts: company-scoped
    via `profiles.company_id = pallet_reconciliations.company_id` with a
    role check including company_admin, accountant, logistics_admin,
    depot_worker and super_admin.
  - View is security_invoker so the underlying SELECT runs through the
    pallet_accounts / pallet_account_transactions policies.
*/

CREATE TABLE IF NOT EXISTS public.pallet_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  pallet_account_id uuid NOT NULL REFERENCES public.pallet_accounts(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  confirmed_balance integer NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'signed', 'disputed', 'cancelled')),
  sent_at timestamptz,
  signed_at timestamptz,
  signed_by_name text NOT NULL DEFAULT '',
  document_url text,
  notes text NOT NULL DEFAULT '',
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start)
);

COMMENT ON TABLE public.pallet_reconciliations IS
  'Saldenbestätigung per pallet account per period. A row with status=signed restarts the §439 HGB 1-year limitation clock (per §212 BGB) on all transactions dated <= period_end.';

CREATE INDEX IF NOT EXISTS idx_pallet_recon_account
  ON public.pallet_reconciliations(pallet_account_id);
CREATE INDEX IF NOT EXISTS idx_pallet_recon_company
  ON public.pallet_reconciliations(company_id);
CREATE INDEX IF NOT EXISTS idx_pallet_recon_signed
  ON public.pallet_reconciliations(pallet_account_id, period_end DESC)
  WHERE status = 'signed';

ALTER TABLE public.pallet_reconciliations ENABLE ROW LEVEL SECURITY;

-- Read access: any active staff in the same company plus super_admin.
CREATE POLICY pallet_recon_select ON public.pallet_reconciliations
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.company_id = pallet_reconciliations.company_id
      AND p.role IN ('company_admin', 'accountant', 'logistics_admin', 'depot_worker', 'super_admin')
  ));

-- Write access: company_admin + accountant + logistics_admin + super_admin.
CREATE POLICY pallet_recon_insert ON public.pallet_reconciliations
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.company_id = pallet_reconciliations.company_id
      AND p.role IN ('company_admin', 'accountant', 'logistics_admin', 'super_admin')
  ));

CREATE POLICY pallet_recon_update ON public.pallet_reconciliations
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.company_id = pallet_reconciliations.company_id
      AND p.role IN ('company_admin', 'accountant', 'logistics_admin', 'super_admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.company_id = pallet_reconciliations.company_id
      AND p.role IN ('company_admin', 'accountant', 'logistics_admin', 'super_admin')
  ));

-- Aging view. Joins each pallet_account against the latest signed
-- reconciliation, then against the oldest transaction after that
-- reconciliation. The "oldest open" date is the §439 HGB clock start.
DROP VIEW IF EXISTS public.v_pallet_account_aging;

CREATE VIEW public.v_pallet_account_aging
WITH (security_invoker = true)
AS
SELECT
  pa.id AS pallet_account_id,
  pa.company_id,
  pa.partner_contact_id,
  pa.pallet_type,
  pa.current_balance,
  pa.last_movement_at,
  lr.signed_at        AS last_reconciled_at,
  lr.confirmed_balance AS last_reconciled_balance,
  lr.period_end       AS last_reconciled_period_end,
  ot.transaction_date AS oldest_open_txn_date,
  CASE
    WHEN ot.transaction_date IS NULL THEN NULL
    ELSE EXTRACT(DAY FROM (now() - ot.transaction_date::timestamptz))::int
  END AS oldest_open_txn_age_days
FROM public.pallet_accounts pa
LEFT JOIN LATERAL (
  SELECT signed_at, confirmed_balance, period_end
  FROM public.pallet_reconciliations
  WHERE pallet_account_id = pa.id
    AND status = 'signed'
  ORDER BY period_end DESC
  LIMIT 1
) lr ON true
LEFT JOIN LATERAL (
  SELECT transaction_date
  FROM public.pallet_account_transactions
  WHERE pallet_account_id = pa.id
    AND (lr.period_end IS NULL OR transaction_date > lr.period_end)
  ORDER BY transaction_date ASC
  LIMIT 1
) ot ON true;

COMMENT ON VIEW public.v_pallet_account_aging IS
  'Per pallet account: latest signed Saldenbestätigung + oldest unreconciled transaction date. The age in days drives the UI 1-year limitation alarm (§439 HGB).';

GRANT SELECT ON public.v_pallet_account_aging TO authenticated;
