-- ============================================================================
-- Consolidate duplicate SELECT policies on public CMS tables
-- ----------------------------------------------------------------------------
-- Supabase performance advisor (multiple_permissive_policies) flagged
-- footer_links, homepage_content, static_pages, and subscription_plans
-- as having two permissive SELECT policies each:
--   1. "Public can view active <X>" — (is_active = true) for anon+authenticated
--   2. "Super admins can view all <X>" — is_super_admin*() for authenticated
--
-- For every authenticated row scan, Postgres evaluates BOTH policies and
-- ORs the results. Merging into a single policy with the OR baked into
-- USING removes the duplicate evaluation. Behaviour is unchanged:
-- anon sees only active rows, authenticated sees active rows OR all
-- rows when super_admin.
--
-- The previous migration 20260522122251_consolidate_multiple_permissive_policies
-- missed these four tables because they sit in the "public CMS" area
-- (homepage, plans, legal) rather than the tenant-scoped tables it
-- focused on.
-- ============================================================================

-- footer_links
DROP POLICY IF EXISTS "Public can view active footer links"  ON public.footer_links;
DROP POLICY IF EXISTS "Super admins can view all footer links" ON public.footer_links;
CREATE POLICY "View footer links"
  ON public.footer_links
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true OR private.is_super_admin_safe());

-- homepage_content
DROP POLICY IF EXISTS "Public can view active homepage content"  ON public.homepage_content;
DROP POLICY IF EXISTS "Super admins can view all homepage content" ON public.homepage_content;
CREATE POLICY "View homepage content"
  ON public.homepage_content
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true OR private.is_super_admin_safe());

-- static_pages
DROP POLICY IF EXISTS "Public can view active static pages"  ON public.static_pages;
DROP POLICY IF EXISTS "Super admins can view all static pages" ON public.static_pages;
CREATE POLICY "View static pages"
  ON public.static_pages
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true OR private.is_super_admin_safe());

-- subscription_plans uses private.is_super_admin() (not the _safe variant)
DROP POLICY IF EXISTS "Public can view active plans"  ON public.subscription_plans;
DROP POLICY IF EXISTS "Super admins can view all plans" ON public.subscription_plans;
CREATE POLICY "View subscription plans"
  ON public.subscription_plans
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true OR private.is_super_admin());
