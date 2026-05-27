import { createClient } from "npm:@supabase/supabase-js@2";
import { isServiceRoleCall, forbidden } from "../_shared/requireCaller.ts";
import { requireEnv } from "../_shared/env.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  // Cron + pg-trigger only (service-role bearer).
  if (!isServiceRoleCall(req)) return forbidden(corsHeaders, "Service-role required");

  try {
    const admin = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    );

    const { data: events } = await admin
      .from("webhook_events")
      .select("id, company_id, event, payload, attempts")
      .eq("status", "pending")
      .lt("attempts", 5)
      .order("created_at")
      .limit(50);

    const results: Array<{ event_id: string; delivered: number; failed: number }> = [];

    for (const ev of events ?? []) {
      const { data: hooks } = await admin
        .from("webhooks")
        .select("id, url, secret, events, is_active, failure_count")
        .eq("company_id", ev.company_id)
        .eq("is_active", true);

      let delivered = 0;
      let failed = 0;

      for (const h of hooks ?? []) {
        if (!h.events.includes(ev.event) && !h.events.includes("*")) continue;

        const body = JSON.stringify({ event: ev.event, data: ev.payload, timestamp: new Date().toISOString() });
        const signature = await hmacSha256Hex(h.secret, body);

        try {
          const res = await fetch(h.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Webhook-Signature": `sha256=${signature}`,
              "X-Webhook-Event": ev.event,
            },
            body,
          });
          const ok = res.status >= 200 && res.status < 300;
          const respText = (await res.text()).slice(0, 2000);

          await admin.from("webhook_deliveries").insert({
            webhook_id: h.id,
            event_id: ev.id,
            event: ev.event,
            status_code: res.status,
            response_body: respText,
            succeeded: ok,
          });

          await admin
            .from("webhooks")
            .update({
              last_delivery_at: new Date().toISOString(),
              failure_count: ok ? 0 : (h.failure_count ?? 0) + 1,
            })
            .eq("id", h.id);

          if (ok) delivered++; else failed++;
        } catch (err) {
          await admin.from("webhook_deliveries").insert({
            webhook_id: h.id,
            event_id: ev.id,
            event: ev.event,
            status_code: 0,
            response_body: err instanceof Error ? err.message : "network error",
            succeeded: false,
          });
          failed++;
        }
      }

      const newAttempts = (ev.attempts ?? 0) + 1;
      const finalStatus = failed === 0 ? "delivered" : (newAttempts >= 5 ? "failed" : "pending");
      await admin
        .from("webhook_events")
        .update({
          attempts: newAttempts,
          status: finalStatus,
          processed_at: finalStatus !== "pending" ? new Date().toISOString() : null,
        })
        .eq("id", ev.id);

      results.push({ event_id: ev.id, delivered, failed });
    }

    return new Response(
      JSON.stringify({ success: true, processed: results.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
