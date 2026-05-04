import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
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
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const keyHash = await sha256Hex(token);
    const { data: apiKey } = await admin
      .from("company_api_keys")
      .select("id, company_id, scopes, revoked_at")
      .eq("key_hash", keyHash)
      .maybeSingle();

    if (!apiKey || apiKey.revoked_at) return json({ error: "Invalid or revoked API key" }, 401);
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
        if (error) return json({ error: error.message }, 500);
        return json({ data });
      }
      case "delivery-notes": {
        const { data, error } = await admin
          .from("delivery_notes")
          .select("id, reference_number, status, delivery_date, created_at")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .limit(limit);
        if (error) return json({ error: error.message }, 500);
        return json({ data });
      }
      case "stock": {
        const { data, error } = await admin
          .from("stock")
          .select("id, product_id, category_product_id, condition, quantity")
          .eq("company_id", companyId)
          .limit(limit);
        if (error) return json({ error: error.message }, 500);
        return json({ data });
      }
      case "partners": {
        const { data, error } = await admin
          .from("acc_contacts")
          .select("id, name, contact_type, email, phone, country, vat_number")
          .eq("company_id", companyId)
          .order("name")
          .limit(limit);
        if (error) return json({ error: error.message }, 500);
        return json({ data });
      }
      case "transactions": {
        const { data, error } = await admin
          .from("acc_transactions")
          .select("id, transaction_date, transaction_type, amount, currency, description, reference_number")
          .eq("company_id", companyId)
          .order("transaction_date", { ascending: false })
          .limit(limit);
        if (error) return json({ error: error.message }, 500);
        return json({ data });
      }
      default:
        return json({ error: "Unknown endpoint", available: ["/invoices", "/delivery-notes", "/stock", "/partners", "/transactions", "/openapi.json"] }, 404);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ error: message }, 500);
  }
});
