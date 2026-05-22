-- Auto-wrap auth.uid() in (SELECT auth.uid()) for RLS performance.
-- Reference: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
-- Semantics identical; only Postgres plan changes (init plan instead of per-row).

DROP POLICY IF EXISTS "Company admins/accountants delete statement lines" ON public.acc_bank_statement_lines;
CREATE POLICY "Company admins/accountants delete statement lines" ON public.acc_bank_statement_lines
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'accountant'::text, 'super_admin'::text]))))));

DROP POLICY IF EXISTS "Company admins/accountants insert statement lines" ON public.acc_bank_statement_lines;
CREATE POLICY "Company admins/accountants insert statement lines" ON public.acc_bank_statement_lines
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'accountant'::text, 'super_admin'::text]))))));

DROP POLICY IF EXISTS "Company admins/accountants update statement lines" ON public.acc_bank_statement_lines;
CREATE POLICY "Company admins/accountants update statement lines" ON public.acc_bank_statement_lines
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'accountant'::text, 'super_admin'::text]))))))
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'accountant'::text, 'super_admin'::text]))))));

DROP POLICY IF EXISTS "Company members view statement lines" ON public.acc_bank_statement_lines;
CREATE POLICY "Company members view statement lines" ON public.acc_bank_statement_lines
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "Company admins/accountants delete statements" ON public.acc_bank_statements;
CREATE POLICY "Company admins/accountants delete statements" ON public.acc_bank_statements
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'accountant'::text, 'super_admin'::text]))))));

DROP POLICY IF EXISTS "Company admins/accountants insert statements" ON public.acc_bank_statements;
CREATE POLICY "Company admins/accountants insert statements" ON public.acc_bank_statements
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'accountant'::text, 'super_admin'::text]))))));

DROP POLICY IF EXISTS "Company members can view statements" ON public.acc_bank_statements;
CREATE POLICY "Company members can view statements" ON public.acc_bank_statements
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "Company admins can delete CoA" ON public.acc_chart_of_accounts;
CREATE POLICY "Company admins can delete CoA" ON public.acc_chart_of_accounts
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'accountant'::text]))))));

DROP POLICY IF EXISTS "Company admins can insert CoA" ON public.acc_chart_of_accounts;
CREATE POLICY "Company admins can insert CoA" ON public.acc_chart_of_accounts
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'accountant'::text]))))));

DROP POLICY IF EXISTS "Company admins can update CoA" ON public.acc_chart_of_accounts;
CREATE POLICY "Company admins can update CoA" ON public.acc_chart_of_accounts
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'accountant'::text]))))))
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'accountant'::text]))))));

DROP POLICY IF EXISTS "Company members can view CoA" ON public.acc_chart_of_accounts;
CREATE POLICY "Company members can view CoA" ON public.acc_chart_of_accounts
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "Company admins can delete client prices" ON public.acc_client_prices;
CREATE POLICY "Company admins can delete client prices" ON public.acc_client_prices
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'accountant'::text, 'logistics_admin'::text]))))));

DROP POLICY IF EXISTS "Company admins can insert client prices" ON public.acc_client_prices;
CREATE POLICY "Company admins can insert client prices" ON public.acc_client_prices
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'accountant'::text, 'logistics_admin'::text]))))));

DROP POLICY IF EXISTS "Company admins can update client prices" ON public.acc_client_prices;
CREATE POLICY "Company admins can update client prices" ON public.acc_client_prices
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'accountant'::text, 'logistics_admin'::text]))))))
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'accountant'::text, 'logistics_admin'::text]))))));

DROP POLICY IF EXISTS "Company members can view client prices" ON public.acc_client_prices;
CREATE POLICY "Company members can view client prices" ON public.acc_client_prices
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "Logistics admins read company delivery notes" ON public.acc_delivery_notes;
CREATE POLICY "Logistics admins read company delivery notes" ON public.acc_delivery_notes
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.role = ANY (ARRAY['logistics_admin'::text, 'company_admin'::text, 'accountant'::text, 'driver'::text])) AND (p.company_id = acc_delivery_notes.company_id)))));

DROP POLICY IF EXISTS "Logistics admins update company delivery notes" ON public.acc_delivery_notes;
CREATE POLICY "Logistics admins update company delivery notes" ON public.acc_delivery_notes
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.role = ANY (ARRAY['logistics_admin'::text, 'company_admin'::text])) AND (p.company_id = acc_delivery_notes.company_id)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.role = ANY (ARRAY['logistics_admin'::text, 'company_admin'::text])) AND (p.company_id = acc_delivery_notes.company_id)))));

DROP POLICY IF EXISTS "Accountants can delete import items" ON public.acc_import_items;
CREATE POLICY "Accountants can delete import items" ON public.acc_import_items
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((import_id IN ( SELECT acc_imports.id
   FROM acc_imports
  WHERE (acc_imports.company_id IN ( SELECT profiles.company_id
           FROM profiles
          WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'accountant'::text]))))))));

DROP POLICY IF EXISTS "Accountants can insert import items" ON public.acc_import_items;
CREATE POLICY "Accountants can insert import items" ON public.acc_import_items
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((import_id IN ( SELECT acc_imports.id
   FROM acc_imports
  WHERE (acc_imports.company_id IN ( SELECT profiles.company_id
           FROM profiles
          WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'accountant'::text]))))))));

DROP POLICY IF EXISTS "Accountants can update import items" ON public.acc_import_items;
CREATE POLICY "Accountants can update import items" ON public.acc_import_items
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((import_id IN ( SELECT acc_imports.id
   FROM acc_imports
  WHERE (acc_imports.company_id IN ( SELECT profiles.company_id
           FROM profiles
          WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'accountant'::text]))))))))
  WITH CHECK ((import_id IN ( SELECT acc_imports.id
   FROM acc_imports
  WHERE (acc_imports.company_id IN ( SELECT profiles.company_id
           FROM profiles
          WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'accountant'::text]))))))));

DROP POLICY IF EXISTS "Members can view import items" ON public.acc_import_items;
CREATE POLICY "Members can view import items" ON public.acc_import_items
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((import_id IN ( SELECT acc_imports.id
   FROM acc_imports
  WHERE (acc_imports.company_id IN ( SELECT profiles.company_id
           FROM profiles
          WHERE (profiles.id = (SELECT auth.uid())))))));

DROP POLICY IF EXISTS "Accountants can delete imports" ON public.acc_imports;
CREATE POLICY "Accountants can delete imports" ON public.acc_imports
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'accountant'::text]))))));

DROP POLICY IF EXISTS "Accountants can insert imports" ON public.acc_imports;
CREATE POLICY "Accountants can insert imports" ON public.acc_imports
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'accountant'::text]))))));

DROP POLICY IF EXISTS "Accountants can update imports" ON public.acc_imports;
CREATE POLICY "Accountants can update imports" ON public.acc_imports
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'accountant'::text]))))))
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'accountant'::text]))))));

DROP POLICY IF EXISTS "Members can view imports" ON public.acc_imports;
CREATE POLICY "Members can view imports" ON public.acc_imports
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "Company members can view invoice reminders" ON public.acc_invoice_reminders;
CREATE POLICY "Company members can view invoice reminders" ON public.acc_invoice_reminders
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((invoice_id IN ( SELECT i.id
   FROM acc_invoices i
  WHERE (i.company_id IN ( SELECT profiles.company_id
           FROM profiles
          WHERE (profiles.id = (SELECT auth.uid())))))));

DROP POLICY IF EXISTS "System can insert invoice reminders" ON public.acc_invoice_reminders;
CREATE POLICY "System can insert invoice reminders" ON public.acc_invoice_reminders
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((invoice_id IN ( SELECT i.id
   FROM acc_invoices i
  WHERE (i.company_id IN ( SELECT profiles.company_id
           FROM profiles
          WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'accountant'::text, 'logistics_admin'::text]))))))));

DROP POLICY IF EXISTS "Company users insert own sequences" ON public.acc_invoice_sequences;
CREATE POLICY "Company users insert own sequences" ON public.acc_invoice_sequences
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "Company users read own sequences" ON public.acc_invoice_sequences;
CREATE POLICY "Company users read own sequences" ON public.acc_invoice_sequences
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "Company users update own sequences" ON public.acc_invoice_sequences;
CREATE POLICY "Company users update own sequences" ON public.acc_invoice_sequences
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))))
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "Company users delete own templates" ON public.acc_invoice_templates;
CREATE POLICY "Company users delete own templates" ON public.acc_invoice_templates
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "Company users insert own templates" ON public.acc_invoice_templates;
CREATE POLICY "Company users insert own templates" ON public.acc_invoice_templates
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "Company users read own templates" ON public.acc_invoice_templates;
CREATE POLICY "Company users read own templates" ON public.acc_invoice_templates
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "Company users update own templates" ON public.acc_invoice_templates;
CREATE POLICY "Company users update own templates" ON public.acc_invoice_templates
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))))
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "Logistics admins read company invoices" ON public.acc_invoices;
CREATE POLICY "Logistics admins read company invoices" ON public.acc_invoices
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.role = 'logistics_admin'::text) AND (p.company_id = acc_invoices.company_id)))));

DROP POLICY IF EXISTS "Accountants can delete journal" ON public.acc_journal_entries;
CREATE POLICY "Accountants can delete journal" ON public.acc_journal_entries
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'accountant'::text]))))));

DROP POLICY IF EXISTS "Accountants can insert journal" ON public.acc_journal_entries;
CREATE POLICY "Accountants can insert journal" ON public.acc_journal_entries
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'accountant'::text]))))));

DROP POLICY IF EXISTS "Accountants can update journal" ON public.acc_journal_entries;
CREATE POLICY "Accountants can update journal" ON public.acc_journal_entries
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'accountant'::text]))))))
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'accountant'::text]))))));

DROP POLICY IF EXISTS "Members can view journal" ON public.acc_journal_entries;
CREATE POLICY "Members can view journal" ON public.acc_journal_entries
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "Accountants can delete journal lines" ON public.acc_journal_lines;
CREATE POLICY "Accountants can delete journal lines" ON public.acc_journal_lines
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((entry_id IN ( SELECT acc_journal_entries.id
   FROM acc_journal_entries
  WHERE (acc_journal_entries.company_id IN ( SELECT profiles.company_id
           FROM profiles
          WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'accountant'::text]))))))));

DROP POLICY IF EXISTS "Accountants can insert journal lines" ON public.acc_journal_lines;
CREATE POLICY "Accountants can insert journal lines" ON public.acc_journal_lines
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((entry_id IN ( SELECT acc_journal_entries.id
   FROM acc_journal_entries
  WHERE (acc_journal_entries.company_id IN ( SELECT profiles.company_id
           FROM profiles
          WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'accountant'::text]))))))));

DROP POLICY IF EXISTS "Accountants can update journal lines" ON public.acc_journal_lines;
CREATE POLICY "Accountants can update journal lines" ON public.acc_journal_lines
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((entry_id IN ( SELECT acc_journal_entries.id
   FROM acc_journal_entries
  WHERE (acc_journal_entries.company_id IN ( SELECT profiles.company_id
           FROM profiles
          WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'accountant'::text]))))))))
  WITH CHECK ((entry_id IN ( SELECT acc_journal_entries.id
   FROM acc_journal_entries
  WHERE (acc_journal_entries.company_id IN ( SELECT profiles.company_id
           FROM profiles
          WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'accountant'::text]))))))));

DROP POLICY IF EXISTS "Members can view journal lines" ON public.acc_journal_lines;
CREATE POLICY "Members can view journal lines" ON public.acc_journal_lines
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((entry_id IN ( SELECT acc_journal_entries.id
   FROM acc_journal_entries
  WHERE (acc_journal_entries.company_id IN ( SELECT profiles.company_id
           FROM profiles
          WHERE (profiles.id = (SELECT auth.uid())))))));

DROP POLICY IF EXISTS "Admin can delete attendance" ON public.attendance_records;
CREATE POLICY "Admin can delete attendance" ON public.attendance_records
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'company_admin'::text)))));

DROP POLICY IF EXISTS "Users can insert own attendance" ON public.attendance_records;
CREATE POLICY "Users can insert own attendance" ON public.attendance_records
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((user_id = (SELECT auth.uid())) OR (company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'company_admin'::text))))));

DROP POLICY IF EXISTS "Users can update own attendance or admin all" ON public.attendance_records;
CREATE POLICY "Users can update own attendance or admin all" ON public.attendance_records
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (((user_id = (SELECT auth.uid())) OR (company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'company_admin'::text))))))
  WITH CHECK (((user_id = (SELECT auth.uid())) OR (company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'company_admin'::text))))));

DROP POLICY IF EXISTS "Users see own attendance or admin sees all" ON public.attendance_records;
CREATE POLICY "Users see own attendance or admin sees all" ON public.attendance_records
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((user_id = (SELECT auth.uid())) OR (company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = 'company_admin'::text))))));

DROP POLICY IF EXISTS "Admins can delete category products" ON public.category_products;
CREATE POLICY "Admins can delete category products" ON public.category_products
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.role = ANY (ARRAY['company_admin'::text, 'accountant'::text])))))));

DROP POLICY IF EXISTS "Admins can insert category products" ON public.category_products;
CREATE POLICY "Admins can insert category products" ON public.category_products
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.role = ANY (ARRAY['company_admin'::text, 'accountant'::text])))))));

DROP POLICY IF EXISTS "Admins can update category products" ON public.category_products;
CREATE POLICY "Admins can update category products" ON public.category_products
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

DROP POLICY IF EXISTS "category_products_update_show_in_repair" ON public.category_products;
CREATE POLICY "category_products_update_show_in_repair" ON public.category_products
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

DROP POLICY IF EXISTS "Company users can view category products" ON public.category_products;
CREATE POLICY "Company users can view category products" ON public.category_products
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "sync_log_insert" ON public.company_accounting_sync_log;
CREATE POLICY "sync_log_insert" ON public.company_accounting_sync_log
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "sync_log_select" ON public.company_accounting_sync_log;
CREATE POLICY "sync_log_select" ON public.company_accounting_sync_log
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "Admins delete api keys" ON public.company_api_keys;
CREATE POLICY "Admins delete api keys" ON public.company_api_keys
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'super_admin'::text]))))));

DROP POLICY IF EXISTS "Admins insert api keys" ON public.company_api_keys;
CREATE POLICY "Admins insert api keys" ON public.company_api_keys
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'super_admin'::text]))))));

DROP POLICY IF EXISTS "Admins update api keys" ON public.company_api_keys;
CREATE POLICY "Admins update api keys" ON public.company_api_keys
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'super_admin'::text]))))))
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'super_admin'::text]))))));

DROP POLICY IF EXISTS "Admins view company api keys" ON public.company_api_keys;
CREATE POLICY "Admins view company api keys" ON public.company_api_keys
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'super_admin'::text]))))));

DROP POLICY IF EXISTS "Company admins delete COA" ON public.company_chart_of_accounts;
CREATE POLICY "Company admins delete COA" ON public.company_chart_of_accounts
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.company_id = company_chart_of_accounts.company_id) AND (p.role = ANY (ARRAY['company_admin'::text, 'accountant'::text]))))));

DROP POLICY IF EXISTS "Company admins insert COA" ON public.company_chart_of_accounts;
CREATE POLICY "Company admins insert COA" ON public.company_chart_of_accounts
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.company_id = company_chart_of_accounts.company_id) AND (p.role = ANY (ARRAY['company_admin'::text, 'accountant'::text]))))));

DROP POLICY IF EXISTS "Company admins update COA" ON public.company_chart_of_accounts;
CREATE POLICY "Company admins update COA" ON public.company_chart_of_accounts
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.company_id = company_chart_of_accounts.company_id) AND (p.role = ANY (ARRAY['company_admin'::text, 'accountant'::text]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.company_id = company_chart_of_accounts.company_id) AND (p.role = ANY (ARRAY['company_admin'::text, 'accountant'::text]))))));

DROP POLICY IF EXISTS "Company members read own COA" ON public.company_chart_of_accounts;
CREATE POLICY "Company members read own COA" ON public.company_chart_of_accounts
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.company_id = company_chart_of_accounts.company_id)))));

DROP POLICY IF EXISTS "Company admins can insert email settings" ON public.company_email_settings;
CREATE POLICY "Company admins can insert email settings" ON public.company_email_settings
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'accountant'::text, 'logistics_admin'::text]))))));

DROP POLICY IF EXISTS "Company admins can update email settings" ON public.company_email_settings;
CREATE POLICY "Company admins can update email settings" ON public.company_email_settings
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'accountant'::text, 'logistics_admin'::text]))))))
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'accountant'::text, 'logistics_admin'::text]))))));

DROP POLICY IF EXISTS "Company members can view own email settings" ON public.company_email_settings;
CREATE POLICY "Company members can view own email settings" ON public.company_email_settings
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "sync_settings_insert" ON public.company_sync_settings;
CREATE POLICY "sync_settings_insert" ON public.company_sync_settings
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'accountant'::text]))))));

DROP POLICY IF EXISTS "sync_settings_select" ON public.company_sync_settings;
CREATE POLICY "sync_settings_select" ON public.company_sync_settings
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "sync_settings_update" ON public.company_sync_settings;
CREATE POLICY "sync_settings_update" ON public.company_sync_settings
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'accountant'::text]))))))
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'accountant'::text]))))));

DROP POLICY IF EXISTS "Company admins can delete reminders" ON public.compliance_reminders;
CREATE POLICY "Company admins can delete reminders" ON public.compliance_reminders
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'logistics_admin'::text]))))));

DROP POLICY IF EXISTS "Company admins can insert reminders" ON public.compliance_reminders;
CREATE POLICY "Company admins can insert reminders" ON public.compliance_reminders
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['company_admin'::text, 'logistics_admin'::text]))))));

