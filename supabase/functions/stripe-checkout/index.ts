import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@14.25.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { checkRateLimit, getClientIp, rateLimitResponse } from "../_shared/rateLimit.ts";
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

// Restrict success/cancel URLs to the request's own origin, plus an optional
// allowlist via APP_ALLOWED_ORIGINS (comma-separated). Without this guard,
// a tenant could ship Stripe a phishing URL that the post-payment redirect
// would land on (CVSS 6.1 open-redirect).
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function isAllowedRedirect(url: string, req: Request): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;

  const reqOrigin = req.headers.get("Origin") || req.headers.get("Referer");
  const allowed = new Set<string>();
  if (reqOrigin) {
    try { allowed.add(new URL(reqOrigin).origin); } catch { /* ignore */ }
  }
  const extra = Deno.env.get("APP_ALLOWED_ORIGINS") ?? "";
  for (const o of extra.split(",").map((s) => s.trim()).filter(Boolean)) {
    try { allowed.add(new URL(o).origin); } catch { /* ignore */ }
  }
  return allowed.has(parsed.origin);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const supabaseServiceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
      return jsonRes({ error: "Stripe is not configured" }, 503);
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2024-04-10" });

    const body = await req.json();
    const {
      planId,
      successUrl,
      cancelUrl,
      isUpgrade,
      billingInterval,
      companyId: bodyCompanyId,
      pendingPaymentToken: bodyPendingToken,
    } = body as {
      planId: string;
      successUrl: string;
      cancelUrl: string;
      isUpgrade?: boolean;
      // isAddon is intentionally NOT read from the request body — it is derived
      // server-side from the plan's product_type to prevent a tenant from
      // unlocking the accounting feature by paying for a cheap logistics plan
      // with `isAddon: true`. See PR #148 for related bypass history.
      billingInterval?: "monthly" | "yearly";
      companyId?: string;
      pendingPaymentToken?: string;
    };

    if (!planId || !successUrl || !cancelUrl) {
      return jsonRes({ error: "Missing required fields: planId, successUrl, cancelUrl" }, 400);
    }

    if (!isAllowedRedirect(successUrl, req) || !isAllowedRedirect(cancelUrl, req)) {
      return jsonRes({ error: "successUrl/cancelUrl must match the request origin" }, 400);
    }

    const authHeader = req.headers.get("Authorization");
    let companyId: string;
    let userId: string;
    let companyEmail: string;
    let companyName: string;

    if (authHeader) {
      // --- Authenticated path (upgrades, retry from payment-pending) ---
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return jsonRes({ error: "Unauthorized" }, 401);
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("id, company_id, role")
        .eq("id", user.id)
        .maybeSingle();

      if (!profile || !profile.company_id) {
        return jsonRes({ error: "No company associated" }, 400);
      }

      if (!["company_admin", "super_admin", "accountant"].includes(profile.role)) {
        return jsonRes({ error: "Only company admins can manage subscriptions" }, 403);
      }

      const { data: company } = await supabase
        .from("companies")
        .select("id, name, email")
        .eq("id", profile.company_id)
        .maybeSingle();

      if (!company) {
        return jsonRes({ error: "Company not found" }, 404);
      }

      companyId = company.id;
      userId = user.id;
      companyEmail = company.email || user.email || "";
      companyName = company.name;
    } else {
      // --- Unauthenticated path (new registration with pending_payment) ---
      // Requires a single-use token minted by register-company. Without it,
      // anyone who learned a tenant's UUID could initiate a checkout in
      // that tenant's name with a stolen card and have the chargeback land
      // on the victim (and on the platform Stripe account). See H1-sec in
      // the deep audit.
      if (!bodyCompanyId) {
        return jsonRes({ error: "Missing companyId for unauthenticated checkout" }, 400);
      }
      if (typeof bodyPendingToken !== "string" || bodyPendingToken.length !== 64) {
        return jsonRes({ error: "Missing or malformed pendingPaymentToken" }, 401);
      }

      const ip = getClientIp(req);
      const rl = await checkRateLimit(`stripe-checkout:ip=${ip}`, 10, 60_000);
      if (!rl.allowed) return rateLimitResponse(rl, corsHeaders);

      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRe.test(bodyCompanyId)) {
        return jsonRes({ error: "Invalid companyId" }, 400);
      }

      // Verify the company exists and has a pending_payment subscription
      // with a matching token. Constant-time compare to avoid timing leaks.
      const { data: pendingSub } = await supabase
        .from("company_subscriptions")
        .select("id, company_id, plan_id, pending_payment_token")
        .eq("company_id", bodyCompanyId)
        .eq("status", "pending_payment")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!pendingSub) {
        return jsonRes({ error: "No pending payment subscription found for this company" }, 404);
      }

      const stored = (pendingSub.pending_payment_token as string | null) ?? "";
      if (stored.length !== bodyPendingToken.length || !constantTimeEqual(stored, bodyPendingToken)) {
        return jsonRes({ error: "Invalid pendingPaymentToken" }, 401);
      }

      const { data: company } = await supabase
        .from("companies")
        .select("id, name, email, created_by")
        .eq("id", bodyCompanyId)
        .maybeSingle();

      if (!company) {
        return jsonRes({ error: "Company not found" }, 404);
      }

      companyId = company.id;
      userId = company.created_by;
      companyEmail = company.email || "";
      companyName = company.name;
    }

    // --- Common path: create Stripe checkout session ---
    const { data: plan } = await supabase
      .from("subscription_plans")
      .select("*")
      .eq("id", planId)
      .eq("is_active", true)
      .maybeSingle();

    if (!plan) {
      return jsonRes({ error: "Plan not found or inactive" }, 404);
    }

    // Derive isAddon from the plan itself, not from the client payload.
    // An accounting plan is treated as an addon when the tenant already has
    // a non-accounting (logistics) subscription; otherwise it becomes the
    // primary subscription. The webhook then flips accounting_enabled based
    // on this metadata, so it MUST originate from the plan row.
    const planIsAccounting = plan.product_type === "accounting";
    let isAddon = false;
    if (planIsAccounting) {
      const { data: primarySub } = await supabase
        .from("company_subscriptions")
        .select("id, status, plan:subscription_plans(product_type)")
        .eq("company_id", companyId)
        .in("status", ["active", "trial"])
        .order("created_at", { ascending: false });
      isAddon = Boolean(
        primarySub?.some((s: { plan: { product_type?: string } | null }) =>
          s.plan?.product_type === "logistics",
        ),
      );
    }

    const useYearly = billingInterval === "yearly" && plan.price_yearly != null && Number(plan.price_yearly) > 0;
    const unitAmount = useYearly
      ? Math.round(Number(plan.price_yearly) * 100)
      : Math.round(Number(plan.price_monthly) * 100);

    if (unitAmount <= 0) {
      return jsonRes({ error: "This plan has no price configured" }, 400);
    }

    const recurringInterval = useYearly ? "year" : "month";

    // If a pre-created Stripe Price ID exists, use it; otherwise build price_data dynamically
    const stripePriceId = useYearly ? plan.stripe_price_id_yearly : plan.stripe_price_id;

    const lineItem: Record<string, unknown> = stripePriceId
      ? { price: stripePriceId, quantity: 1 }
      : {
          price_data: {
            currency: "eur",
            product_data: {
              name: plan.display_name || plan.name,
              metadata: { plan_id: plan.id },
            },
            unit_amount: unitAmount,
            recurring: { interval: recurringInterval },
          },
          quantity: 1,
        };

    // Get or create Stripe customer
    const { data: existingSub } = await supabase
      .from("company_subscriptions")
      .select("stripe_customer_id")
      .eq("company_id", companyId)
      .not("stripe_customer_id", "is", null)
      .not("stripe_customer_id", "eq", "")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let stripeCustomerId = existingSub?.stripe_customer_id;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: companyEmail,
        name: companyName,
        metadata: {
          company_id: companyId,
          user_id: userId,
        },
      });
      stripeCustomerId = customer.id;
    }

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "subscription",
      line_items: [lineItem as Stripe.Checkout.SessionCreateParams.LineItem],
      success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
      metadata: {
        company_id: companyId,
        plan_id: plan.id,
        user_id: userId,
        is_upgrade: isUpgrade ? "true" : "false",
        is_addon: isAddon ? "true" : "false",
        billing_interval: useYearly ? "yearly" : "monthly",
      },
      subscription_data: {
        metadata: {
          company_id: companyId,
          plan_id: plan.id,
        },
      },
    });

    // Track the checkout session
    await supabase.from("subscription_checkout_sessions").insert({
      company_id: companyId,
      plan_id: plan.id,
      stripe_session_id: session.id,
      status: "pending",
      is_upgrade: isUpgrade || false,
      is_addon: isAddon || false,
      metadata: { stripe_customer_id: stripeCustomerId },
    });

    return jsonRes({ url: session.url, sessionId: session.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return jsonRes({ error: message }, 500);
  }
});
