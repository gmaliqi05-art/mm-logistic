import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@14.25.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      return new Response(
        JSON.stringify({ error: "Stripe is not configured" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2024-04-10" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, company_id, role")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile || !profile.company_id) {
      return new Response(
        JSON.stringify({ error: "No company associated" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!["company_admin", "super_admin"].includes(profile.role)) {
      return new Response(
        JSON.stringify({ error: "Only company admins can manage subscriptions" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { planId, successUrl, cancelUrl, isUpgrade, isAddon } = body as {
      planId: string;
      successUrl: string;
      cancelUrl: string;
      isUpgrade?: boolean;
      isAddon?: boolean;
    };

    if (!planId || !successUrl || !cancelUrl) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: planId, successUrl, cancelUrl" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: plan } = await supabase
      .from("subscription_plans")
      .select("*")
      .eq("id", planId)
      .eq("is_active", true)
      .maybeSingle();

    if (!plan) {
      return new Response(
        JSON.stringify({ error: "Plan not found or inactive" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!plan.stripe_price_id) {
      return new Response(
        JSON.stringify({ error: "This plan has no Stripe price configured. Contact administrator." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: company } = await supabase
      .from("companies")
      .select("id, name, email")
      .eq("id", profile.company_id)
      .maybeSingle();

    if (!company) {
      return new Response(
        JSON.stringify({ error: "Company not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get or create Stripe customer
    const { data: existingSub } = await supabase
      .from("company_subscriptions")
      .select("stripe_customer_id")
      .eq("company_id", profile.company_id)
      .not("stripe_customer_id", "is", null)
      .not("stripe_customer_id", "eq", "")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let stripeCustomerId = existingSub?.stripe_customer_id;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: company.email || user.email,
        name: company.name,
        metadata: {
          company_id: company.id,
          user_id: user.id,
        },
      });
      stripeCustomerId = customer.id;
    }

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "subscription",
      line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
      success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
      metadata: {
        company_id: company.id,
        plan_id: plan.id,
        user_id: user.id,
        is_upgrade: isUpgrade ? "true" : "false",
        is_addon: isAddon ? "true" : "false",
      },
      subscription_data: {
        metadata: {
          company_id: company.id,
          plan_id: plan.id,
        },
      },
    });

    // Track the checkout session
    await supabase.from("subscription_checkout_sessions").insert({
      company_id: company.id,
      plan_id: plan.id,
      stripe_session_id: session.id,
      status: "pending",
      is_upgrade: isUpgrade || false,
      is_addon: isAddon || false,
      metadata: { stripe_customer_id: stripeCustomerId },
    });

    return new Response(
      JSON.stringify({ url: session.url, sessionId: session.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
