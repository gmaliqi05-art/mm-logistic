/*
  # EPAL quality classification view + helper functions

  Pure read-only additions — no tables, columns or constraints change.
  Operational queries that filter by `condition` keep working exactly as
  before. This migration adds a single source of truth for mapping
  between the operational vocabulary on `depot_stock`/`stock_movements`
  and the EPAL classes used on `pallet_account_transactions`.

  ## What's added

  1. `public.epal_quality_class_for_condition(text) RETURNS text`
     IMMUTABLE function that mirrors the TypeScript helper
     `qualityClassFor()` in `src/utils/epalClassification.ts`. Used by
     the view below and available for ad-hoc reporting queries.

  2. `public.epal_is_exchangeable(text) RETURNS boolean`
     IMMUTABLE function — equivalent of the TS `isExchangeable()`.

  3. View `public.v_stock_quality_class` that exposes every
     `depot_stock` row with two derived columns: `quality_class` and
     `exchangeable`. Joins on company_id and is RLS-friendly (the
     underlying SELECT goes through the `stock` policies).

  ## What is NOT touched

  - No CHECK constraint on `stock.condition` is changed.
  - No trigger logic is changed.
  - No existing column is renamed.
  - Pallet account transactions keep their separate A/B/C/Defekt
    constraint (the v_stock_quality_class view's `quality_class` column
    uses the SUPERSET vocabulary NEU/A/B/C/UNSORTED/REPAIR_NEEDED/SCRAP
    so it can describe both worlds).

  ## Safety

  Functions are CREATE OR REPLACE so re-running is idempotent. The view
  is also drop-and-recreate so a later migration can extend the column
  list safely.
*/

CREATE OR REPLACE FUNCTION public.epal_quality_class_for_condition(p_condition text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE p_condition
    WHEN 'good' THEN 'UNSORTED'
    WHEN 'repaired' THEN 'B'
    WHEN 'damaged' THEN 'REPAIR_NEEDED'
    WHEN 'sorting' THEN 'UNSORTED'
    WHEN 'sorting_pending' THEN 'UNSORTED'
    ELSE NULL
  END;
$$;

COMMENT ON FUNCTION public.epal_quality_class_for_condition(text) IS
  'Maps operational stock condition (good/damaged/repaired/sorting/sorting_pending) to default EPAL quality class. Mirrors src/utils/epalClassification.ts qualityClassFor().';

CREATE OR REPLACE FUNCTION public.epal_is_exchangeable(p_condition text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT p_condition IN ('good', 'repaired');
$$;

COMMENT ON FUNCTION public.epal_is_exchangeable(text) IS
  'Tauschfähig predicate per EPAL open-pool default rules. Mirrors src/utils/epalClassification.ts isExchangeable().';

DROP VIEW IF EXISTS public.v_stock_quality_class;

CREATE VIEW public.v_stock_quality_class
WITH (security_invoker = true)
AS
SELECT
  s.id,
  s.company_id,
  s.depot_id,
  s.category_id,
  s.category_product_id,
  s.quantity,
  s.condition,
  public.epal_quality_class_for_condition(s.condition) AS quality_class,
  public.epal_is_exchangeable(s.condition) AS exchangeable,
  s.updated_at,
  s.created_at
FROM public.stock s;

COMMENT ON VIEW public.v_stock_quality_class IS
  'Read-only view that adds EPAL quality_class + exchangeable derived columns to every stock row. RLS-friendly via security_invoker=true.';

GRANT SELECT ON public.v_stock_quality_class TO authenticated;
