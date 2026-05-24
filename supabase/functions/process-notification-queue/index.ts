import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { isServiceRoleCall, forbidden } from "../_shared/requireCaller.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req: Request) => {
  const jsonRes = (p: unknown, status = 200) =>
    new Response(JSON.stringify(p), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  // Cron-only endpoint. pg_cron calls with service-role bearer.
  if (!isServiceRoleCall(req)) return forbidden(corsHeaders, "Service-role required");

  try {
    const nowIso = new Date().toISOString();
    const queuedRes = await fetch(
      `${SUPABASE_URL}/rest/v1/notification_queue?status=eq.queued&scheduled_at=lte.${nowIso}&select=id&limit=25`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
    );
    if (!queuedRes.ok) throw new Error(await queuedRes.text());
    const items = (await queuedRes.json()) as Array<{ id: string }>;

    const results: Array<{ id: string; ok: boolean }> = [];

    for (const item of items) {
      try {
        const dispatchRes = await fetch(`${SUPABASE_URL}/functions/v1/dispatch-notification`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SERVICE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ queueId: item.id }),
        });
        results.push({ id: item.id, ok: dispatchRes.ok });
        if (!dispatchRes.ok) {
          await fetch(`${SUPABASE_URL}/rest/v1/notification_queue?id=eq.${item.id}`, {
            method: "PATCH",
            headers: {
              apikey: SERVICE_KEY,
              Authorization: `Bearer ${SERVICE_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ status: "failed", error_message: await dispatchRes.text() }),
          });
        }
      } catch (err) {
        console.error("Queue dispatch failed", item.id, err);
        results.push({ id: item.id, ok: false });
      }
    }

    return jsonRes({ success: true, processed: results.length, results });
  } catch (error) {
    console.error("process-notification-queue error", error);
    return jsonRes({ error: error instanceof Error ? error.message : "Internal error" }, 500);
  }
});
