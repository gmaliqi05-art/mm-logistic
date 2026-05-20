-- ============================================================================
-- Initialise accounting defaults when a company turns the add-on on
-- ----------------------------------------------------------------------------
-- Background
--   `companies.accounting_enabled` is the single flag that gates the
--   /accounting routes (see AccountingRoute.tsx). It can flip from
--   false to true via two paths:
--     - stripe-webhook on a successful add-on checkout
--     - AccountingUpgradeModal direct activation (free / manual cases)
--
--   Neither path seeds anything. The first time the accountant lands
--   on the dashboard they see empty acc_expense_categories, no bank
--   account on file, and no current-year invoice sequence — so creating
--   the first invoice in InvoiceBuilder requires them to first manually
--   create a bank account, otherwise the invoice "Send" path fails
--   (sendErr because bank_account_id NOT NULL on send).
--
-- What this migration does
--   1. initialize_company_accounting(company_id, default_currency)
--      A SECURITY DEFINER function that idempotently seeds:
--        - Six basic acc_expense_categories (Personnel, Vehicles &
--          fuel, Office, Insurance, Rent & utilities, Other) using
--          ON CONFLICT-equivalent guards so re-running is safe
--        - One invoice_sequences row for the current year if the
--          company doesn't have one yet (prefix INV-, starting at 0)
--
--      Deliberately does NOT create a bank account or a fixed default
--      VAT rate: those are business decisions the accountant must
--      make and the UI already prompts them in AccSettings.
--
--   2. on_accounting_enabled() AFTER UPDATE OF accounting_enabled
--      trigger on companies. Fires only on the false -> true transition
--      and calls initialize_company_accounting with the company's
--      country-derived currency (EUR fallback).
--
--   3. One-time backfill at the bottom: any company that already has
--      accounting_enabled = true but no expense_categories rows gets
--      the same seed retroactively. Idempotent — re-running this
--      migration does nothing on a second run.
--
-- Safety
--   - SECURITY DEFINER + fixed search_path, the standard pattern in
--     this codebase.
--   - Every INSERT is guarded by a NOT EXISTS subquery, so the seed
--     is genuinely idempotent. No duplicate rows on re-runs.
--   - The trigger swallows exceptions: a failed seed must not block
--     the original UPDATE that flipped the flag.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.initialize_company_accounting(
  p_company_id uuid,
  p_default_currency text DEFAULT 'EUR'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year integer;
BEGIN
  IF p_company_id IS NULL THEN
    RETURN;
  END IF;

  -- Expense categories (six basics that cover the bulk of German SME spend)
  INSERT INTO acc_expense_categories (company_id, name, description, category_type)
  SELECT p_company_id, n, d, 'expense'
  FROM (VALUES
    ('Personeli', 'Pagat dhe sigurimet sociale'),
    ('Mjete & karburant', 'Karburanti, mirembajtja, leasing'),
    ('Zyra & administrate', 'Telefoni, internet, materiale zyre'),
    ('Sigurime', 'Sigurime te biznesit dhe te transportit'),
    ('Qira & shpenzime ndihmese', 'Qira e zyres / depos, energji, uje'),
    ('Te tjera', 'Shpenzime te tjera operacionale')
  ) AS x(n, d)
  WHERE NOT EXISTS (
    SELECT 1 FROM acc_expense_categories e
    WHERE e.company_id = p_company_id AND e.name = x.n
  );

  -- One income category — needed for received-payment categorisation
  INSERT INTO acc_expense_categories (company_id, name, description, category_type)
  SELECT p_company_id, 'Te ardhura te tjera', 'Interesi i depozitave, te tjera', 'income'
  WHERE NOT EXISTS (
    SELECT 1 FROM acc_expense_categories e
    WHERE e.company_id = p_company_id AND e.name = 'Te ardhura te tjera'
  );

  -- Current-year invoice sequence so the first finalise-and-send works
  v_year := EXTRACT(YEAR FROM CURRENT_DATE)::integer;
  INSERT INTO acc_invoice_sequences (company_id, prefix, year, current_number)
  SELECT p_company_id, 'INV-', v_year, 0
  WHERE NOT EXISTS (
    SELECT 1 FROM acc_invoice_sequences s
    WHERE s.company_id = p_company_id AND s.prefix = 'INV-' AND s.year = v_year
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.initialize_company_accounting(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.initialize_company_accounting(uuid, text) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Trigger: fires on the false -> true transition of accounting_enabled
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.on_accounting_enabled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_currency text;
BEGIN
  IF NEW.accounting_enabled = true AND (OLD.accounting_enabled IS DISTINCT FROM true) THEN
    BEGIN
      -- Pull a sensible default currency from the company's country, if any
      SELECT COALESCE(c.currency, 'EUR') INTO v_currency
      FROM companies co
      LEFT JOIN eu_countries c ON c.code = co.country
      WHERE co.id = NEW.id
      LIMIT 1;

      PERFORM public.initialize_company_accounting(NEW.id, COALESCE(v_currency, 'EUR'));
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'on_accounting_enabled init failed: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.on_accounting_enabled() FROM public;

DROP TRIGGER IF EXISTS trg_on_accounting_enabled ON companies;
CREATE TRIGGER trg_on_accounting_enabled
AFTER UPDATE OF accounting_enabled ON companies
FOR EACH ROW EXECUTE FUNCTION public.on_accounting_enabled();

-- ----------------------------------------------------------------------------
-- One-time backfill for companies that already have accounting_enabled = true
-- but missing the default seed (i.e. they enabled accounting before this
-- migration shipped). Idempotent because initialize_company_accounting
-- uses NOT EXISTS guards.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  rec RECORD;
  v_currency text;
BEGIN
  FOR rec IN
    SELECT co.id, co.country
    FROM companies co
    WHERE co.accounting_enabled = true
  LOOP
    SELECT COALESCE(c.currency, 'EUR') INTO v_currency
    FROM eu_countries c WHERE c.code = rec.country LIMIT 1;
    PERFORM public.initialize_company_accounting(rec.id, COALESCE(v_currency, 'EUR'));
  END LOOP;
END $$;
