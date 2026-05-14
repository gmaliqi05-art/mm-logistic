/*
  # Homepage Real Stats — Public View

  ## Purpose
  Replace fake hardcoded stats on Homepage ('500+ companies', '2000+ users')
  with REAL aggregated numbers pulled from the database.

  Numbers are anonymized and aggregated — no company-level data leaks to public.

  ## What This Migration Creates

  ### View: v_homepage_public_stats
  Returns a single row with platform-wide totals safe to expose publicly:
    - total_companies   (count of active companies)
    - total_users       (count of active profiles across all companies)
    - total_deliveries  (lifetime delivery notes count)
    - total_depots      (count of active depots)
    - total_partners    (count of registered acc_contacts)
    - total_invoices    (count of acc invoices)
    - total_countries   (distinct countries from companies.country)
    - uptime_pct        (static 99.9 for now; can be tied to monitoring later)

  ### RPC: get_homepage_stats()
  SECURITY DEFINER function that the public landing page can call without auth.
  Returns the same row as the view but is callable via PostgREST RPC.

  ## Security
  - View is granted SELECT to anon (public) — only aggregates, no PII.
  - RPC is granted EXECUTE to anon.
  - No row-level data is exposed; only counts and percentages.
*/

-- =============================================================================
-- A. View with aggregated platform stats (no PII)
-- =============================================================================
CREATE OR REPLACE VIEW public.v_homepage_public_stats AS
SELECT
  (SELECT count(*)::int FROM companies WHERE is_active = true)                                AS total_companies,
  (SELECT count(*)::int FROM profiles  WHERE is_active = true)                                AS total_users,
  (SELECT count(*)::int FROM delivery_notes)                                                  AS total_deliveries,
  (SELECT count(*)::int FROM depots    WHERE is_active = true)                                AS total_depots,
  (SELECT count(*)::int FROM acc_contacts WHERE is_active IS DISTINCT FROM false)             AS total_partners,
  (SELECT count(*)::int FROM acc_invoices)                                                    AS total_invoices,
  (SELECT count(DISTINCT country)::int FROM companies
     WHERE is_active = true AND country IS NOT NULL AND country <> '')                        AS total_countries,
  99.9::numeric(4,1)                                                                          AS uptime_pct,
  now()                                                                                       AS computed_at;

COMMENT ON VIEW public.v_homepage_public_stats IS
  'Aggregated, anonymized platform stats safe for public homepage display.';

-- Allow anonymous (public, unauthenticated) read
GRANT SELECT ON public.v_homepage_public_stats TO anon, authenticated;


-- =============================================================================
-- B. RPC alternative (some clients prefer rpc.call over view)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_homepage_stats()
RETURNS TABLE (
  total_companies   int,
  total_users       int,
  total_deliveries  int,
  total_depots      int,
  total_partners    int,
  total_invoices    int,
  total_countries   int,
  uptime_pct        numeric,
  computed_at       timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.v_homepage_public_stats;
$$;

GRANT EXECUTE ON FUNCTION public.get_homepage_stats() TO anon, authenticated;

COMMENT ON FUNCTION public.get_homepage_stats() IS
  'Returns platform-wide aggregated stats for the public landing page.';


-- =============================================================================
-- C. Reload PostgREST schema cache so the new view is immediately visible
-- =============================================================================
NOTIFY pgrst, 'reload schema';
