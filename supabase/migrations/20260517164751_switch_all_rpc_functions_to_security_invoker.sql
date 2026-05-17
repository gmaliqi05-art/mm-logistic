/*
  # Switch all RPC functions from SECURITY DEFINER to SECURITY INVOKER

  1. Changes
    - All 10 user-facing RPC functions switched to SECURITY INVOKER
    - get_homepage_stats replaced with a public cache table + refresh function
    - RLS on the cache table allows anon SELECT
    - Functions retain their existing auth.uid() guards

  2. Approach for get_homepage_stats
    - Create homepage_stats_cache table with single row
    - Allow anon to SELECT from it
    - Refresh via a SECURITY DEFINER function only callable by service_role
    - The public-facing function simply reads the cache (SECURITY INVOKER)

  3. Security improvements
    - No SECURITY DEFINER function is callable by anon or authenticated
    - All RPC logic runs under the caller's RLS context
    - Company-scoped RLS policies enforce data isolation
*/

-- ============================================================
-- 1. Homepage stats: replace SECURITY DEFINER with cache table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.homepage_stats_cache (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  total_companies integer NOT NULL DEFAULT 0,
  total_users integer NOT NULL DEFAULT 0,
  total_deliveries integer NOT NULL DEFAULT 0,
  total_depots integer NOT NULL DEFAULT 0,
  total_partners integer NOT NULL DEFAULT 0,
  total_invoices integer NOT NULL DEFAULT 0,
  total_countries integer NOT NULL DEFAULT 0,
  uptime_pct numeric(4,1) NOT NULL DEFAULT 99.9,
  computed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.homepage_stats_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read homepage stats cache"
  ON public.homepage_stats_cache
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Seed initial row
INSERT INTO homepage_stats_cache (id, total_companies, total_users, total_deliveries, total_depots, total_partners, total_invoices, total_countries, uptime_pct, computed_at)
VALUES (true, 0, 0, 0, 0, 0, 0, 0, 99.9, now())
ON CONFLICT (id) DO NOTHING;

-- Internal refresh function (only service_role can call)
CREATE OR REPLACE FUNCTION private.refresh_homepage_stats_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE homepage_stats_cache SET
    total_companies = (SELECT count(*)::integer FROM companies WHERE is_active = true),
    total_users = (SELECT count(*)::integer FROM profiles WHERE is_active = true),
    total_deliveries = (SELECT count(*)::integer FROM delivery_notes),
    total_depots = (SELECT count(*)::integer FROM depots WHERE is_active = true),
    total_partners = (SELECT count(*)::integer FROM acc_contacts WHERE is_active IS DISTINCT FROM false),
    total_invoices = (SELECT count(*)::integer FROM acc_invoices),
    total_countries = (SELECT count(DISTINCT country)::integer FROM companies WHERE is_active = true AND country IS NOT NULL AND country <> ''),
    uptime_pct = 99.9,
    computed_at = now()
  WHERE id = true;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.refresh_homepage_stats_cache() FROM public, anon, authenticated;

-- Refresh the cache now
SELECT private.refresh_homepage_stats_cache();

-- Drop old SECURITY DEFINER version of get_homepage_stats
DROP FUNCTION IF EXISTS public.get_homepage_stats();

-- New get_homepage_stats as SECURITY INVOKER reading from cache
CREATE FUNCTION public.get_homepage_stats()
RETURNS TABLE(
  total_companies integer,
  total_users integer,
  total_deliveries integer,
  total_depots integer,
  total_partners integer,
  total_invoices integer,
  total_countries integer,
  uptime_pct numeric,
  computed_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT total_companies, total_users, total_deliveries, total_depots,
         total_partners, total_invoices, total_countries, uptime_pct, computed_at
  FROM homepage_stats_cache
  WHERE id = true;
$$;

GRANT EXECUTE ON FUNCTION public.get_homepage_stats() TO anon, authenticated;

-- ============================================================
-- 2. Switch RPC functions to SECURITY INVOKER
-- ============================================================

-- apply_repair_completion
ALTER FUNCTION public.apply_repair_completion(uuid, integer, integer, uuid)
  SECURITY INVOKER;

-- auto_register_counterparty
ALTER FUNCTION public.auto_register_counterparty(uuid)
  SECURITY INVOKER;

-- claim_trailer_load
ALTER FUNCTION public.claim_trailer_load(uuid)
  SECURITY INVOKER;

-- create_invoice_from_delivery_note
ALTER FUNCTION public.create_invoice_from_delivery_note(uuid)
  SECURITY INVOKER;

-- create_invoice_with_stock_deduction
ALTER FUNCTION public.create_invoice_with_stock_deduction(uuid)
  SECURITY INVOKER;

-- driver_complete_quick_draft
ALTER FUNCTION public.driver_complete_quick_draft(uuid, text, jsonb)
  SECURITY INVOKER;

-- match_counterparty_company
ALTER FUNCTION public.match_counterparty_company(text, text, text, text)
  SECURITY INVOKER;

-- match_supplier_invoice_candidates
ALTER FUNCTION public.match_supplier_invoice_candidates(uuid, uuid, text, date, numeric, integer)
  SECURITY INVOKER;

-- reassign_trailer_load
ALTER FUNCTION public.reassign_trailer_load(uuid, uuid)
  SECURITY INVOKER;

-- remove_delivery_note_item
ALTER FUNCTION public.remove_delivery_note_item(uuid)
  SECURITY INVOKER;
