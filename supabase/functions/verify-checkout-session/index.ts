import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@14.25.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { requireEnv } from "../_shared/env.ts";
import { checkRateLimit, getClientIp, rateLimitResponse } from "../_shared/rateLimit.ts";

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

// Stripe moved current_period_start/end off the Subscription object and onto
// its items in API version 2025-03-31.basil. On newer accounts these top-level
// fields are undefined, and `new Date(undefined * 1000).toISOString()` throws a
// RangeError — the exact crash that disabled the live webhook. Read item-level
// first, fall back to the legacy top-level field, return null when neither is a
// valid unix timestamp. (Mirrors stripe-webhook/index.ts.)
function toIsoOrNull(unixSeconds: unknown): string | null {
  if (typeof unixSeconds !== "number" || !Number.isFinite(unixSeconds)) return null;
  const d = new Date(unixSeconds * 1000);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function getSubscriptionPeriod(
  subscription: Stripe.Subscription,
): { start: string | null; end: string | null } {
  const top = subscription as unknown as {
    current_period_start?: number;
    current_period_end?: number;
  };
  const item = subscription.items?.data?.[0] as unknown as {
    current_period_start?: number;
    current_period_end?: number;
  } | undefined;
  return {
    start: toIsoOrNull(top.current_period_start ?? item?.current_period_start),
    end: toIsoOrNull(top.current_period_end ?? item?.current_period_end),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // Allow unauthenticated calls: users returning from Stripe redirect
    // may not have an active session. The Stripe session_id itself is the
    // proof of payment — we verify it against Stripe's API below. Rate
    // limit defends against an attacker probing the activation path with
    // guessed session ids (M2-sec).
    const ip = getClientIp(req);
    const rl = await checkRateLimit(`verify-checkout-session:ip=${ip}`, 20, 60_000);
    if (!rl.allowed) return rateLimitResponse(rl, corsHeaders);

    const supabaseUrl = requireEnv("SUPABASE_URL");
    const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, serviceKey);

    const { sessionId } = (await req.json()) as { sessionId: string };
    if (!sessionId || typeof sessionId !== "string" || sessionId.length > 200) {
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

    // Get subscription details from Stripe. Resolve the subscription object
    // (already expanded, or retrieve by id), then extract the period via the
    // version-safe helper so a newer API shape can't crash this path.
    const expanded = session.subscription;
    let stripeSub: Stripe.Subscription | null = null;
    if (expanded && typeof expanded === "object") {
      stripeSub = expanded as Stripe.Subscription;
    } else if (typeof expanded === "string") {
      try {
        stripeSub = await stripe.subscriptions.retrieve(expanded);
      } catch (e) {
        console.error("verify: subscription retrieve failed", expanded, e);
      }
    }

    const period = stripeSub ? getSubscriptionPeriod(stripeSub) : { start: null, end: null };
    const stripeSubId = stripeSub?.id ?? (typeof expanded === "string" ? expanded : "");

    // Preserve the previous fallback: when Stripe gives us no usable period
    // (no subscription, or fields absent), default to a 30-day window so the
    // tenant is still activated rather than left in pending_payment.
    const periodStart = period.start ?? new Date().toISOString();
    const periodEnd = period.end ?? (() => {
      const end = new Date();
      end.setDate(end.getDate() + 30);
      return end.toISOString();
    })();

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
          // Burn the single-use unauth checkout token after activation.
          pending_payment_token: null,
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
    // Log server-side; return generic text. This path is reachable without a
    // session (Stripe redirect return), so don't echo internal error detail.
    console.error("verify-checkout-session error:", err instanceof Error ? err.message : err);
    return jsonRes({ error: "Internal server error" }, 500);
  }
});
