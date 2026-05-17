/*
  # Restore match_counterparty_company to SECURITY DEFINER

  1. Problem identified
    - match_counterparty_company searches ALL companies by VAT/email/phone/name
    - Called by drivers during document scanning to identify counterparties
    - Under SECURITY INVOKER, drivers can only see their own company (RLS policy)
    - This breaks the cross-company lookup functionality

  2. Fix
    - Restore to SECURITY DEFINER (was switched to INVOKER incorrectly)
    - Function already has internal auth.uid() guard and company-scoping
    - Only returns company IDs that have existing relationships with caller's company
    - No sensitive data is exposed

  3. Security
    - Keep EXECUTE revoked from anon and public
    - Only authenticated can call
    - Internal logic verifies the caller has a pre-existing relationship
      with the matched company before returning its ID
*/

ALTER FUNCTION public.match_counterparty_company(text, text, text, text)
  SECURITY DEFINER;
