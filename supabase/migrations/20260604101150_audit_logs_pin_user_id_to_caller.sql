-- Migration: prevent forged user_id values in audit_logs INSERT.
--
-- The existing INSERT policy only verified `company_id = caller's company`,
-- meaning any tenant member could write an audit_log row claiming to be
-- ANY other user in their company. That makes the log useless as a forensic
-- record: a malicious driver could plant fake entries impersonating their
-- company_admin (e.g. "deleted invoice X").
--
-- Fix: drop the open policy, replace with one that additionally enforces
-- `user_id = auth.uid()` so the row can only be written as the caller's
-- own identity. Service role (audit writes from edge functions like
-- stripe-webhook) bypasses RLS entirely, so this doesn't affect them.

DROP POLICY IF EXISTS "Company admins can insert own audit logs"
  ON public.audit_logs;

CREATE POLICY "audit_logs_insert_self"
  ON public.audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = private.get_user_company_id_safe()
    AND user_id = (SELECT auth.uid())
  );

COMMENT ON POLICY "audit_logs_insert_self" ON public.audit_logs IS
  'Tenants may write only audit entries that are (a) for their own company and (b) attributed to their own user id. Prevents forensic-log forgery by other members of the same tenant. Service role (used by edge functions) bypasses RLS.';
