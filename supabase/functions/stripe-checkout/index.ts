import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@14.25.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      return jsonRes({ error: "Stripe is not configured" }, 503);
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2024-04-10" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const {
      planId,
      successUrl,
      cancelUrl,
      isUpgrade,
      isAddon,
      billingInterval,
      companyId: bodyCompanyId,
    } = body as {
      planId: string;
      successUrl: string;
      cancelUrl: string;
      isUpgrade?: boolean;
      isAddon?: boolean;
      billingInterval?: "monthly" | "yearly";
      companyId?: string;
    };

    if (!planId || !successUrl || !cancelUrl) {
      return jsonRes({ error: "Missing required fields: planId, successUrl, cancelUrl" }, 400);
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
      if (!bodyCompanyId) {
        return jsonRes({ error: "Missing companyId for unauthenticated checkout" }, 400);
      }

      const ip = getClientIp(req);
      const rl = await checkRateLimit(`stripe-checkout:ip=${ip}`, 10, 60_000);
      if (!rl.allowed) return rateLimitResponse(rl, corsHeaders);

      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRe.test(bodyCompanyId)) {
        return jsonRes({ error: "Invalid companyId" }, 400);
      }

      // Verify the company exists and has a pending_payment subscription
      const { data: pendingSub } = await supabase
        .from("company_subscriptions")
        .select("id, company_id, plan_id")
        .eq("company_id", bodyCompanyId)
        .eq("status", "pending_payment")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!pendingSub) {
        return jsonRes({ error: "No pending payment subscription found for this company" }, 404);
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

    const useYearly = billingInterval === "yearly" && plan.stripe_price_id_yearly;
    const stripePriceId = useYearly ? plan.stripe_price_id_yearly : plan.stripe_price_id;

    if (!stripePriceId) {
      return jsonRes(
        { error: "This plan has no Stripe price configured. Contact administrator." },
        400,
      );
    }

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
      line_items: [{ price: stripePriceId, quantity: 1 }],
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
