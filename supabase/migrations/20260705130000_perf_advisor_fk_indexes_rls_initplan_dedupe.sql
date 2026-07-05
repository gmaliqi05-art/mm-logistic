/*
  # Performance-advisor fixes (applied to prod via MCP; recorded here)

  From the Supabase performance advisor. The 174 `unused_index` findings are
  deliberately NOT touched — they are expected on a young/low-traffic DB and
  many belong to not-yet-exercised features. These are the actionable ones:

  1. `unindexed_foreign_keys`: add covering indexes on
     `admin_subscription_actions.subscription_id` and
     `pallet_reconciliations.created_by`.

  2. `duplicate_index`: `pallet_sorting_batches` had two identical unique
     indexes on `(source_item_id) WHERE source_item_id IS NOT NULL`; drop one.
     `ON CONFLICT` matches by columns+predicate (not name), so the surviving
     index still serves the upsert in process_delivery_note_stock.

  3. `auth_rls_initplan`: wrap raw `auth.uid()` calls in a scalar subselect so
     they evaluate once per statement rather than once per row. This is a
     semantics-preserving rewrite (a scalar subselect returning auth.uid()
     equals auth.uid()); the surrounding predicates are reproduced verbatim.
     Policies: stripe_webhook_events / email_verification_codes super-admin
     read, and delivery_notes `dnotes_update`.

  4. `multiple_permissive_policies`: subscription_plans had two permissive
     SELECT policies for `authenticated`. Split by role so each role has
     exactly one — behaviour preserved (anon sees active plans; authenticated
     sees active plans plus, for super admins, all plans).
*/

-- 1. FK covering indexes
CREATE INDEX IF NOT EXISTS idx_admin_subscription_actions_subscription_id
  ON public.admin_subscription_actions (subscription_id);
CREATE INDEX IF NOT EXISTS idx_pallet_reconciliations_created_by
  ON public.pallet_reconciliations (created_by);

-- 2. Drop duplicate unique index
DROP INDEX IF EXISTS public.uq_sorting_batch_source_item;

-- 3. auth_rls_initplan rewrites
DROP POLICY IF EXISTS "Super admins can view webhook events" ON public.stripe_webhook_events;
CREATE POLICY "Super admins can view webhook events" ON public.stripe_webhook_events
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles_private
    WHERE profiles_private.id = (select auth.uid())
      AND profiles_private.role = 'super_admin'
  ));

DROP POLICY IF EXISTS "Super admins can view verification codes" ON public.email_verification_codes;
CREATE POLICY "Super admins can view verification codes" ON public.email_verification_codes
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles_private
    WHERE profiles_private.id = (select auth.uid())
      AND profiles_private.role = 'super_admin'
  ));

DROP POLICY IF EXISTS "dnotes_update" ON public.delivery_notes;
CREATE POLICY "dnotes_update" ON public.delivery_notes
  FOR UPDATE TO authenticated
  USING (
    (private.get_user_role() = 'super_admin')
    OR ((company_id = private.get_user_company_id())
        AND ((private.get_user_role() <> 'depot_worker')
             OR (assigned_depot_id IS NULL)
             OR (assigned_depot_id = (
                   SELECT profiles_private.depot_id FROM profiles_private
                   WHERE profiles_private.id = (select auth.uid())))))
  )
  WITH CHECK (
    (private.get_user_role() = 'super_admin')
    OR ((company_id = private.get_user_company_id())
        AND ((private.get_user_role() <> 'depot_worker')
             OR (assigned_depot_id IS NULL)
             OR (assigned_depot_id = (
                   SELECT profiles_private.depot_id FROM profiles_private
                   WHERE profiles_private.id = (select auth.uid())))))
  );

-- 4. Consolidate subscription_plans permissive SELECT policies
DROP POLICY IF EXISTS "Public can view active plans" ON public.subscription_plans;
DROP POLICY IF EXISTS "Super admins can view all plans" ON public.subscription_plans;
CREATE POLICY "subscription_plans_select_anon" ON public.subscription_plans
  FOR SELECT TO anon USING (is_active = true);
CREATE POLICY "subscription_plans_select_authenticated" ON public.subscription_plans
  FOR SELECT TO authenticated USING (is_active = true OR private.is_super_admin());
