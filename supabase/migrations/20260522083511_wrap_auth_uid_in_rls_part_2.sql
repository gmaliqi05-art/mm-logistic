-- Auto-wrap auth.uid() in (SELECT auth.uid()) for RLS performance.
-- Reference: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
-- Semantics identical; only Postgres plan changes (init plan instead of per-row).

DROP POLICY IF EXISTS "Company admins can update reminders" ON public.compliance_reminders;
CREATE POLICY "Company admins can update reminders" ON public.compliance_reminders
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'logistics_admin'::text]))))))
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'logistics_admin'::text]))))));

DROP POLICY IF EXISTS "Company members can view reminders" ON public.compliance_reminders;
CREATE POLICY "Company members can view reminders" ON public.compliance_reminders
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "Assigned driver can insert delivery proof" ON public.delivery_proofs;
CREATE POLICY "Assigned driver can insert delivery proof" ON public.delivery_proofs
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((captured_by_profile_id = (SELECT auth.uid())) AND (EXISTS ( SELECT 1
   FROM delivery_notes dn
  WHERE ((dn.id = delivery_proofs.delivery_note_id) AND (dn.company_id = delivery_proofs.company_id) AND ((dn.assigned_driver_id = (SELECT auth.uid())) OR (dn.created_by = (SELECT auth.uid()))))))));

DROP POLICY IF EXISTS "Company members can view delivery proofs" ON public.delivery_proofs;
CREATE POLICY "Company members can view delivery proofs" ON public.delivery_proofs
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "Admins delete repair reports" ON public.depot_repair_reports;
CREATE POLICY "Admins delete repair reports" ON public.depot_repair_reports
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.role = ANY (ARRAY['company_admin'::text, 'accountant'::text])))))));

DROP POLICY IF EXISTS "Admins update repair reports" ON public.depot_repair_reports;
CREATE POLICY "Admins update repair reports" ON public.depot_repair_reports
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.role = ANY (ARRAY['company_admin'::text, 'accountant'::text])))))))
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "Company admin can review repair reports" ON public.depot_repair_reports;
CREATE POLICY "Company admin can review repair reports" ON public.depot_repair_reports
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.role = 'company_admin'::text) AND (p.company_id = depot_repair_reports.company_id)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.role = 'company_admin'::text) AND (p.company_id = depot_repair_reports.company_id)))));

DROP POLICY IF EXISTS "Company staff insert repair reports" ON public.depot_repair_reports;
CREATE POLICY "Company staff insert repair reports" ON public.depot_repair_reports
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))) AND (created_by = (SELECT auth.uid())) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.role = ANY (ARRAY['company_admin'::text, 'accountant'::text, 'depot_worker'::text])))))));

DROP POLICY IF EXISTS "Company users view repair reports" ON public.depot_repair_reports;
CREATE POLICY "Company users view repair reports" ON public.depot_repair_reports
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "Admins can delete repairs" ON public.depot_repairs;
CREATE POLICY "Admins can delete repairs" ON public.depot_repairs
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.role = ANY (ARRAY['company_admin'::text, 'accountant'::text])))))));

DROP POLICY IF EXISTS "Admins or the worker can insert repairs" ON public.depot_repairs;
CREATE POLICY "Admins or the worker can insert repairs" ON public.depot_repairs
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.role = ANY (ARRAY['company_admin'::text, 'accountant'::text, 'depot_worker'::text])))))));

DROP POLICY IF EXISTS "Admins or the worker can update repairs" ON public.depot_repairs;
CREATE POLICY "Admins or the worker can update repairs" ON public.depot_repairs
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))) AND ((worker_id = (SELECT auth.uid())) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.role = ANY (ARRAY['company_admin'::text, 'accountant'::text]))))))))
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "Company users can view depot repairs" ON public.depot_repairs;
CREATE POLICY "Company users can view depot repairs" ON public.depot_repairs
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "Super admin read all tokens" ON public.device_tokens;
CREATE POLICY "Super admin read all tokens" ON public.device_tokens
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'super_admin'::text)))));

DROP POLICY IF EXISTS "Users delete own tokens" ON public.device_tokens;
CREATE POLICY "Users delete own tokens" ON public.device_tokens
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users insert own tokens" ON public.device_tokens;
CREATE POLICY "Users insert own tokens" ON public.device_tokens
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users read own tokens" ON public.device_tokens;
CREATE POLICY "Users read own tokens" ON public.device_tokens
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users update own tokens" ON public.device_tokens;
CREATE POLICY "Users update own tokens" ON public.device_tokens
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "drv_id_doc_delete_admin" ON public.driver_identity_documents;
CREATE POLICY "drv_id_doc_delete_admin" ON public.driver_identity_documents
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'logistics_admin'::text]))))));

DROP POLICY IF EXISTS "drv_id_doc_insert_admin" ON public.driver_identity_documents;
CREATE POLICY "drv_id_doc_insert_admin" ON public.driver_identity_documents
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'logistics_admin'::text]))))));

DROP POLICY IF EXISTS "drv_id_doc_select_company" ON public.driver_identity_documents;
CREATE POLICY "drv_id_doc_select_company" ON public.driver_identity_documents
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))) AND ((driver_id = (SELECT auth.uid())) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.role = ANY (ARRAY['company_admin'::text, 'logistics_admin'::text]))))))));

DROP POLICY IF EXISTS "drv_id_doc_update_admin" ON public.driver_identity_documents;
CREATE POLICY "drv_id_doc_update_admin" ON public.driver_identity_documents
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'logistics_admin'::text]))))))
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'logistics_admin'::text]))))));

DROP POLICY IF EXISTS "Company admins can delete driver licenses" ON public.driver_licenses;
CREATE POLICY "Company admins can delete driver licenses" ON public.driver_licenses
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'logistics_admin'::text]))))));

DROP POLICY IF EXISTS "Company admins can insert driver licenses" ON public.driver_licenses;
CREATE POLICY "Company admins can insert driver licenses" ON public.driver_licenses
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'logistics_admin'::text]))))));

DROP POLICY IF EXISTS "Company admins can update driver licenses" ON public.driver_licenses;
CREATE POLICY "Company admins can update driver licenses" ON public.driver_licenses
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'logistics_admin'::text]))))))
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'logistics_admin'::text]))))));

DROP POLICY IF EXISTS "Company members can view driver licenses" ON public.driver_licenses;
CREATE POLICY "Company members can view driver licenses" ON public.driver_licenses
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "Company staff read company driver locations" ON public.driver_locations;
CREATE POLICY "Company staff read company driver locations" ON public.driver_locations
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.company_id = driver_locations.company_id) AND (p.role = ANY (ARRAY['company_admin'::text, 'logistics'::text, 'dispatcher'::text, 'accountant'::text, 'super_admin'::text]))))));

DROP POLICY IF EXISTS "Drivers insert own location" ON public.driver_locations;
CREATE POLICY "Drivers insert own location" ON public.driver_locations
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((((SELECT auth.uid()) = driver_id) AND (company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "Drivers read own locations" ON public.driver_locations;
CREATE POLICY "Drivers read own locations" ON public.driver_locations
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((SELECT auth.uid()) = driver_id));

DROP POLICY IF EXISTS "Company admins can delete medical" ON public.driver_medical;
CREATE POLICY "Company admins can delete medical" ON public.driver_medical
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'logistics_admin'::text]))))));

DROP POLICY IF EXISTS "Company admins can insert medical" ON public.driver_medical;
CREATE POLICY "Company admins can insert medical" ON public.driver_medical
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'logistics_admin'::text]))))));

DROP POLICY IF EXISTS "Company admins can update medical" ON public.driver_medical;
CREATE POLICY "Company admins can update medical" ON public.driver_medical
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'logistics_admin'::text]))))))
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'logistics_admin'::text]))))));

DROP POLICY IF EXISTS "Company members can view medical" ON public.driver_medical;
CREATE POLICY "Company members can view medical" ON public.driver_medical
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "Company admins can delete qualifications" ON public.driver_qualifications;
CREATE POLICY "Company admins can delete qualifications" ON public.driver_qualifications
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'logistics_admin'::text]))))));

DROP POLICY IF EXISTS "Company admins can insert qualifications" ON public.driver_qualifications;
CREATE POLICY "Company admins can insert qualifications" ON public.driver_qualifications
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'logistics_admin'::text]))))));

DROP POLICY IF EXISTS "Company admins can update qualifications" ON public.driver_qualifications;
CREATE POLICY "Company admins can update qualifications" ON public.driver_qualifications
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'logistics_admin'::text]))))))
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'logistics_admin'::text]))))));

DROP POLICY IF EXISTS "Company members can view qualifications" ON public.driver_qualifications;
CREATE POLICY "Company members can view qualifications" ON public.driver_qualifications
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "driver_route_plans_delete" ON public.driver_route_plans;
CREATE POLICY "driver_route_plans_delete" ON public.driver_route_plans
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (((company_id = private.get_user_company_id()) AND ((driver_id = (SELECT auth.uid())) OR (private.get_user_role() = ANY (ARRAY['company_admin'::text, 'logistics'::text, 'super_admin'::text])))));

DROP POLICY IF EXISTS "driver_route_plans_insert" ON public.driver_route_plans;
CREATE POLICY "driver_route_plans_insert" ON public.driver_route_plans
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((company_id = private.get_user_company_id()) AND ((driver_id = (SELECT auth.uid())) OR (private.get_user_role() = ANY (ARRAY['company_admin'::text, 'logistics'::text, 'dispatcher'::text, 'super_admin'::text])))));

DROP POLICY IF EXISTS "driver_route_plans_select" ON public.driver_route_plans;
CREATE POLICY "driver_route_plans_select" ON public.driver_route_plans
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((company_id = private.get_user_company_id()) OR (driver_id = (SELECT auth.uid())) OR (target_driver_id = (SELECT auth.uid()))));

DROP POLICY IF EXISTS "driver_route_plans_update" ON public.driver_route_plans;
CREATE POLICY "driver_route_plans_update" ON public.driver_route_plans
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (((company_id = private.get_user_company_id()) AND ((driver_id = (SELECT auth.uid())) OR (private.get_user_role() = ANY (ARRAY['company_admin'::text, 'logistics'::text, 'dispatcher'::text, 'super_admin'::text])))))
  WITH CHECK ((company_id = private.get_user_company_id()));

DROP POLICY IF EXISTS "Super admins delete recipients" ON public.email_campaign_recipients;
CREATE POLICY "Super admins delete recipients" ON public.email_campaign_recipients
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.role = 'super_admin'::text)))));

DROP POLICY IF EXISTS "Super admins insert recipients" ON public.email_campaign_recipients;
CREATE POLICY "Super admins insert recipients" ON public.email_campaign_recipients
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.role = 'super_admin'::text)))));

DROP POLICY IF EXISTS "Super admins update recipients" ON public.email_campaign_recipients;
CREATE POLICY "Super admins update recipients" ON public.email_campaign_recipients
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.role = 'super_admin'::text)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.role = 'super_admin'::text)))));

DROP POLICY IF EXISTS "Super admins view recipients" ON public.email_campaign_recipients;
CREATE POLICY "Super admins view recipients" ON public.email_campaign_recipients
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.role = 'super_admin'::text)))));

DROP POLICY IF EXISTS "Super admins delete campaigns" ON public.email_campaigns;
CREATE POLICY "Super admins delete campaigns" ON public.email_campaigns
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.role = 'super_admin'::text)))));

DROP POLICY IF EXISTS "Super admins insert campaigns" ON public.email_campaigns;
CREATE POLICY "Super admins insert campaigns" ON public.email_campaigns
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.role = 'super_admin'::text)))));

DROP POLICY IF EXISTS "Super admins update campaigns" ON public.email_campaigns;
CREATE POLICY "Super admins update campaigns" ON public.email_campaigns
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.role = 'super_admin'::text)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.role = 'super_admin'::text)))));

DROP POLICY IF EXISTS "Super admins view campaigns" ON public.email_campaigns;
CREATE POLICY "Super admins view campaigns" ON public.email_campaigns
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.role = 'super_admin'::text)))));

DROP POLICY IF EXISTS "Super admins update cron config" ON public.email_cron_config;
CREATE POLICY "Super admins update cron config" ON public.email_cron_config
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.role = 'super_admin'::text)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.role = 'super_admin'::text)))));

DROP POLICY IF EXISTS "Super admins view cron config" ON public.email_cron_config;
CREATE POLICY "Super admins view cron config" ON public.email_cron_config
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.role = 'super_admin'::text)))));

DROP POLICY IF EXISTS "Super admins can view all email deliveries" ON public.email_deliveries;
CREATE POLICY "Super admins can view all email deliveries" ON public.email_deliveries
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.role = 'super_admin'::text)))));

DROP POLICY IF EXISTS "Users view own email deliveries" ON public.email_deliveries;
CREATE POLICY "Users view own email deliveries" ON public.email_deliveries
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Company admins can delete own templates" ON public.email_templates;
CREATE POLICY "Company admins can delete own templates" ON public.email_templates
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'accountant'::text, 'logistics_admin'::text]))))) AND (is_system = false)));

DROP POLICY IF EXISTS "Company admins can insert own templates" ON public.email_templates;
CREATE POLICY "Company admins can insert own templates" ON public.email_templates
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'accountant'::text, 'logistics_admin'::text]))))));

DROP POLICY IF EXISTS "Company admins can update own templates" ON public.email_templates;
CREATE POLICY "Company admins can update own templates" ON public.email_templates
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'accountant'::text, 'logistics_admin'::text]))))))
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'accountant'::text, 'logistics_admin'::text]))))));

DROP POLICY IF EXISTS "Company members can view own templates" ON public.email_templates;
CREATE POLICY "Company members can view own templates" ON public.email_templates
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((company_id IS NULL) OR (company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "Super admins delete non-system templates" ON public.email_templates;
CREATE POLICY "Super admins delete non-system templates" ON public.email_templates
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (((is_system = false) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.role = 'super_admin'::text))))));

DROP POLICY IF EXISTS "Super admins insert templates" ON public.email_templates;
CREATE POLICY "Super admins insert templates" ON public.email_templates
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.role = 'super_admin'::text)))));

DROP POLICY IF EXISTS "Super admins update templates" ON public.email_templates;
CREATE POLICY "Super admins update templates" ON public.email_templates
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.role = 'super_admin'::text)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.role = 'super_admin'::text)))));

DROP POLICY IF EXISTS "Super admins view templates" ON public.email_templates;
CREATE POLICY "Super admins view templates" ON public.email_templates
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.role = 'super_admin'::text)))));

DROP POLICY IF EXISTS "Admin can delete balances" ON public.employee_leave_balances;
CREATE POLICY "Admin can delete balances" ON public.employee_leave_balances
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'company_admin'::text)))));

DROP POLICY IF EXISTS "Admin can insert balances" ON public.employee_leave_balances;
CREATE POLICY "Admin can insert balances" ON public.employee_leave_balances
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'company_admin'::text)))));

DROP POLICY IF EXISTS "Admin can update balances" ON public.employee_leave_balances;
CREATE POLICY "Admin can update balances" ON public.employee_leave_balances
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'company_admin'::text)))))
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'company_admin'::text)))));

DROP POLICY IF EXISTS "Users see own balances or admin sees all" ON public.employee_leave_balances;
CREATE POLICY "Users see own balances or admin sees all" ON public.employee_leave_balances
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((user_id = (SELECT auth.uid())) OR (company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'company_admin'::text))))));

DROP POLICY IF EXISTS "Admins delete fleet scans" ON public.fleet_scanned_documents;
CREATE POLICY "Admins delete fleet scans" ON public.fleet_scanned_documents
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'logistics_admin'::text]))))));

DROP POLICY IF EXISTS "Admins update fleet scans" ON public.fleet_scanned_documents;
CREATE POLICY "Admins update fleet scans" ON public.fleet_scanned_documents
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'logistics_admin'::text]))))))
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'logistics_admin'::text]))))));

DROP POLICY IF EXISTS "Company members insert fleet scans" ON public.fleet_scanned_documents;
CREATE POLICY "Company members insert fleet scans" ON public.fleet_scanned_documents
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))) AND (uploaded_by = (SELECT auth.uid()))));

DROP POLICY IF EXISTS "Company members view fleet scans" ON public.fleet_scanned_documents;
CREATE POLICY "Company members view fleet scans" ON public.fleet_scanned_documents
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "Recipients can update own notifications" ON public.hr_notifications;
CREATE POLICY "Recipients can update own notifications" ON public.hr_notifications
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((recipient_id = (SELECT auth.uid())))
  WITH CHECK ((recipient_id = (SELECT auth.uid())));

