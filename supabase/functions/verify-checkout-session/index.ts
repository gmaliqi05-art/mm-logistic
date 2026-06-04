import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@14.25.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { requireEnv } from "../_shared/env.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // Allow unauthenticated calls: users returning from Stripe redirect
    // may not have an active session. The Stripe session_id itself is the
    // proof of payment — we verify it against Stripe's API below.

    const supabaseUrl = requireEnv("SUPABASE_URL");
    const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, serviceKey);

    const { sessionId } = (await req.json()) as { sessionId: string };
    if (!sessionId) {
      return jsonRes({ error: "sessionId required" }, 400);
    }

    // Load Stripe key
    let stripeKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
    if (!stripeKey) {
      const { data } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", "stripe_secret_key")
        .maybeSingle();
      if (data?.value) stripeKey = data.value;
    }
    if (!stripeKey) {
      return jsonRes({ error: "Stripe not configured" }, 503);
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2024-04-10" });

    // Retrieve the checkout session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"],
    });

    if (session.payment_status !== "paid" && session.status !== "complete") {
      return jsonRes({
        status: "not_paid",
        payment_status: session.payment_status,
        session_status: session.status,
      });
    }

    const companyId = session.metadata?.company_id;
    const planId = session.metadata?.plan_id;
    const isAddon = session.metadata?.is_addon === "true";

    if (!companyId || !planId) {
      return jsonRes({ error: "Missing metadata in session" }, 400);
    }

    // Check if already activated (webhook may have processed it)
    const { data: existingActive } = await supabase
      .from("company_subscriptions")
      .select("id, status")
      .eq("company_id", companyId)
      .eq("status", "active")
      .maybeSingle();

    if (existingActive) {
      // Mark checkout session as completed too
      await supabase
        .from("subscription_checkout_sessions")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("stripe_session_id", sessionId);

      return jsonRes({ status: "already_active", subscription_id: existingActive.id });
    }

    // Get subscription details from Stripe
    const stripeSubscription = session.subscription as Stripe.Subscription | null;
    let periodStart: string;
    let periodEnd: string;
    let stripeSubId: string;

    if (stripeSubscription && typeof stripeSubscription === "object") {
      periodStart = new Date(stripeSubscription.current_period_start * 1000).toISOString();
      periodEnd = new Date(stripeSubscription.current_period_end * 1000).toISOString();
      stripeSubId = stripeSubscription.id;
    } else if (typeof session.subscription === "string") {
      const sub = await stripe.subscriptions.retrieve(session.subscription);
      periodStart = new Date(sub.current_period_start * 1000).toISOString();
      periodEnd = new Date(sub.current_period_end * 1000).toISOString();
      stripeSubId = sub.id;
    } else {
      periodStart = new Date().toISOString();
      const end = new Date();
      end.setDate(end.getDate() + 30);
      periodEnd = end.toISOString();
      stripeSubId = "";
    }

    const customerId = typeof session.customer === "string"
      ? session.customer
      : (session.customer as Stripe.Customer | null)?.id ?? "";

    // Activate the pending subscription
    const { data: pendingSub } = await supabase
      .from("company_subscriptions")
      .select("id")
      .eq("company_id", companyId)
      .eq("status", "pending_payment")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pendingSub) {
      await supabase
        .from("company_subscriptions")
        .update({
          status: "active",
          plan_id: planId,
          stripe_subscription_id: stripeSubId,
          stripe_customer_id: customerId,
          current_period_start: periodStart,
          current_period_end: periodEnd,
          payment_method: "stripe",
        })
        .eq("id", pendingSub.id);
    } else {
      await supabase.from("company_subscriptions").insert({
        company_id: companyId,
        plan_id: planId,
        status: "active",
        stripe_subscription_id: stripeSubId,
        stripe_customer_id: customerId,
        current_period_start: periodStart,
        current_period_end: periodEnd,
        payment_method: "stripe",
      });
    }

    // Activate the company. Mirror the webhook (stripe-webhook handleCheckoutCompleted):
    // for an accounting addon purchase we also flip accounting_enabled = true here,
    // otherwise a user returning to the success URL before the webhook fires would
    // remain locked out of /accounting/* despite a successful payment.
    const companyUpdate: { is_active: boolean; accounting_enabled?: boolean } = { is_active: true };
    if (isAddon) {
      companyUpdate.accounting_enabled = true;
    }
    await supabase
      .from("companies")
      .update(companyUpdate)
      .eq("id", companyId);

    // Mark checkout session as completed
    await supabase
      .from("subscription_checkout_sessions")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("stripe_session_id", sessionId);

    // Record the payment transaction
    const amountTotal = session.amount_total ?? 0;
    // Upsert on stripe_payment_id so the inverse race (webhook beats us)
    // doesn't 23505. The UNIQUE index added in 20260604100011 makes this
    // path the dedupe boundary for both verify-checkout-session and the
    // stripe-webhook handlers.
    await supabase.from("payment_transactions").upsert({
      company_id: companyId,
      amount: amountTotal / 100,
      currency: session.currency || "eur",
      status: "completed",
      payment_method: "stripe",
      stripe_payment_id: (session.payment_intent as string) || session.id,
      description: "Subscription payment (verified via checkout session)",
    }, { onConflict: "stripe_payment_id", ignoreDuplicates: true }).then(({ error }) => {
      if (error) console.error("payment_transactions upsert error:", error);
    });

    // Log a webhook-equivalent event for auditing
    await supabase.from("stripe_webhook_events").insert({
      event_id: `verify_${session.id}_${Date.now()}`,
      event_type: "checkout.session.verified",
      details: {
        company_id: companyId,
        plan_id: planId,
        amount_total: amountTotal,
        currency: session.currency,
        customer: customerId,
        subscription: stripeSubId,
        source: "verify-checkout-session",
      },
    }).then(({ error }) => {
      if (error) console.error("stripe_webhook_events insert error:", error);
    });

    return jsonRes({
      status: "activated",
      company_id: companyId,
      plan_id: planId,
      period_end: periodEnd,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("verify-checkout-session error:", message);
    return jsonRes({ error: message }, 500);
  }
});
