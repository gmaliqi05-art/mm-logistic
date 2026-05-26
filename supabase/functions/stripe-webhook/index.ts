import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@14.25.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function notifySuperAdmins(
  companyName: string,
  planName: string,
  amountEur: number,
): Promise<void> {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/dispatch-notification`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channelCode: "system.broadcast",
        title: `Pagese e re: ${companyName}`,
        body: `Kompania "${companyName}" ka perfunduar pagesen per planin ${planName} (${amountEur.toFixed(2)}\u20AC). Llogaria eshte aktivizuar automatikisht.`,
        recipientRoles: ["super_admin"],
        targetPlatforms: ["web", "android", "ios"],
        data: { type: "payment_completed", company_name: companyName, plan_name: planName },
        url: "/super-admin/companies",
      }),
    });
  } catch (e) {
    console.error("Failed to notify super admins about payment", e);
  }
}

async function sendWelcomeEmail(
  userId: string,
  companyId: string,
  adminEmail: string,
  adminName: string,
  companyName: string,
): Promise<void> {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        template_code: "welcome_company",
        to: adminEmail,
        user_id: userId,
        company_id: companyId,
        locale: "sq",
        data: { full_name: adminName || adminEmail, company_name: companyName },
      }),
    });
  } catch (e) {
    console.error("Failed to send welcome email", e);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

    if (!stripeKey || !webhookSecret) {
      return new Response(
        JSON.stringify({ error: "Stripe not configured" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2024-04-10" });
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = await req.text();
    const sig = req.headers.get("stripe-signature");

    if (!sig) {
      return new Response(
        JSON.stringify({ error: "Missing stripe-signature header" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid signature";
      return new Response(
        JSON.stringify({ error: `Webhook signature verification failed: ${msg}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: inserted, error: idemErr } = await supabase
      .from("stripe_webhook_events")
      .insert({ event_id: event.id, event_type: event.type })
      .select("event_id")
      .maybeSingle();
    if (idemErr) {
      if ((idemErr as { code?: string }).code === "23505") {
        return new Response(
          JSON.stringify({ received: true, duplicate: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw idemErr;
    }
    if (!inserted) {
      return new Response(
        JSON.stringify({ received: true, duplicate: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    try {
      let details: Record<string, unknown> | null = null;
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          await handleCheckoutCompleted(supabase, stripe, session);
          details = {
            company_id: session.metadata?.company_id ?? null,
            plan_id: session.metadata?.plan_id ?? null,
            amount_total: session.amount_total,
            currency: session.currency,
            customer: session.customer,
            subscription: session.subscription,
          };
          break;
        }
        case "invoice.paid": {
          const invoice = event.data.object as Stripe.Invoice;
          await handleInvoicePaid(supabase, invoice);
          details = {
            invoice_id: invoice.id,
            invoice_number: invoice.number,
            customer: invoice.customer,
            subscription: invoice.subscription,
            amount_paid: invoice.amount_paid,
            currency: invoice.currency,
          };
          break;
        }
        case "invoice.payment_failed": {
          const invoice = event.data.object as Stripe.Invoice;
          await handlePaymentFailed(supabase, invoice);
          details = {
            invoice_id: invoice.id,
            customer: invoice.customer,
            subscription: invoice.subscription,
            attempt_count: invoice.attempt_count,
            next_payment_attempt: invoice.next_payment_attempt,
          };
          break;
        }
        case "customer.subscription.updated": {
          const subscription = event.data.object as Stripe.Subscription;
          await handleSubscriptionUpdated(supabase, subscription);
          details = {
            company_id: subscription.metadata?.company_id ?? null,
            subscription_id: subscription.id,
            new_status: subscription.status,
            cancel_at_period_end: subscription.cancel_at_period_end,
            current_period_end: subscription.current_period_end,
          };
          break;
        }
        case "customer.subscription.deleted": {
          const subscription = event.data.object as Stripe.Subscription;
          await handleSubscriptionDeleted(supabase, subscription);
          details = {
            company_id: subscription.metadata?.company_id ?? null,
            subscription_id: subscription.id,
            canceled_at: subscription.canceled_at,
          };
          break;
        }
        default:
          break;
      }
      if (details) {
        await supabase
          .from("stripe_webhook_events")
          .update({ details })
          .eq("event_id", event.id)
          .then(({ error }) => {
            if (error) console.error("stripe audit update failed", event.id, error);
          });
      }
    } catch (handlerErr) {
      await supabase
        .from("stripe_webhook_events")
        .delete()
        .eq("event_id", event.id);
      throw handlerErr;
    }

    return new Response(
      JSON.stringify({ received: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("Webhook error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function handleCheckoutCompleted(
  supabase: ReturnType<typeof createClient>,
  stripe: Stripe,
  session: Stripe.Checkout.Session
) {
  const companyId = session.metadata?.company_id;
  const planId = session.metadata?.plan_id;
  const isUpgrade = session.metadata?.is_upgrade === "true";
  const isAddon = session.metadata?.is_addon === "true";

  if (!companyId || !planId) return;

  await supabase
    .from("subscription_checkout_sessions")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("stripe_session_id", session.id);

  const stripeSubscription = await stripe.subscriptions.retrieve(
    session.subscription as string
  );

  const periodStart = new Date(stripeSubscription.current_period_start * 1000).toISOString();
  const periodEnd = new Date(stripeSubscription.current_period_end * 1000).toISOString();

  // Check if there's an existing pending_payment subscription to activate
  const { data: pendingSub } = await supabase
    .from("company_subscriptions")
    .select("id")
    .eq("company_id", companyId)
    .eq("status", "pending_payment")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (pendingSub) {
    // Activate the pending subscription (new registration flow)
    await supabase
      .from("company_subscriptions")
      .update({
        status: "active",
        plan_id: planId,
        stripe_subscription_id: stripeSubscription.id,
        stripe_customer_id: session.customer as string,
        current_period_start: periodStart,
        current_period_end: periodEnd,
        payment_method: "stripe",
      })
      .eq("id", pendingSub.id);
  } else {
    // Upgrade flow: cancel old active subscription and create new one
    if (isUpgrade) {
      await supabase
        .from("company_subscriptions")
        .update({ status: "cancelled" })
        .eq("company_id", companyId)
        .eq("status", "active");
    }

    await supabase.from("company_subscriptions").insert({
      company_id: companyId,
      plan_id: planId,
      status: "active",
      stripe_subscription_id: stripeSubscription.id,
      stripe_customer_id: session.customer as string,
      current_period_start: periodStart,
      current_period_end: periodEnd,
      payment_method: "stripe",
    });
  }

  // Always activate the company when payment succeeds
  await supabase
    .from("companies")
    .update({ is_active: true })
    .eq("id", companyId);

  if (isAddon) {
    await supabase
      .from("companies")
      .update({ accounting_enabled: true })
      .eq("id", companyId);
  }

  const amountTotal = session.amount_total ?? 0;
  await supabase.from("payment_transactions").insert({
    company_id: companyId,
    amount: amountTotal / 100,
    currency: session.currency || "eur",
    status: "completed",
    payment_method: "stripe",
    stripe_payment_id: session.payment_intent as string || session.id,
    description: `Subscription: ${isUpgrade ? "Upgrade" : "New"} plan`,
  });

  // Send welcome email + notify super admins
  const { data: company } = await supabase
    .from("companies")
    .select("id, name, created_by")
    .eq("id", companyId)
    .maybeSingle();

  const { data: plan } = await supabase
    .from("subscription_plans")
    .select("name, display_name")
    .eq("id", planId)
    .maybeSingle();

  const planDisplayName = plan?.display_name || plan?.name || "Standard";

  if (company) {
    const { data: adminProfile } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .eq("id", company.created_by)
      .maybeSingle();

    if (adminProfile) {
      await sendWelcomeEmail(
        adminProfile.id,
        companyId,
        adminProfile.email,
        adminProfile.full_name || "",
        company.name,
      );
    }

    await notifySuperAdmins(company.name, planDisplayName, amountTotal / 100);
  }
}

async function handleInvoicePaid(
  supabase: ReturnType<typeof createClient>,
  invoice: Stripe.Invoice
) {
  const subscriptionId = invoice.subscription as string;
  if (!subscriptionId) return;

  const { data: sub } = await supabase
    .from("company_subscriptions")
    .select("id, company_id")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();

  if (!sub) return;

  const periodEnd = invoice.lines?.data?.[0]?.period?.end;
  if (periodEnd) {
    await supabase
      .from("company_subscriptions")
      .update({
        status: "active",
        current_period_end: new Date(periodEnd * 1000).toISOString(),
      })
      .eq("id", sub.id);
  }

  await supabase.from("payment_transactions").insert({
    company_id: sub.company_id,
    amount: (invoice.amount_paid ?? 0) / 100,
    currency: invoice.currency || "eur",
    status: "completed",
    payment_method: "stripe",
    stripe_payment_id: invoice.payment_intent as string || invoice.id,
    description: `Invoice payment: ${invoice.number || invoice.id}`,
  });
}

async function handlePaymentFailed(
  supabase: ReturnType<typeof createClient>,
  invoice: Stripe.Invoice
) {
  const subscriptionId = invoice.subscription as string;
  if (!subscriptionId) return;

  const { data: sub } = await supabase
    .from("company_subscriptions")
    .select("id, company_id")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();

  if (!sub) return;

  await supabase
    .from("company_subscriptions")
    .update({ status: "past_due" })
    .eq("id", sub.id);

  await supabase.from("payment_transactions").insert({
    company_id: sub.company_id,
    amount: (invoice.amount_due ?? 0) / 100,
    currency: invoice.currency || "eur",
    status: "failed",
    payment_method: "stripe",
    stripe_payment_id: invoice.payment_intent as string || invoice.id,
    description: `Failed payment: ${invoice.number || invoice.id}`,
  });
}

async function handleSubscriptionUpdated(
  supabase: ReturnType<typeof createClient>,
  subscription: Stripe.Subscription
) {
  const companyId = subscription.metadata?.company_id;
  if (!companyId) return;

  const periodEnd = new Date(subscription.current_period_end * 1000).toISOString();
  let status = "active";

  if (subscription.status === "past_due") status = "past_due";
  else if (subscription.status === "canceled") status = "cancelled";
  else if (subscription.status === "unpaid") status = "expired";

  await supabase
    .from("company_subscriptions")
    .update({
      status,
      current_period_end: periodEnd,
    })
    .eq("stripe_subscription_id", subscription.id);
}

async function handleSubscriptionDeleted(
  supabase: ReturnType<typeof createClient>,
  subscription: Stripe.Subscription
) {
  await supabase
    .from("company_subscriptions")
    .update({ status: "cancelled" })
    .eq("stripe_subscription_id", subscription.id);
}
