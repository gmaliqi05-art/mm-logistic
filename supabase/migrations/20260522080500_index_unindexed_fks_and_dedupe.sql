-- 20260522080500 — Add indexes for 72 unindexed foreign keys + drop 2 duplicate indexes
--
-- All these are purely additive (CREATE INDEX IF NOT EXISTS) or remove provably-
-- redundant indexes (the same columns are already covered by another index that
-- backs a unique constraint or has a more conventional name). No application
-- behaviour change; Postgres just gets to use index scans where today it falls
-- back to seq scans on JOIN and ON DELETE checks.
--
-- All index names are prefixed `idx_` and follow the convention
-- `idx_<table>_<column>`. The CREATE INDEX IF NOT EXISTS guard is defensive in
-- case an operator has already added some of these manually.

CREATE INDEX IF NOT EXISTS idx_acc_bank_statement_lines_matched_transaction_id ON public.acc_bank_statement_lines (matched_transaction_id);
CREATE INDEX IF NOT EXISTS idx_acc_bank_statements_imported_by ON public.acc_bank_statements (imported_by);
CREATE INDEX IF NOT EXISTS idx_acc_contacts_source_document_id ON public.acc_contacts (source_document_id);
CREATE INDEX IF NOT EXISTS idx_acc_invoices_template_id ON public.acc_invoices (template_id);
CREATE INDEX IF NOT EXISTS idx_acc_transactions_bank_statement_line_id ON public.acc_transactions (bank_statement_line_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_depot_id ON public.attendance_records (depot_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_modified_by ON public.attendance_records (modified_by);
CREATE INDEX IF NOT EXISTS idx_company_accounting_sync_log_triggered_by ON public.company_accounting_sync_log (triggered_by);
CREATE INDEX IF NOT EXISTS idx_company_api_keys_created_by ON public.company_api_keys (created_by);
CREATE INDEX IF NOT EXISTS idx_company_chart_of_accounts_source_template_id ON public.company_chart_of_accounts (source_template_id);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_carrier_company_id ON public.delivery_notes (carrier_company_id);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_carrier_contact_id ON public.delivery_notes (carrier_contact_id);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_consignee_company_id ON public.delivery_notes (consignee_company_id);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_consignee_contact_id ON public.delivery_notes (consignee_contact_id);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_consignor_company_id ON public.delivery_notes (consignor_company_id);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_consignor_contact_id ON public.delivery_notes (consignor_contact_id);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_counterparty_company_id ON public.delivery_notes (counterparty_company_id);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_counterparty_contact_id ON public.delivery_notes (counterparty_contact_id);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_destination_depot_id ON public.delivery_notes (destination_depot_id);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_goods_owner_company_id ON public.delivery_notes (goods_owner_company_id);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_goods_owner_contact_id ON public.delivery_notes (goods_owner_contact_id);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_origin_depot_id ON public.delivery_notes (origin_depot_id);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_owner_company_id ON public.delivery_notes (owner_company_id);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_route_assigned_by ON public.delivery_notes (route_assigned_by);
CREATE INDEX IF NOT EXISTS idx_delivery_proofs_captured_by_profile_id ON public.delivery_proofs (captured_by_profile_id);
CREATE INDEX IF NOT EXISTS idx_depot_repair_reports_company_reviewed_by ON public.depot_repair_reports (company_reviewed_by);
CREATE INDEX IF NOT EXISTS idx_depot_repairs_opened_by ON public.depot_repairs (opened_by);
CREATE INDEX IF NOT EXISTS idx_driver_route_plans_assigned_by ON public.driver_route_plans (assigned_by);
CREATE INDEX IF NOT EXISTS idx_email_campaign_recipients_user_id ON public.email_campaign_recipients (user_id);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_created_by ON public.email_campaigns (created_by);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_template_code ON public.email_campaigns (template_code);
CREATE INDEX IF NOT EXISTS idx_email_templates_updated_by ON public.email_templates (updated_by);
CREATE INDEX IF NOT EXISTS idx_employee_leave_balances_company_id ON public.employee_leave_balances (company_id);
CREATE INDEX IF NOT EXISTS idx_employee_leave_balances_leave_type_id ON public.employee_leave_balances (leave_type_id);
CREATE INDEX IF NOT EXISTS idx_fleet_scanned_documents_confirmed_by ON public.fleet_scanned_documents (confirmed_by);
CREATE INDEX IF NOT EXISTS idx_hr_notifications_company_id ON public.hr_notifications (company_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_approver_id ON public.leave_requests (approver_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_cancelled_by ON public.leave_requests (cancelled_by);
CREATE INDEX IF NOT EXISTS idx_leave_requests_leave_type_id ON public.leave_requests (leave_type_id);
CREATE INDEX IF NOT EXISTS idx_notification_campaigns_created_by ON public.notification_campaigns (created_by);
CREATE INDEX IF NOT EXISTS idx_notification_permissions_channel_code ON public.notification_permissions (channel_code);
CREATE INDEX IF NOT EXISTS idx_notification_preferences_channel_code ON public.notification_preferences (channel_code);
CREATE INDEX IF NOT EXISTS idx_notification_queue_campaign_id ON public.notification_queue (campaign_id);
CREATE INDEX IF NOT EXISTS idx_notification_queue_channel_code ON public.notification_queue (channel_code);
CREATE INDEX IF NOT EXISTS idx_notification_templates_created_by ON public.notification_templates (created_by);
CREATE INDEX IF NOT EXISTS idx_pallet_account_transactions_created_by ON public.pallet_account_transactions (created_by);
CREATE INDEX IF NOT EXISTS idx_pallet_sorting_batches_completed_by ON public.pallet_sorting_batches (completed_by);
CREATE INDEX IF NOT EXISTS idx_pallet_sorting_batches_created_by ON public.pallet_sorting_batches (created_by);
CREATE INDEX IF NOT EXISTS idx_partner_flow_events_category_id ON public.partner_flow_events (category_id);
CREATE INDEX IF NOT EXISTS idx_partner_flow_events_partner_contact_id ON public.partner_flow_events (partner_contact_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_codes_user_id ON public.password_reset_codes (user_id);
CREATE INDEX IF NOT EXISTS idx_push_platform_settings_updated_by ON public.push_platform_settings (updated_by);
CREATE INDEX IF NOT EXISTS idx_route_extension_requests_decided_by ON public.route_extension_requests (decided_by);
CREATE INDEX IF NOT EXISTS idx_route_extension_requests_delivery_note_id ON public.route_extension_requests (delivery_note_id);
CREATE INDEX IF NOT EXISTS idx_scan_events_user_id ON public.scan_events (user_id);
CREATE INDEX IF NOT EXISTS idx_stock_owner_company_id ON public.stock (owner_company_id);
CREATE INDEX IF NOT EXISTS idx_stock_damage_reports_category_id ON public.stock_damage_reports (category_id);
CREATE INDEX IF NOT EXISTS idx_stock_damage_reports_category_product_id ON public.stock_damage_reports (category_product_id);
CREATE INDEX IF NOT EXISTS idx_stock_damage_reports_depot_id ON public.stock_damage_reports (depot_id);
CREATE INDEX IF NOT EXISTS idx_stock_damage_reports_reported_by ON public.stock_damage_reports (reported_by);
CREATE INDEX IF NOT EXISTS idx_stock_movements_delivery_note_id ON public.stock_movements (delivery_note_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_owner_company_id ON public.stock_movements (owner_company_id);
CREATE INDEX IF NOT EXISTS idx_subscription_checkout_sessions_plan_id ON public.subscription_checkout_sessions (plan_id);
CREATE INDEX IF NOT EXISTS idx_tracking_prompts_delivery_note_id ON public.tracking_prompts (delivery_note_id);
CREATE INDEX IF NOT EXISTS idx_trailer_load_items_category_product_id ON public.trailer_load_items (category_product_id);
CREATE INDEX IF NOT EXISTS idx_trailer_loads_created_by ON public.trailer_loads (created_by);
CREATE INDEX IF NOT EXISTS idx_trailer_loads_depot_id ON public.trailer_loads (depot_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_assignments_company_id ON public.vehicle_assignments (company_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_event_id ON public.webhook_deliveries (event_id);
CREATE INDEX IF NOT EXISTS idx_work_hours_log_created_by ON public.work_hours_log (created_by);
CREATE INDEX IF NOT EXISTS idx_work_schedules_company_id ON public.work_schedules (company_id);
CREATE INDEX IF NOT EXISTS idx_work_schedules_user_id ON public.work_schedules (user_id);

-- ---------------------------------------------------------------------------
-- Drop 2 duplicate indexes on country_fleet_compliance_types
-- ---------------------------------------------------------------------------
--
-- Investigation:
--   - country_fleet_compliance_type_country_code_type_key_categor_key
--       UNIQUE (country_code, type_key, category) — backs a unique constraint,
--       KEEP.
--   - country_fleet_compliance_types_unique
--       UNIQUE (country_code, type_key, category) — same columns, no
--       constraint dependency, DROP.
--   - idx_country_fleet_compliance_lookup
--       INDEX (country_code, category, sort_order) — KEEP (idx_ prefix matches
--       project convention).
--   - country_fleet_compliance_types_country_idx
--       INDEX (country_code, category, sort_order) — same columns, DROP.

DROP INDEX IF EXISTS public.country_fleet_compliance_types_unique;
DROP INDEX IF EXISTS public.country_fleet_compliance_types_country_idx;

