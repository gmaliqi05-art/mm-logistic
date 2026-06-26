import { createClient } from "npm:@supabase/supabase-js@2";
import { checkRateLimit, rateLimitResponse } from "../_shared/rateLimit.ts";
import { requireEnv } from "../_shared/env.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req, { methods: "GET, POST, OPTIONS" });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^.*\/api-v1/, "") || "/";

    if (path === "/openapi.json" || path === "/openapi") {
      return json({
        openapi: "3.0.0",
        info: { title: "MM Logistic API v1", version: "1.0.0" },
        servers: [{ url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/api-v1` }],
        paths: {
          "/invoices": { get: { summary: "List invoices" } },
          "/delivery-notes": { get: { summary: "List delivery notes" } },
          "/stock": { get: { summary: "List stock items" } },
          "/partners": { get: { summary: "List partners (contacts)" } },
          "/transactions": { get: { summary: "List transactions" } },
        },
      });
    }

    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Missing Bearer token" }, 401);
    const token = auth.slice(7).trim();

    const admin = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    );

    const keyHash = await sha256Hex(token);
    const { data: apiKey } = await admin
      .from("company_api_keys")
      .select("id, company_id, scopes, revoked_at")
      .eq("key_hash", keyHash)
      .maybeSingle();

    if (!apiKey || apiKey.revoked_at) return json({ error: "Invalid or revoked API key" }, 401);
    // Defensive: if a key row ever sits with company_id NULL the
    // subsequent .eq("company_id", null) becomes "IS NULL" semantics
    // and returns every-tenant rows where the column is null.
    // Reject outright.
    if (!apiKey.company_id) return json({ error: "Invalid API key" }, 401);

    // Enforce scopes (M3-sec). Today all routes are read-only GETs, so we
    // require the "read" scope on every authenticated route. A key with
    // an empty scopes array is treated as having no permissions — the
    // create-api-key flow already mints keys with ["read"] by default.
    const scopes = Array.isArray(apiKey.scopes) ? (apiKey.scopes as string[]) : [];
    if (!scopes.includes("read")) {
      return json({ error: "API key is missing the 'read' scope" }, 403);
    }

    // Gate on the company being active AND having a current paid/trial
    // subscription (M4-sec). A lapsed tenant whose UI is correctly
    // blocked could otherwise keep pulling data via a long-lived API key.
    const { data: company } = await admin
      .from("companies")
      .select("is_active")
      .eq("id", apiKey.company_id)
      .maybeSingle();
    if (!company || company.is_active !== true) {
      return json({ error: "Company is not active" }, 403);
    }
    const { data: liveSubs } = await admin
      .from("company_subscriptions")
      .select("id, status, current_period_end, trial_end")
      .eq("company_id", apiKey.company_id)
      .in("status", ["active", "trial"]);
    const nowMs = Date.now();
    const hasLiveSub = (liveSubs ?? []).some((s) => {
      if (s.status === "active") {
        return !s.current_period_end || new Date(s.current_period_end as string).getTime() > nowMs;
      }
      return !s.trial_end || new Date(s.trial_end as string).getTime() > nowMs;
    });
    if (!hasLiveSub) {
      return json({ error: "Subscription is not active" }, 403);
    }

    const rl = await checkRateLimit(`api-v1:${apiKey.id}`, 60, 60_000);
    if (!rl.allowed) return rateLimitResponse(rl, corsHeaders);

    await admin.from("company_api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", apiKey.id);

    const companyId = apiKey.company_id;
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 200);

    const route = path.replace(/^\/+/, "").split("/")[0];

    switch (route) {
      case "invoices": {
        const { data, error } = await admin
          .from("acc_invoices")
          .select("id, invoice_number, contact_id, total, currency, status, invoice_date, due_date")
          .eq("company_id", companyId)
          .order("invoice_date", { ascending: false })
          .limit(limit);
        if (error) {
          console.error("api-v1 invoices query failed", error);
          return json({ error: "Internal error" }, 500);
        }
        return json({ data });
      }
      case "delivery-notes": {
        const { data, error } = await admin
          .from("delivery_notes")
          .select("id, reference_number, status, delivery_date, created_at")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .limit(limit);
        if (error) {
          console.error("api-v1 delivery-notes query failed", error);
          return json({ error: "Internal error" }, 500);
        }
        return json({ data });
      }
      case "stock": {
        const { data, error } = await admin
          .from("stock")
          .select("id, product_id, category_product_id, condition, quantity")
          .eq("company_id", companyId)
          .limit(limit);
        if (error) {
          console.error("api-v1 stock query failed", error);
          return json({ error: "Internal error" }, 500);
        }
        return json({ data });
      }
      case "partners": {
        const { data, error } = await admin
          .from("acc_contacts")
          .select("id, name, contact_type, email, phone, country, vat_number")
          .eq("company_id", companyId)
          .order("name")
          .limit(limit);
        if (error) {
          console.error("api-v1 partners query failed", error);
          return json({ error: "Internal error" }, 500);
        }
        return json({ data });
      }
      case "transactions": {
        const { data, error } = await admin
          .from("acc_transactions")
          .select("id, transaction_date, transaction_type, amount, currency, description, reference_number")
          .eq("company_id", companyId)
          .order("transaction_date", { ascending: false })
          .limit(limit);
        if (error) {
          console.error("api-v1 transactions query failed", error);
          return json({ error: "Internal error" }, 500);
        }
        return json({ data });
      }
      default:
        return json({ error: "Unknown endpoint", available: ["/invoices", "/delivery-notes", "/stock", "/partners", "/transactions", "/openapi.json"] }, 404);
    }
  } catch (err) {
    // Log full error server-side; never leak Postgres/runtime messages
    // to public API consumers — they can include table names, column
    // names, and constraint internals.
    console.error("api-v1 internal error", err);
    return json({ error: "Internal error" }, 500);
  }
});
