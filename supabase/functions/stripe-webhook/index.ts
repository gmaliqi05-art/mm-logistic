import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@14.25.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

let _url: string, _key: string;
function getEnv() {
  if (!_url) { _url = requireEnv("SUPABASE_URL"); _key = requireEnv("SUPABASE_SERVICE_ROLE_KEY"); }
  return { url: _url, key: _key };
}

async function getStripeSecrets(
  supabase: ReturnType<typeof createClient>,
): Promise<{ stripeKey: string; webhookSecret: string } | null> {
  // platform_settings is the source of truth managed by super-admin via
  // PaymentSettings.tsx. Env vars are a fallback only — intentionally lower
  // priority so a stale env var can't override a freshly rotated secret.
  let stripeKey = "";
  let webhookSecret = "";

  const { data } = await supabase
    .from("platform_settings")
    .select("key, value")
    .in("key", ["stripe_secret_key", "stripe_webhook_secret"]);

  if (data) {
    for (const row of data) {
      if (row.key === "stripe_secret_key" && row.value) stripeKey = row.value;
      if (row.key === "stripe_webhook_secret" && row.value) webhookSecret = row.value;
    }
  }

  if (!stripeKey) stripeKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (!webhookSecret) webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

  if (!stripeKey || !webhookSecret) return null;
  return { stripeKey, webhookSecret };
}

// Stripe moved `current_period_start` / `current_period_end` OFF the
// Subscription object and ONTO its items in API version 2025-03-31.basil.
// Newer accounts (and webhook payloads serialized with a newer version)
// therefore deliver subscription objects where `current_period_end` is
// undefined. The previous code did `new Date(undefined * 1000).toISOString()`
// → RangeError, which crashed handleSubscriptionUpdated on every
// customer.subscription.updated event and ultimately got the live endpoint
// disabled by Stripe after nine consecutive days of failures.
//
// Read the item-level field first, fall back to the (legacy) top-level
// field, and return null when neither is a valid unix timestamp.
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

// `invoice.subscription` was likewise relocated to
// `invoice.parent.subscription_details.subscription` in newer API versions.
// Resolve from either shape so renewal invoices keep updating the right
// company_subscriptions row instead of silently no-op'ing.
function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const direct = (invoice as unknown as { subscription?: string | { id?: string } }).subscription;
  if (typeof direct === "string" && direct) return direct;
  if (direct && typeof direct === "object" && direct.id) return direct.id;

  const parent = (invoice as unknown as {
    parent?: { subscription_details?: { subscription?: string | { id?: string } } };
  }).parent;
  const ps = parent?.subscription_details?.subscription;
  if (typeof ps === "string" && ps) return ps;
  if (ps && typeof ps === "object" && ps.id) return ps.id;
  return null;
}

async function notifySuperAdmins(
  companyName: string,
  planName: string,
  amountEur: number,
): Promise<void> {
  try {
    const { url, key } = getEnv();
    await fetch(`${url}/functions/v1/dispatch-notification`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channelCode: "system.broadcast",
        title: `Pagese e re: ${companyName}`,
        body: `Kompania "${companyName}" ka perfunduar pagesen per planin ${planName} (${amountEur.toFixed(2)}€). Llogaria eshte aktivizuar automatikisht.`,
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
    const { url, key } = getEnv();
    await fetch(`${url}/functions/v1/send-email`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
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
    const { url: sbUrl, key: sbKey } = getEnv();
    const supabase = createClient(sbUrl, sbKey);
    const secrets = await getStripeSecrets(supabase);

    if (!secrets) {
      return new Response(
        JSON.stringify({ error: "Stripe not configured" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const stripe = new Stripe(secrets.stripeKey, { apiVersion: "2024-04-10" });

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
      // constructEventAsync is required in Deno — SubtleCrypto is async-only
      // so the sync constructEvent throws SubtleCryptoProvider errors here.
      event = await stripe.webhooks.constructEventAsync(body, sig, secrets.webhookSecret);
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
            subscription: getInvoiceSubscriptionId(invoice),
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
            subscription: getInvoiceSubscriptionId(invoice),
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
            current_period_end: getSubscriptionPeriod(subscription).end,
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

  // The subscription may have been cancelled/deleted between checkout and
  // webhook delivery (or a retry days later). Don't let a missing
  // subscription throw — fall back to the id Stripe already gave us on the
  // session and leave the period columns untouched.
  let stripeSubscription: Stripe.Subscription | null = null;
  const subscriptionId = session.subscription as string | null;
  if (subscriptionId) {
    try {
      stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
    } catch (e) {
      console.error("checkout: subscription retrieve failed", subscriptionId, e);
    }
  }

  const period = stripeSubscription
    ? getSubscriptionPeriod(stripeSubscription)
    : { start: null, end: null };
  const resolvedSubId = stripeSubscription?.id ?? subscriptionId;

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
        stripe_subscription_id: resolvedSubId,
        stripe_customer_id: session.customer as string,
        // Only overwrite period columns when we actually resolved them, so a
        // missing field doesn't blank out an otherwise-valid period.
        ...(period.start ? { current_period_start: period.start } : {}),
        ...(period.end ? { current_period_end: period.end } : {}),
        payment_method: "stripe",
        // Burn the single-use unauth checkout token so a leaked value cannot
        // be replayed to mint a second checkout in this tenant's name.
        pending_payment_token: null,
      })
      .eq("id", pendingSub.id);
  } else {
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
      stripe_subscription_id: resolvedSubId,
      stripe_customer_id: session.customer as string,
      ...(period.start ? { current_period_start: period.start } : {}),
      ...(period.end ? { current_period_end: period.end } : {}),
      payment_method: "stripe",
    });
  }

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
  // Use upsert so a race with verify-checkout-session (which records the same
  // payment when the user returns before the webhook fires) doesn't 23505.
  await supabase.from("payment_transactions").upsert({
    company_id: companyId,
    amount: amountTotal / 100,
    currency: session.currency || "eur",
    status: "completed",
    payment_method: "stripe",
    stripe_payment_id: session.payment_intent as string || session.id,
    description: `Subscription: ${isUpgrade ? "Upgrade" : "New"} plan`,
  }, { onConflict: "stripe_payment_id", ignoreDuplicates: true });

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
  const subscriptionId = getInvoiceSubscriptionId(invoice);
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

  await supabase.from("payment_transactions").upsert({
    company_id: sub.company_id,
    amount: (invoice.amount_paid ?? 0) / 100,
    currency: invoice.currency || "eur",
    status: "completed",
    payment_method: "stripe",
    stripe_payment_id: invoice.payment_intent as string || invoice.id,
    description: `Invoice payment: ${invoice.number || invoice.id}`,
  }, { onConflict: "stripe_payment_id", ignoreDuplicates: true });
}

async function handlePaymentFailed(
  supabase: ReturnType<typeof createClient>,
  invoice: Stripe.Invoice
) {
  const subscriptionId = getInvoiceSubscriptionId(invoice);
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

  await supabase.from("payment_transactions").upsert({
    company_id: sub.company_id,
    amount: (invoice.amount_due ?? 0) / 100,
    currency: invoice.currency || "eur",
    status: "failed",
    payment_method: "stripe",
    stripe_payment_id: invoice.payment_intent as string || invoice.id,
    description: `Failed payment: ${invoice.number || invoice.id}`,
  }, { onConflict: "stripe_payment_id", ignoreDuplicates: true });
}

async function handleSubscriptionUpdated(
  supabase: ReturnType<typeof createClient>,
  subscription: Stripe.Subscription
) {
  const companyId = subscription.metadata?.company_id;
  if (!companyId) return;

  const { end: periodEnd } = getSubscriptionPeriod(subscription);
  let status = "active";
  let revokeAccess = false;

  if (subscription.status === "past_due") status = "past_due";
  else if (subscription.status === "canceled") { status = "cancelled"; revokeAccess = true; }
  else if (subscription.status === "unpaid") { status = "expired"; revokeAccess = true; }

  await supabase
    .from("company_subscriptions")
    .update({
      status,
      // Skip the period column when Stripe didn't include it (newer API
      // versions omit it on the subscription object) rather than crashing.
      ...(periodEnd ? { current_period_end: periodEnd } : {}),
    })
    .eq("stripe_subscription_id", subscription.id);

  // When Stripe marks the subscription as terminally lost, revoke feature
  // flags on the company so a tenant cannot keep reading/writing acc_*
  // tables (gated by has_active_accounting) or get the active UI banner.
  if (revokeAccess) {
    await revokeCompanyAccessIfNoActiveSubscription(supabase, companyId);
  }
}

async function handleSubscriptionDeleted(
  supabase: ReturnType<typeof createClient>,
  subscription: Stripe.Subscription
) {
  const companyId = subscription.metadata?.company_id;
  await supabase
    .from("company_subscriptions")
    .update({ status: "cancelled" })
    .eq("stripe_subscription_id", subscription.id);

  if (companyId) {
    await revokeCompanyAccessIfNoActiveSubscription(supabase, companyId);
  }
}

// Revoke companies.is_active and companies.accounting_enabled when the
// company no longer has ANY active/trial subscription. We re-check rather
// than blindly disabling because a tenant may have multiple subscriptions
// (e.g. logistics primary + accounting addon); cancelling one shouldn't kill
// access granted by the other.
async function revokeCompanyAccessIfNoActiveSubscription(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
) {
  const { data: surviving } = await supabase
    .from("company_subscriptions")
    .select("id, plan:subscription_plans(product_type)")
    .eq("company_id", companyId)
    .in("status", ["active", "trial"]);

  const subs = (surviving ?? []) as Array<{ plan: { product_type?: string } | null }>;
  const hasAny = subs.length > 0;
  const hasAccounting = subs.some((s) => s.plan?.product_type === "accounting");

  const update: { is_active?: boolean; accounting_enabled?: boolean } = {};
  if (!hasAny) update.is_active = false;
  // accounting_enabled should track *either* an accounting plan OR (for the
  // addon flow) any active subscription combined with the original purchase.
  // Conservative rule: only keep accounting_enabled when there is still an
  // accounting-typed subscription. Pure addon purchasers will lose it when
  // their addon is cancelled, which matches Stripe's source-of-truth.
  if (!hasAccounting) update.accounting_enabled = false;

  if (Object.keys(update).length === 0) return;
  await supabase.from("companies").update(update).eq("id", companyId);
}
