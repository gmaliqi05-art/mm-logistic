/*
  # Revoke public EXECUTE on SECURITY DEFINER functions

  ## Summary
  These functions are all trigger handlers or internal seeding helpers. None of them
  should be callable via PostgREST (`/rest/v1/rpc/...`) by `anon` or `authenticated`
  roles because they bypass RLS via SECURITY DEFINER and must only run inside the
  trigger/admin context that invokes them.

  ## Changes
  - REVOKE EXECUTE from `public`, `anon`, and `authenticated` on:
    * acc_guard_invoice_negative_stock()
    * acc_invoice_auto_delivery_note()
    * acc_invoice_auto_logistic_delivery_note()
    * acc_purchase_auto_delivery_note()
    * acc_purchase_auto_logistic_delivery_note()
    * refresh_acc_product_stock(uuid)
    * seed_company_coa(uuid, text)
    * stock_sync_acc_product()
  - GRANT EXECUTE back to `service_role` explicitly so admin edge functions can
    still invoke where needed (e.g. seed_company_coa during company provisioning).

  ## Security impact
  - Closes RPC surface: none of these can now be called via `/rest/v1/rpc/...` by
    signed-in users, preventing privilege-escalation attempts that bypass RLS.
  - Trigger execution is unaffected: triggers run as the trigger owner, not the
    REST caller.
*/

DO $$
DECLARE
  fn text;
  fns text[] := ARRAY[
    'public.acc_guard_invoice_negative_stock()',
    'public.acc_invoice_auto_delivery_note()',
    'public.acc_invoice_auto_logistic_delivery_note()',
    'public.acc_purchase_auto_delivery_note()',
    'public.acc_purchase_auto_logistic_delivery_note()',
    'public.refresh_acc_product_stock(uuid)',
    'public.seed_company_coa(uuid, text)',
    'public.stock_sync_acc_product()'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', fn);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;
