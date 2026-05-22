-- 20260522093000 — revoke EXECUTE from anon/authenticated on trigger-only and
-- cron-only SECURITY DEFINER functions.
--
-- Supabase advisor flagged these as callable via /rest/v1/rpc by either anon
-- or authenticated. Each one is either:
--   1. a TRIGGER function — only invoked via internal Postgres machinery (no
--      GRANT needed), OR
--   2. a CRON-driven function — invoked by pg_cron running as the postgres
--      role (no GRANT needed), OR
--   3. an INTERNAL HELPER — called only from trigger bodies, never from REST.
--
-- Frontend + edge function search returned zero matches for any of these
-- function names, confirming they are not invoked from outside the DB.
--
-- This migration is a pure access tightening. SECURITY DEFINER stays so the
-- triggers can still write to tables with elevated privileges, but the
-- REST surface is closed off.

-- 1) Trigger functions on stock_movements
REVOKE EXECUTE ON FUNCTION public.stock_movement_emit_partner_flow_event() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.stock_movement_notify_admin()             FROM anon, authenticated, PUBLIC;

-- 2) Trigger functions on acc_invoices / acc_purchases
REVOKE EXECUTE ON FUNCTION public.trg_acc_invoice_post_journal_fn()  FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_acc_purchase_post_journal_fn() FROM anon, authenticated, PUBLIC;

-- 3) Internal journal-posting helpers (called from the trg_* trigger fns)
REVOKE EXECUTE ON FUNCTION public.acc_post_invoice_to_journal(p_invoice_id uuid)   FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.acc_post_purchase_to_journal(p_purchase_id uuid) FROM anon, authenticated, PUBLIC;

-- 4) Monthly depreciation — only called by cron job 16
--    (schedule: 0 1 1 * * → 1am on the 1st of every month)
REVOKE EXECUTE ON FUNCTION public.acc_run_monthly_depreciation() FROM anon, authenticated, PUBLIC;
