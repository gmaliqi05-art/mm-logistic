-- Migration: atomic super-admin subscription actions
--
-- Before this, src/pages/super-admin/CompanyPayments.tsx ran 2-3 separate
-- PostgREST updates per click (subscription update, optional companies
-- update, audit insert). If the browser tab closed mid-sequence, the
-- action persisted with no audit trail. "Activate" also did not record a
-- payment_transactions row, so manual activations were invisible to revenue
-- reports.
--
-- Wrap each action in a SECURITY DEFINER RPC that runs the whole sequence
-- in a single transaction and emits the audit + payment rows from the same
-- statement. Caller authentication is enforced inside the function so the
-- super-admin check cannot be skipped by a malicious client.

CREATE OR REPLACE FUNCTION public.admin_activate_subscription(
  p_subscription_id uuid,
  p_reason text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_role text;
  v_old_status text;
  v_company_id uuid;
  v_plan_id uuid;
  v_price numeric;
  v_payment_method text;
  v_period_end timestamptz := now() + interval '30 days';
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_role := private.get_user_role();
  IF v_role <> 'super_admin' THEN
    RAISE EXCEPTION 'only super_admin can activate subscriptions' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT cs.status, cs.company_id, cs.plan_id, cs.payment_method, p.price_monthly
    INTO v_old_status, v_company_id, v_plan_id, v_payment_method, v_price
  FROM public.company_subscriptions cs
  JOIN public.subscription_plans p ON p.id = cs.plan_id
  WHERE cs.id = p_subscription_id
  FOR UPDATE;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'subscription not found';
  END IF;

  UPDATE public.company_subscriptions
  SET status = 'active',
      current_period_start = now(),
      current_period_end = v_period_end,
      payment_method = CASE WHEN payment_method = 'free' THEN 'manual' ELSE payment_method END
  WHERE id = p_subscription_id;

  UPDATE public.companies
  SET is_active = true
  WHERE id = v_company_id;

  -- Manual activations should leave a payment_transactions trail so revenue
  -- reports include them. payment_method = 'manual' makes the source clear.
  INSERT INTO public.payment_transactions (
    company_id, amount, currency, status, payment_method,
    stripe_payment_id, description
  ) VALUES (
    v_company_id,
    COALESCE(v_price, 0),
    'eur',
    'completed',
    'manual',
    '',
    'Manual activation by super_admin'
  );

  INSERT INTO public.admin_subscription_actions (
    admin_id, company_id, subscription_id, action,
    old_status, new_status, reason, metadata
  ) VALUES (
    v_caller, v_company_id, p_subscription_id, 'activate',
    v_old_status, 'active', COALESCE(p_reason, ''),
    jsonb_build_object('period_end', v_period_end)
  );

  RETURN jsonb_build_object('ok', true, 'period_end', v_period_end);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_cancel_subscription(
  p_subscription_id uuid,
  p_reason text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_role text;
  v_old_status text;
  v_company_id uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_role := private.get_user_role();
  IF v_role <> 'super_admin' THEN
    RAISE EXCEPTION 'only super_admin can cancel subscriptions' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT status, company_id
    INTO v_old_status, v_company_id
  FROM public.company_subscriptions
  WHERE id = p_subscription_id
  FOR UPDATE;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'subscription not found';
  END IF;

  UPDATE public.company_subscriptions
  SET status = 'cancelled'
  WHERE id = p_subscription_id;

  INSERT INTO public.admin_subscription_actions (
    admin_id, company_id, subscription_id, action,
    old_status, new_status, reason, metadata
  ) VALUES (
    v_caller, v_company_id, p_subscription_id, 'cancel',
    v_old_status, 'cancelled', COALESCE(p_reason, ''),
    '{}'::jsonb
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_extend_subscription(
  p_subscription_id uuid,
  p_days integer,
  p_reason text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_role text;
  v_old_status text;
  v_company_id uuid;
  v_current_end timestamptz;
  v_new_end timestamptz;
  v_new_status text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_role := private.get_user_role();
  IF v_role <> 'super_admin' THEN
    RAISE EXCEPTION 'only super_admin can extend subscriptions' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_days IS NULL OR p_days <= 0 OR p_days > 3650 THEN
    RAISE EXCEPTION 'p_days must be between 1 and 3650';
  END IF;

  SELECT status, company_id, current_period_end
    INTO v_old_status, v_company_id, v_current_end
  FROM public.company_subscriptions
  WHERE id = p_subscription_id
  FOR UPDATE;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'subscription not found';
  END IF;

  -- If the current period already ended, restart from now; otherwise stack
  -- the new days onto the existing end date.
  v_new_end := COALESCE(v_current_end, now());
  IF v_new_end < now() THEN
    v_new_end := now();
  END IF;
  v_new_end := v_new_end + (p_days || ' days')::interval;

  v_new_status := CASE WHEN v_old_status = 'expired' THEN 'active' ELSE v_old_status END;

  UPDATE public.company_subscriptions
  SET status = v_new_status,
      current_period_end = v_new_end
  WHERE id = p_subscription_id;

  INSERT INTO public.admin_subscription_actions (
    admin_id, company_id, subscription_id, action,
    old_status, new_status, reason, metadata
  ) VALUES (
    v_caller, v_company_id, p_subscription_id, 'extend',
    v_old_status, v_new_status, COALESCE(p_reason, ''),
    jsonb_build_object('extended_days', p_days, 'new_period_end', v_new_end)
  );

  RETURN jsonb_build_object('ok', true, 'new_period_end', v_new_end);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_activate_subscription(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_cancel_subscription(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_extend_subscription(uuid, integer, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_activate_subscription(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cancel_subscription(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_extend_subscription(uuid, integer, text) TO authenticated;

COMMENT ON FUNCTION public.admin_activate_subscription IS
  'Atomic super-admin activation: flips subscription to active, sets is_active=true on the company, records a manual payment_transactions row, writes an audit row. SECURITY DEFINER with internal super_admin check; safe to expose to authenticated callers.';
COMMENT ON FUNCTION public.admin_cancel_subscription IS
  'Atomic super-admin cancellation: flips subscription to cancelled and writes an audit row. Does NOT disable companies.is_active or accounting_enabled — those are revoked by stripe-webhook via revokeCompanyAccessIfNoActiveSubscription when the Stripe-side state actually flips.';
COMMENT ON FUNCTION public.admin_extend_subscription IS
  'Atomic super-admin extension: adds p_days to current_period_end (or starts from now if the period already ended), revives expired subs to active, writes an audit row.';
