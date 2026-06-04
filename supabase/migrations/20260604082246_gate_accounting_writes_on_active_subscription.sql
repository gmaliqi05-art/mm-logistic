-- Gate writes to accounting tables on the company actually having paid for
-- accounting. Until now, RLS only enforced tenant isolation (`company_id =
-- get_user_company_id()`) on the acc_* tables. A tenant whose subscription
-- expired, was cancelled, or who never paid for accounting could still INSERT
-- / UPDATE / DELETE rows via PostgREST directly — the React app blocked them
-- in the UI (AccountingRoute), but the database was wide open.
--
-- Approach: a single guard function + BEFORE trigger on every revenue-bearing
-- accounting table. The function is cheap (two indexed lookups) and:
--   * lets service_role and super_admin through unconditionally
--   * blocks writes when companies.accounting_enabled = false
--   * blocks writes when no company_subscriptions row exists in status
--     IN ('active', 'trial') with non-expired current_period_end / trial_end
--
-- Reads (SELECT) are intentionally NOT gated — a tenant who lost their
-- accounting access should still be able to view their historical invoices.

CREATE OR REPLACE FUNCTION private.has_active_accounting(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = p_company_id
      AND c.accounting_enabled = true
  )
  AND EXISTS (
    SELECT 1
    FROM public.company_subscriptions cs
    WHERE cs.company_id = p_company_id
      AND cs.status IN ('active', 'trial')
      AND (
        (cs.status = 'active' AND (cs.current_period_end IS NULL OR cs.current_period_end > now()))
        OR (cs.status = 'trial' AND (cs.trial_end IS NULL OR cs.trial_end > now()))
      )
  );
$$;

COMMENT ON FUNCTION private.has_active_accounting IS
  'Returns true when the company both has the accounting feature flag enabled and an active/trial subscription that has not expired. Used by the acc_* write-guard triggers.';

CREATE OR REPLACE FUNCTION public.guard_accounting_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_company_id uuid;
  v_role text;
BEGIN
  -- Service role bypasses (edge functions like sync-accounting,
  -- generate-invoice-pdf, etc. need to operate on locked-out companies too
  -- for cleanup / historical exports).
  IF auth.uid() IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_role := private.get_user_role();
  IF v_role = 'super_admin' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Determine which company_id this row touches. Most acc_* tables expose
  -- company_id directly; for the few that don't, the child trigger on the
  -- parent table will fire instead, so we just no-op when the column is
  -- missing from the row.
  BEGIN
    v_company_id := COALESCE(NEW.company_id, OLD.company_id);
  EXCEPTION WHEN undefined_column THEN
    RETURN COALESCE(NEW, OLD);
  END;

  IF v_company_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF NOT private.has_active_accounting(v_company_id) THEN
    RAISE EXCEPTION 'Aksesi i kontabilitetit nuk eshte aktiv; kontaktoni administratorin per te aktivizuar abonimin.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION public.guard_accounting_write IS
  'BEFORE INSERT/UPDATE/DELETE trigger on acc_* tables. Blocks writes when the calling user is a tenant member of a company without active accounting access. Service role and super_admin are exempt.';

-- Attach to every revenue-bearing accounting table. Reference data tables
-- (acc_chart_of_accounts, acc_customs_tariffs, acc_expense_categories,
-- acc_product_categories) are intentionally NOT gated so config can be
-- prepared before activation. acc_audit_log is service-role-only already.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'acc_bank_accounts',
    'acc_bank_statement_lines',
    'acc_bank_statements',
    'acc_client_prices',
    'acc_contacts',
    'acc_delivery_note_items',
    'acc_delivery_notes',
    'acc_fixed_assets',
    'acc_import_items',
    'acc_imports',
    'acc_invoice_items',
    'acc_invoice_reminders',
    'acc_invoice_sequences',
    'acc_invoice_templates',
    'acc_invoices',
    'acc_journal_entries',
    'acc_journal_lines',
    'acc_products',
    'acc_purchase_items',
    'acc_purchases',
    'acc_scanned_documents',
    'acc_stock_movements',
    'acc_transactions'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS guard_accounting_write ON public.%I', t);
      EXECUTE format(
        'CREATE TRIGGER guard_accounting_write BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_accounting_write()',
        t
      );
    END IF;
  END LOOP;
END$$;
