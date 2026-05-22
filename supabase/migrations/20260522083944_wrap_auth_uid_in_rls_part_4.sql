-- Auto-wrap auth.uid() in (SELECT auth.uid()) for RLS performance.
-- Reference: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
-- Semantics identical; only Postgres plan changes (init plan instead of per-row).

DROP POLICY IF EXISTS "Users insert own scanner logs" ON public.scanner_perf_logs;
CREATE POLICY "Users insert own scanner logs" ON public.scanner_perf_logs
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users read own scanner logs" ON public.scanner_perf_logs;
CREATE POLICY "Users read own scanner logs" ON public.scanner_perf_logs
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "shift_sessions_driver_insert" ON public.shift_sessions;
CREATE POLICY "shift_sessions_driver_insert" ON public.shift_sessions
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((driver_id = (SELECT auth.uid())) AND (company_id = private.get_user_company_id())));

DROP POLICY IF EXISTS "shift_sessions_driver_select" ON public.shift_sessions;
CREATE POLICY "shift_sessions_driver_select" ON public.shift_sessions
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((driver_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "shift_sessions_driver_update" ON public.shift_sessions;
CREATE POLICY "shift_sessions_driver_update" ON public.shift_sessions
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((driver_id = (SELECT auth.uid())))
  WITH CHECK ((driver_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "sdr_insert" ON public.stock_damage_reports;
CREATE POLICY "sdr_insert" ON public.stock_damage_reports
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))) AND (reported_by = (SELECT auth.uid()))));

DROP POLICY IF EXISTS "sdr_select" ON public.stock_damage_reports;
CREATE POLICY "sdr_select" ON public.stock_damage_reports
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "Company admins can insert checkout sessions" ON public.subscription_checkout_sessions;
CREATE POLICY "Company admins can insert checkout sessions" ON public.subscription_checkout_sessions
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "Company admins can view own checkout sessions" ON public.subscription_checkout_sessions;
CREATE POLICY "Company admins can view own checkout sessions" ON public.subscription_checkout_sessions
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "health_insert_super_admin" ON public.system_health_checks;
CREATE POLICY "health_insert_super_admin" ON public.system_health_checks
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.role = 'super_admin'::text)))));

DROP POLICY IF EXISTS "health_select_super_admin" ON public.system_health_checks;
CREATE POLICY "health_select_super_admin" ON public.system_health_checks
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.role = 'super_admin'::text)))));

DROP POLICY IF EXISTS "health_update_super_admin" ON public.system_health_checks;
CREATE POLICY "health_update_super_admin" ON public.system_health_checks
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.role = 'super_admin'::text)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.role = 'super_admin'::text)))));

DROP POLICY IF EXISTS "tracking_prompts_driver_insert" ON public.tracking_prompts;
CREATE POLICY "tracking_prompts_driver_insert" ON public.tracking_prompts
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((driver_id = (SELECT auth.uid())) AND (company_id = private.get_user_company_id())));

DROP POLICY IF EXISTS "tracking_prompts_driver_select" ON public.tracking_prompts;
CREATE POLICY "tracking_prompts_driver_select" ON public.tracking_prompts
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((driver_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "tracking_prompts_driver_update" ON public.tracking_prompts;
CREATE POLICY "tracking_prompts_driver_update" ON public.tracking_prompts
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((driver_id = (SELECT auth.uid())))
  WITH CHECK ((driver_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "trailer_load_items delete by depot staff" ON public.trailer_load_items;
CREATE POLICY "trailer_load_items delete by depot staff" ON public.trailer_load_items
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (trailer_loads tl
     JOIN profiles p ON ((p.id = (SELECT auth.uid()))))
  WHERE ((tl.id = trailer_load_items.trailer_load_id) AND (tl.company_id = p.company_id) AND (p.role = ANY (ARRAY['company_admin'::text, 'depot_worker'::text, 'logistics_admin'::text]))))));

DROP POLICY IF EXISTS "trailer_load_items delete by drivers" ON public.trailer_load_items;
CREATE POLICY "trailer_load_items delete by drivers" ON public.trailer_load_items
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (trailer_loads tl
     JOIN profiles p ON ((p.id = (SELECT auth.uid()))))
  WHERE ((tl.id = trailer_load_items.trailer_load_id) AND (tl.company_id = p.company_id) AND (p.role = 'driver'::text)))));

DROP POLICY IF EXISTS "trailer_load_items insert by depot staff" ON public.trailer_load_items;
CREATE POLICY "trailer_load_items insert by depot staff" ON public.trailer_load_items
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (trailer_loads tl
     JOIN profiles p ON ((p.id = (SELECT auth.uid()))))
  WHERE ((tl.id = trailer_load_items.trailer_load_id) AND (tl.company_id = p.company_id) AND (p.role = ANY (ARRAY['company_admin'::text, 'depot_worker'::text, 'logistics_admin'::text]))))));

DROP POLICY IF EXISTS "trailer_load_items insert by drivers" ON public.trailer_load_items;
CREATE POLICY "trailer_load_items insert by drivers" ON public.trailer_load_items
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (trailer_loads tl
     JOIN profiles p ON ((p.id = (SELECT auth.uid()))))
  WHERE ((tl.id = trailer_load_items.trailer_load_id) AND (tl.company_id = p.company_id) AND (p.role = 'driver'::text)))));

DROP POLICY IF EXISTS "trailer_load_items select via parent" ON public.trailer_load_items;
CREATE POLICY "trailer_load_items select via parent" ON public.trailer_load_items
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (trailer_loads tl
     JOIN profiles p ON ((p.id = (SELECT auth.uid()))))
  WHERE ((tl.id = trailer_load_items.trailer_load_id) AND (tl.company_id = p.company_id) AND ((p.role = ANY (ARRAY['company_admin'::text, 'depot_worker'::text, 'logistics_admin'::text])) OR ((p.role = 'driver'::text) AND ((tl.status = 'available'::text) OR (tl.assigned_driver_id = (SELECT auth.uid())) OR (tl.claimed_by_driver_id = (SELECT auth.uid())))))))));

DROP POLICY IF EXISTS "trailer_load_items update by depot staff" ON public.trailer_load_items;
CREATE POLICY "trailer_load_items update by depot staff" ON public.trailer_load_items
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (trailer_loads tl
     JOIN profiles p ON ((p.id = (SELECT auth.uid()))))
  WHERE ((tl.id = trailer_load_items.trailer_load_id) AND (tl.company_id = p.company_id) AND (p.role = ANY (ARRAY['company_admin'::text, 'depot_worker'::text, 'logistics_admin'::text]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (trailer_loads tl
     JOIN profiles p ON ((p.id = (SELECT auth.uid()))))
  WHERE ((tl.id = trailer_load_items.trailer_load_id) AND (tl.company_id = p.company_id) AND (p.role = ANY (ARRAY['company_admin'::text, 'depot_worker'::text, 'logistics_admin'::text]))))));

DROP POLICY IF EXISTS "trailer_load_items update by drivers" ON public.trailer_load_items;
CREATE POLICY "trailer_load_items update by drivers" ON public.trailer_load_items
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (trailer_loads tl
     JOIN profiles p ON ((p.id = (SELECT auth.uid()))))
  WHERE ((tl.id = trailer_load_items.trailer_load_id) AND (tl.company_id = p.company_id) AND (p.role = 'driver'::text)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (trailer_loads tl
     JOIN profiles p ON ((p.id = (SELECT auth.uid()))))
  WHERE ((tl.id = trailer_load_items.trailer_load_id) AND (tl.company_id = p.company_id) AND (p.role = 'driver'::text)))));

DROP POLICY IF EXISTS "trailer_loads delete by depot staff" ON public.trailer_loads;
CREATE POLICY "trailer_loads delete by depot staff" ON public.trailer_loads
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.company_id = trailer_loads.company_id) AND (p.role = ANY (ARRAY['company_admin'::text, 'depot_worker'::text, 'logistics_admin'::text]))))));

DROP POLICY IF EXISTS "trailer_loads delete by drivers" ON public.trailer_loads;
CREATE POLICY "trailer_loads delete by drivers" ON public.trailer_loads
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.company_id = trailer_loads.company_id) AND (p.role = 'driver'::text)))));

DROP POLICY IF EXISTS "trailer_loads insert by depot staff" ON public.trailer_loads;
CREATE POLICY "trailer_loads insert by depot staff" ON public.trailer_loads
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.company_id = trailer_loads.company_id) AND (p.role = ANY (ARRAY['company_admin'::text, 'depot_worker'::text, 'logistics_admin'::text]))))));

DROP POLICY IF EXISTS "trailer_loads insert by drivers" ON public.trailer_loads;
CREATE POLICY "trailer_loads insert by drivers" ON public.trailer_loads
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.company_id = trailer_loads.company_id) AND (p.role = 'driver'::text)))));

DROP POLICY IF EXISTS "trailer_loads select by company members" ON public.trailer_loads;
CREATE POLICY "trailer_loads select by company members" ON public.trailer_loads
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.company_id = trailer_loads.company_id) AND ((p.role = ANY (ARRAY['company_admin'::text, 'depot_worker'::text, 'logistics_admin'::text])) OR ((p.role = 'driver'::text) AND ((trailer_loads.status = 'available'::text) OR (trailer_loads.assigned_driver_id = (SELECT auth.uid())) OR (trailer_loads.claimed_by_driver_id = (SELECT auth.uid())))))))));

DROP POLICY IF EXISTS "trailer_loads update by depot staff" ON public.trailer_loads;
CREATE POLICY "trailer_loads update by depot staff" ON public.trailer_loads
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.company_id = trailer_loads.company_id) AND (p.role = ANY (ARRAY['company_admin'::text, 'depot_worker'::text, 'logistics_admin'::text]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.company_id = trailer_loads.company_id) AND (p.role = ANY (ARRAY['company_admin'::text, 'depot_worker'::text, 'logistics_admin'::text]))))));

DROP POLICY IF EXISTS "trailer_loads update by drivers" ON public.trailer_loads;
CREATE POLICY "trailer_loads update by drivers" ON public.trailer_loads
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.company_id = trailer_loads.company_id) AND (p.role = 'driver'::text)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.company_id = trailer_loads.company_id) AND (p.role = 'driver'::text)))));

DROP POLICY IF EXISTS "Super admins view unsubscribe tokens" ON public.unsubscribe_tokens;
CREATE POLICY "Super admins view unsubscribe tokens" ON public.unsubscribe_tokens
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.role = 'super_admin'::text)))));

DROP POLICY IF EXISTS "Users view own unsubscribe tokens" ON public.unsubscribe_tokens;
CREATE POLICY "Users view own unsubscribe tokens" ON public.unsubscribe_tokens
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Company admins can delete assignments" ON public.vehicle_assignments;
CREATE POLICY "Company admins can delete assignments" ON public.vehicle_assignments
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'logistics_admin'::text]))))));

DROP POLICY IF EXISTS "Company admins can insert assignments" ON public.vehicle_assignments;
CREATE POLICY "Company admins can insert assignments" ON public.vehicle_assignments
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'logistics_admin'::text]))))));

DROP POLICY IF EXISTS "Company admins can update assignments" ON public.vehicle_assignments;
CREATE POLICY "Company admins can update assignments" ON public.vehicle_assignments
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'logistics_admin'::text]))))))
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'logistics_admin'::text]))))));

DROP POLICY IF EXISTS "Company members can view assignments" ON public.vehicle_assignments;
CREATE POLICY "Company members can view assignments" ON public.vehicle_assignments
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "Company admins can delete inspections" ON public.vehicle_inspections;
CREATE POLICY "Company admins can delete inspections" ON public.vehicle_inspections
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'logistics_admin'::text]))))));

DROP POLICY IF EXISTS "Company admins can insert inspections" ON public.vehicle_inspections;
CREATE POLICY "Company admins can insert inspections" ON public.vehicle_inspections
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'logistics_admin'::text]))))));

DROP POLICY IF EXISTS "Company admins can update inspections" ON public.vehicle_inspections;
CREATE POLICY "Company admins can update inspections" ON public.vehicle_inspections
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'logistics_admin'::text]))))))
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'logistics_admin'::text]))))));

DROP POLICY IF EXISTS "Company members can view inspections" ON public.vehicle_inspections;
CREATE POLICY "Company members can view inspections" ON public.vehicle_inspections
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "Company admins can delete insurance" ON public.vehicle_insurance;
CREATE POLICY "Company admins can delete insurance" ON public.vehicle_insurance
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'logistics_admin'::text]))))));

DROP POLICY IF EXISTS "Company admins can insert insurance" ON public.vehicle_insurance;
CREATE POLICY "Company admins can insert insurance" ON public.vehicle_insurance
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'logistics_admin'::text]))))));

DROP POLICY IF EXISTS "Company admins can update insurance" ON public.vehicle_insurance;
CREATE POLICY "Company admins can update insurance" ON public.vehicle_insurance
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'logistics_admin'::text]))))))
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'logistics_admin'::text]))))));

DROP POLICY IF EXISTS "Company members can view insurance" ON public.vehicle_insurance;
CREATE POLICY "Company members can view insurance" ON public.vehicle_insurance
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "Company admins can delete taxes" ON public.vehicle_taxes;
CREATE POLICY "Company admins can delete taxes" ON public.vehicle_taxes
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'logistics_admin'::text]))))));

DROP POLICY IF EXISTS "Company admins can insert taxes" ON public.vehicle_taxes;
CREATE POLICY "Company admins can insert taxes" ON public.vehicle_taxes
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'logistics_admin'::text]))))));

DROP POLICY IF EXISTS "Company admins can update taxes" ON public.vehicle_taxes;
CREATE POLICY "Company admins can update taxes" ON public.vehicle_taxes
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'logistics_admin'::text]))))))
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'logistics_admin'::text]))))));

DROP POLICY IF EXISTS "Company members can view taxes" ON public.vehicle_taxes;
CREATE POLICY "Company members can view taxes" ON public.vehicle_taxes
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "Company admins can delete vehicles" ON public.vehicles;
CREATE POLICY "Company admins can delete vehicles" ON public.vehicles
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'logistics_admin'::text]))))));

DROP POLICY IF EXISTS "Company admins can insert vehicles" ON public.vehicles;
CREATE POLICY "Company admins can insert vehicles" ON public.vehicles
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'logistics_admin'::text]))))));

DROP POLICY IF EXISTS "Company admins can update vehicles" ON public.vehicles;
CREATE POLICY "Company admins can update vehicles" ON public.vehicles
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'logistics_admin'::text]))))))
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'logistics_admin'::text]))))));

DROP POLICY IF EXISTS "Company members can view vehicles" ON public.vehicles;
CREATE POLICY "Company members can view vehicles" ON public.vehicles
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "Admins view webhook deliveries" ON public.webhook_deliveries;
CREATE POLICY "Admins view webhook deliveries" ON public.webhook_deliveries
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((webhook_id IN ( SELECT webhooks.id
   FROM webhooks
  WHERE (webhooks.company_id IN ( SELECT profiles.company_id
           FROM profiles
          WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'super_admin'::text]))))))));

DROP POLICY IF EXISTS "Admins view webhook events" ON public.webhook_events;
CREATE POLICY "Admins view webhook events" ON public.webhook_events
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'super_admin'::text]))))));

DROP POLICY IF EXISTS "Admins delete webhooks" ON public.webhooks;
CREATE POLICY "Admins delete webhooks" ON public.webhooks
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'super_admin'::text]))))));

DROP POLICY IF EXISTS "Admins insert webhooks" ON public.webhooks;
CREATE POLICY "Admins insert webhooks" ON public.webhooks
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'super_admin'::text]))))));

DROP POLICY IF EXISTS "Admins update webhooks" ON public.webhooks;
CREATE POLICY "Admins update webhooks" ON public.webhooks
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'super_admin'::text]))))))
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'super_admin'::text]))))));

DROP POLICY IF EXISTS "Admins view webhooks" ON public.webhooks;
CREATE POLICY "Admins view webhooks" ON public.webhooks
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'super_admin'::text]))))));

DROP POLICY IF EXISTS "Admin can delete work hours" ON public.work_hours_log;
CREATE POLICY "Admin can delete work hours" ON public.work_hours_log
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'company_admin'::text)))));

DROP POLICY IF EXISTS "Users can insert own work hours or admin can insert" ON public.work_hours_log;
CREATE POLICY "Users can insert own work hours or admin can insert" ON public.work_hours_log
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((user_id = (SELECT auth.uid())) OR (company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'company_admin'::text))))));

DROP POLICY IF EXISTS "Users can update own work hours or admin can update" ON public.work_hours_log;
CREATE POLICY "Users can update own work hours or admin can update" ON public.work_hours_log
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (((user_id = (SELECT auth.uid())) OR (company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'company_admin'::text))))))
  WITH CHECK (((user_id = (SELECT auth.uid())) OR (company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'company_admin'::text))))));

DROP POLICY IF EXISTS "Users see own work hours or admin sees all" ON public.work_hours_log;
CREATE POLICY "Users see own work hours or admin sees all" ON public.work_hours_log
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((user_id = (SELECT auth.uid())) OR (company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'company_admin'::text))))));

DROP POLICY IF EXISTS "Admin can delete schedules" ON public.work_schedules;
CREATE POLICY "Admin can delete schedules" ON public.work_schedules
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'company_admin'::text)))));

DROP POLICY IF EXISTS "Admin can insert schedules" ON public.work_schedules;
CREATE POLICY "Admin can insert schedules" ON public.work_schedules
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'company_admin'::text)))));

DROP POLICY IF EXISTS "Admin can update schedules" ON public.work_schedules;
CREATE POLICY "Admin can update schedules" ON public.work_schedules
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'company_admin'::text)))))
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'company_admin'::text)))));

DROP POLICY IF EXISTS "Users see own schedule or admin sees all" ON public.work_schedules;
CREATE POLICY "Users see own schedule or admin sees all" ON public.work_schedules
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((user_id = (SELECT auth.uid())) OR (company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'company_admin'::text))))));

