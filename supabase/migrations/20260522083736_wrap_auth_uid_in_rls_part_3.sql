-- Auto-wrap auth.uid() in (SELECT auth.uid()) for RLS performance.
-- Reference: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
-- Semantics identical; only Postgres plan changes (init plan instead of per-row).

DROP POLICY IF EXISTS "Recipients can view own notifications" ON public.hr_notifications;
CREATE POLICY "Recipients can view own notifications" ON public.hr_notifications
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((recipient_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Admin can delete leave requests" ON public.leave_requests;
CREATE POLICY "Admin can delete leave requests" ON public.leave_requests
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'company_admin'::text)))));

DROP POLICY IF EXISTS "Users can update own pending requests" ON public.leave_requests;
CREATE POLICY "Users can update own pending requests" ON public.leave_requests
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((((user_id = (SELECT auth.uid())) AND (status = 'pending'::text)) OR (company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'company_admin'::text))))))
  WITH CHECK (((user_id = (SELECT auth.uid())) OR (company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'company_admin'::text))))));

DROP POLICY IF EXISTS "Users or admin can create leave requests" ON public.leave_requests;
CREATE POLICY "Users or admin can create leave requests" ON public.leave_requests
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((user_id = (SELECT auth.uid())) OR (company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'company_admin'::text))))));

DROP POLICY IF EXISTS "Users see own requests or admin sees all" ON public.leave_requests;
CREATE POLICY "Users see own requests or admin sees all" ON public.leave_requests
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((user_id = (SELECT auth.uid())) OR (company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'company_admin'::text))))));

DROP POLICY IF EXISTS "Company admin can delete leave types" ON public.leave_types;
CREATE POLICY "Company admin can delete leave types" ON public.leave_types
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'company_admin'::text)))));

DROP POLICY IF EXISTS "Company admin can insert leave types" ON public.leave_types;
CREATE POLICY "Company admin can insert leave types" ON public.leave_types
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'company_admin'::text)))));

DROP POLICY IF EXISTS "Company admin can update leave types" ON public.leave_types;
CREATE POLICY "Company admin can update leave types" ON public.leave_types
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'company_admin'::text)))))
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'company_admin'::text)))));

DROP POLICY IF EXISTS "Company members can view leave types" ON public.leave_types;
CREATE POLICY "Company members can view leave types" ON public.leave_types
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "Super admins can delete legal documents" ON public.legal_documents;
CREATE POLICY "Super admins can delete legal documents" ON public.legal_documents
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'super_admin'::text)))));

DROP POLICY IF EXISTS "Super admins can insert legal documents" ON public.legal_documents;
CREATE POLICY "Super admins can insert legal documents" ON public.legal_documents
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'super_admin'::text)))));

DROP POLICY IF EXISTS "Super admins can update legal documents" ON public.legal_documents;
CREATE POLICY "Super admins can update legal documents" ON public.legal_documents
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'super_admin'::text)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'super_admin'::text)))));

DROP POLICY IF EXISTS "Super admin insert campaigns" ON public.notification_campaigns;
CREATE POLICY "Super admin insert campaigns" ON public.notification_campaigns
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'super_admin'::text)))));

DROP POLICY IF EXISTS "Super admin read campaigns" ON public.notification_campaigns;
CREATE POLICY "Super admin read campaigns" ON public.notification_campaigns
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'super_admin'::text)))));

DROP POLICY IF EXISTS "Super admin update campaigns" ON public.notification_campaigns;
CREATE POLICY "Super admin update campaigns" ON public.notification_campaigns
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'super_admin'::text)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'super_admin'::text)))));

DROP POLICY IF EXISTS "Super admin delete channels" ON public.notification_channels;
CREATE POLICY "Super admin delete channels" ON public.notification_channels
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'super_admin'::text)))) AND (is_system = false)));

DROP POLICY IF EXISTS "Super admin insert channels" ON public.notification_channels;
CREATE POLICY "Super admin insert channels" ON public.notification_channels
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'super_admin'::text)))));

DROP POLICY IF EXISTS "Super admin update channels" ON public.notification_channels;
CREATE POLICY "Super admin update channels" ON public.notification_channels
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'super_admin'::text)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'super_admin'::text)))));

DROP POLICY IF EXISTS "Super admin read all deliveries" ON public.notification_deliveries;
CREATE POLICY "Super admin read all deliveries" ON public.notification_deliveries
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'super_admin'::text)))));

DROP POLICY IF EXISTS "Users read own deliveries" ON public.notification_deliveries;
CREATE POLICY "Users read own deliveries" ON public.notification_deliveries
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Super admin delete permissions" ON public.notification_permissions;
CREATE POLICY "Super admin delete permissions" ON public.notification_permissions
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'super_admin'::text)))));

DROP POLICY IF EXISTS "Super admin insert permissions" ON public.notification_permissions;
CREATE POLICY "Super admin insert permissions" ON public.notification_permissions
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'super_admin'::text)))));

DROP POLICY IF EXISTS "Super admin update permissions" ON public.notification_permissions;
CREATE POLICY "Super admin update permissions" ON public.notification_permissions
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'super_admin'::text)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'super_admin'::text)))));

DROP POLICY IF EXISTS "Super admin read all preferences" ON public.notification_preferences;
CREATE POLICY "Super admin read all preferences" ON public.notification_preferences
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'super_admin'::text)))));

DROP POLICY IF EXISTS "Users delete own preferences" ON public.notification_preferences;
CREATE POLICY "Users delete own preferences" ON public.notification_preferences
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users insert own preferences" ON public.notification_preferences;
CREATE POLICY "Users insert own preferences" ON public.notification_preferences
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users read own preferences" ON public.notification_preferences;
CREATE POLICY "Users read own preferences" ON public.notification_preferences
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users update own preferences" ON public.notification_preferences;
CREATE POLICY "Users update own preferences" ON public.notification_preferences
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Super admin delete queue" ON public.notification_queue;
CREATE POLICY "Super admin delete queue" ON public.notification_queue
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'super_admin'::text)))));

DROP POLICY IF EXISTS "Super admin insert queue" ON public.notification_queue;
CREATE POLICY "Super admin insert queue" ON public.notification_queue
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'super_admin'::text)))));

DROP POLICY IF EXISTS "Super admin read queue" ON public.notification_queue;
CREATE POLICY "Super admin read queue" ON public.notification_queue
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'super_admin'::text)))));

DROP POLICY IF EXISTS "Super admin update queue" ON public.notification_queue;
CREATE POLICY "Super admin update queue" ON public.notification_queue
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'super_admin'::text)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'super_admin'::text)))));

DROP POLICY IF EXISTS "Super admin delete templates" ON public.notification_templates;
CREATE POLICY "Super admin delete templates" ON public.notification_templates
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'super_admin'::text)))));

DROP POLICY IF EXISTS "Super admin insert templates" ON public.notification_templates;
CREATE POLICY "Super admin insert templates" ON public.notification_templates
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'super_admin'::text)))));

DROP POLICY IF EXISTS "Super admin update templates" ON public.notification_templates;
CREATE POLICY "Super admin update templates" ON public.notification_templates
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'super_admin'::text)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'super_admin'::text)))));

DROP POLICY IF EXISTS "notif_insert" ON public.notifications;
CREATE POLICY "notif_insert" ON public.notifications
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((user_id = (SELECT auth.uid())) OR (EXISTS ( SELECT 1
   FROM (profiles me
     JOIN profiles target ON ((target.id = notifications.user_id)))
  WHERE ((me.id = (SELECT auth.uid())) AND (me.company_id IS NOT NULL) AND (me.company_id = target.company_id))))));

DROP POLICY IF EXISTS "Company staff insert pallet transactions" ON public.pallet_account_transactions;
CREATE POLICY "Company staff insert pallet transactions" ON public.pallet_account_transactions
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.company_id = pallet_account_transactions.company_id) AND (p.role = ANY (ARRAY['company_admin'::text, 'accountant'::text, 'logistics'::text, 'super_admin'::text]))))));

DROP POLICY IF EXISTS "Company staff read pallet transactions" ON public.pallet_account_transactions;
CREATE POLICY "Company staff read pallet transactions" ON public.pallet_account_transactions
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.company_id = pallet_account_transactions.company_id) AND (p.role = ANY (ARRAY['company_admin'::text, 'accountant'::text, 'logistics'::text, 'dispatcher'::text, 'super_admin'::text]))))));

DROP POLICY IF EXISTS "Company staff insert pallet accounts" ON public.pallet_accounts;
CREATE POLICY "Company staff insert pallet accounts" ON public.pallet_accounts
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.company_id = pallet_accounts.company_id) AND (p.role = ANY (ARRAY['company_admin'::text, 'accountant'::text, 'logistics'::text, 'super_admin'::text]))))));

DROP POLICY IF EXISTS "Company staff read pallet accounts" ON public.pallet_accounts;
CREATE POLICY "Company staff read pallet accounts" ON public.pallet_accounts
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.company_id = pallet_accounts.company_id) AND (p.role = ANY (ARRAY['company_admin'::text, 'accountant'::text, 'logistics'::text, 'dispatcher'::text, 'super_admin'::text]))))));

DROP POLICY IF EXISTS "Company staff update pallet accounts" ON public.pallet_accounts;
CREATE POLICY "Company staff update pallet accounts" ON public.pallet_accounts
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.company_id = pallet_accounts.company_id) AND (p.role = ANY (ARRAY['company_admin'::text, 'accountant'::text, 'logistics'::text, 'super_admin'::text]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.company_id = pallet_accounts.company_id) AND (p.role = ANY (ARRAY['company_admin'::text, 'accountant'::text, 'logistics'::text, 'super_admin'::text]))))));

DROP POLICY IF EXISTS "psb_delete_same_company" ON public.pallet_sorting_batches;
CREATE POLICY "psb_delete_same_company" ON public.pallet_sorting_batches
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'super_admin'::text]))))));

DROP POLICY IF EXISTS "psb_insert_same_company" ON public.pallet_sorting_batches;
CREATE POLICY "psb_insert_same_company" ON public.pallet_sorting_batches
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))) AND (created_by = (SELECT auth.uid()))));

DROP POLICY IF EXISTS "psb_select_same_company" ON public.pallet_sorting_batches;
CREATE POLICY "psb_select_same_company" ON public.pallet_sorting_batches
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "psb_update_same_company" ON public.pallet_sorting_batches;
CREATE POLICY "psb_update_same_company" ON public.pallet_sorting_batches
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))))
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "psi_delete_same_company" ON public.pallet_sorting_items;
CREATE POLICY "psi_delete_same_company" ON public.pallet_sorting_items
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (pallet_sorting_batches b
     JOIN profiles p ON ((p.id = (SELECT auth.uid()))))
  WHERE ((b.id = pallet_sorting_items.batch_id) AND (b.company_id = p.company_id)))));

DROP POLICY IF EXISTS "psi_insert_same_company" ON public.pallet_sorting_items;
CREATE POLICY "psi_insert_same_company" ON public.pallet_sorting_items
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (pallet_sorting_batches b
     JOIN profiles p ON ((p.id = (SELECT auth.uid()))))
  WHERE ((b.id = pallet_sorting_items.batch_id) AND (b.company_id = p.company_id)))));

DROP POLICY IF EXISTS "psi_select_same_company" ON public.pallet_sorting_items;
CREATE POLICY "psi_select_same_company" ON public.pallet_sorting_items
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (pallet_sorting_batches b
     JOIN profiles p ON ((p.id = (SELECT auth.uid()))))
  WHERE ((b.id = pallet_sorting_items.batch_id) AND (b.company_id = p.company_id)))));

DROP POLICY IF EXISTS "psi_update_same_company" ON public.pallet_sorting_items;
CREATE POLICY "psi_update_same_company" ON public.pallet_sorting_items
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (pallet_sorting_batches b
     JOIN profiles p ON ((p.id = (SELECT auth.uid()))))
  WHERE ((b.id = pallet_sorting_items.batch_id) AND (b.company_id = p.company_id)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (pallet_sorting_batches b
     JOIN profiles p ON ((p.id = (SELECT auth.uid()))))
  WHERE ((b.id = pallet_sorting_items.batch_id) AND (b.company_id = p.company_id)))));

DROP POLICY IF EXISTS "Company admins delete own flow events" ON public.partner_flow_events;
CREATE POLICY "Company admins delete own flow events" ON public.partner_flow_events
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "Company admins insert flow events" ON public.partner_flow_events;
CREATE POLICY "Company admins insert flow events" ON public.partner_flow_events
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "Company admins update own flow events" ON public.partner_flow_events;
CREATE POLICY "Company admins update own flow events" ON public.partner_flow_events
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))))
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "Company members view own flow events" ON public.partner_flow_events;
CREATE POLICY "Company members view own flow events" ON public.partner_flow_events
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))) OR (partner_company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "Users can view own reset codes" ON public.password_reset_codes;
CREATE POLICY "Users can view own reset codes" ON public.password_reset_codes
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "categories_update_show_in_repair" ON public.product_categories;
CREATE POLICY "categories_update_show_in_repair" ON public.product_categories
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid()))) = ANY (ARRAY['depot_worker'::text, 'company_admin'::text, 'super_admin'::text, 'accountant'::text]))))
  WITH CHECK ((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "Admin can delete holidays" ON public.public_holidays;
CREATE POLICY "Admin can delete holidays" ON public.public_holidays
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'company_admin'::text)))));

DROP POLICY IF EXISTS "Admin can insert holidays" ON public.public_holidays;
CREATE POLICY "Admin can insert holidays" ON public.public_holidays
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'company_admin'::text)))));

DROP POLICY IF EXISTS "Admin can update holidays" ON public.public_holidays;
CREATE POLICY "Admin can update holidays" ON public.public_holidays
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'company_admin'::text)))))
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'company_admin'::text)))));

DROP POLICY IF EXISTS "Company members can view holidays" ON public.public_holidays;
CREATE POLICY "Company members can view holidays" ON public.public_holidays
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "Super admin insert platform settings" ON public.push_platform_settings;
CREATE POLICY "Super admin insert platform settings" ON public.push_platform_settings
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'super_admin'::text)))));

DROP POLICY IF EXISTS "Super admin update platform settings" ON public.push_platform_settings;
CREATE POLICY "Super admin update platform settings" ON public.push_platform_settings
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'super_admin'::text)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'super_admin'::text)))));

DROP POLICY IF EXISTS "route_ext_insert" ON public.route_extension_requests;
CREATE POLICY "route_ext_insert" ON public.route_extension_requests
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((driver_id = (SELECT auth.uid())) AND (company_id = private.get_user_company_id())));

DROP POLICY IF EXISTS "route_ext_update" ON public.route_extension_requests;
CREATE POLICY "route_ext_update" ON public.route_extension_requests
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (((company_id = private.get_user_company_id()) AND ((private.get_user_role() = ANY (ARRAY['company_admin'::text, 'logistics'::text, 'dispatcher'::text, 'super_admin'::text])) OR (driver_id = (SELECT auth.uid())))))
  WITH CHECK ((company_id = private.get_user_company_id()));

DROP POLICY IF EXISTS "Company staff can read traffic alerts" ON public.route_traffic_alerts;
CREATE POLICY "Company staff can read traffic alerts" ON public.route_traffic_alerts
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.company_id = route_traffic_alerts.company_id) AND (p.role = ANY (ARRAY['company_admin'::text, 'logistics'::text, 'dispatcher'::text, 'super_admin'::text]))))));

DROP POLICY IF EXISTS "Drivers can acknowledge own traffic alerts" ON public.route_traffic_alerts;
CREATE POLICY "Drivers can acknowledge own traffic alerts" ON public.route_traffic_alerts
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((driver_id = (SELECT auth.uid())))
  WITH CHECK ((driver_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Drivers can read own traffic alerts" ON public.route_traffic_alerts;
CREATE POLICY "Drivers can read own traffic alerts" ON public.route_traffic_alerts
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((driver_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "sa_audit_insert" ON public.sa_audit_logs;
CREATE POLICY "sa_audit_insert" ON public.sa_audit_logs
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.role = 'super_admin'::text)))));

DROP POLICY IF EXISTS "sa_audit_select" ON public.sa_audit_logs;
CREATE POLICY "sa_audit_select" ON public.sa_audit_logs
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.role = 'super_admin'::text)))));

DROP POLICY IF EXISTS "Company staff read scan events" ON public.scan_events;
CREATE POLICY "Company staff read scan events" ON public.scan_events
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.company_id = scan_events.company_id) AND (p.role = ANY (ARRAY['company_admin'::text, 'accountant'::text, 'logistics'::text, 'dispatcher'::text, 'depot'::text, 'super_admin'::text]))))));

DROP POLICY IF EXISTS "Users insert scan events for own company" ON public.scan_events;
CREATE POLICY "Users insert scan events for own company" ON public.scan_events
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((((SELECT auth.uid()) = user_id) AND (company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid()))))));

