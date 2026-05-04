/*
  # Harden SECURITY DEFINER surface + rate_limit_buckets RLS

  1. Revoke EXECUTE on SECURITY DEFINER functions
    - Removes anon/authenticated RPC access for helpers/triggers that must
      never be callable directly. Triggers still fire because PostgreSQL
      executes them as table owner, not via PostgREST.
    - `emit_webhook_event` and `get_rate_to_eur` also blocked from RPC
      (used only internally by triggers / service role edge functions).
  2. RLS
    - Add restrictive policies for `rate_limit_buckets` so PostgREST
      cannot read/write even though only service_role should touch it.
*/

DO $$
DECLARE
  fn text;
  fn_list text[] := ARRAY[
    'public.apply_pallet_transaction()',
    'public.auto_pallet_ledger_on_delivery()',
    'public.emit_webhook_event(uuid, text, jsonb)',
    'public.get_rate_to_eur(text, date)',
    'public.prune_driver_locations()',
    'public.suggest_bank_matches(uuid)',
    'public.tg_email_templates_touch()',
    'public.tick_scheduled_email_campaigns()',
    'public.trg_auto_dispatch_webhook()',
    'public.trg_emit_delivery_completed()',
    'public.trg_emit_invoice_created()',
    'public.trg_emit_invoice_paid()',
    'public.trg_emit_partner_added()',
    'public.trg_emit_stock_low()'
  ];
BEGIN
  FOREACH fn IN ARRAY fn_list LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXCEPTION WHEN undefined_function THEN
      NULL;
    END;
  END LOOP;
END $$;

-- Rate limit buckets: only service_role writes/reads; block anon/authenticated.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='rate_limit_buckets') THEN
    EXECUTE 'ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;

DROP POLICY IF EXISTS "rate_limit_buckets deny all" ON public.rate_limit_buckets;
CREATE POLICY "rate_limit_buckets deny all"
  ON public.rate_limit_buckets
  FOR SELECT
  TO authenticated
  USING (false);
