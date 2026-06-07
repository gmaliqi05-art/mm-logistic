/*
  # Remove dead RPCs, tables, columns, and a storage bucket

  Cleanup from the feature-bloat audit. Every object below was verified to
  have ZERO callers in src/ and supabase/functions/, ZERO references from
  other SQL functions, and ZERO use as a trigger. Child columns were
  confirmed 100% NULL on live data before dropping.

  Dropped:
   - 5 orphan RPCs (superseded by their successors)
   - acc_audit_log         (0 rows, 0 refs; superseded by audit_logs)
   - acc_invoice_templates (0 rows; acc_invoices.template_id is 0% populated)
   - notification_campaigns (0 rows; live campaigns use email_campaigns;
                             notification_queue.campaign_id is 0% populated)

  The fleet-documents storage bucket (0 objects) is also dead, but Supabase
  blocks direct DELETE on storage.buckets via storage.protect_delete(); it
  must be removed through the Storage API / dashboard, so it is intentionally
  left out of this DDL migration.

  Intentionally NOT touched:
   - feature_keys documents_signing / basic_reports / export_pdf /
     export_excel / bulk_operations — these are still surfaced in
     CompanyFeaturesManager (admin toggles) and UpgradePrompt, so the audit's
     "dead" classification was wrong; left in place.
*/

-- 1. Orphan RPCs ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.apply_repair_completion(uuid, integer, integer, uuid, uuid);
DROP FUNCTION IF EXISTS public.claim_trailer_load(uuid);
DROP FUNCTION IF EXISTS public.create_invoice_from_delivery_note(uuid);
DROP FUNCTION IF EXISTS public.driver_complete_quick_draft(uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.match_supplier_invoice_candidates(uuid, uuid, text, date, numeric, integer);

-- 2. acc_invoice_templates + its inbound column ----------------------------
ALTER TABLE public.acc_invoices DROP COLUMN IF EXISTS template_id;
DROP TABLE IF EXISTS public.acc_invoice_templates;

-- 3. notification_campaigns + its inbound column ---------------------------
ALTER TABLE public.notification_queue DROP COLUMN IF EXISTS campaign_id;
DROP TABLE IF EXISTS public.notification_campaigns;

-- 4. acc_audit_log (first-gen audit table, superseded) ---------------------
DROP TABLE IF EXISTS public.acc_audit_log;

-- 5. fleet-documents storage bucket is dead too, but must be removed via the
--    Storage API (storage.protect_delete blocks DDL deletion). Left for a
--    manual dashboard step.
