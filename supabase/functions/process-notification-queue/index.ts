import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { requireEnv } from "../_shared/env.ts";
import { isServiceRoleCall, forbidden } from "../_shared/requireCaller.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

let _url: string, _key: string;
function getEnv() {
  if (!_url) { _url = requireEnv("SUPABASE_URL"); _key = requireEnv("SUPABASE_SERVICE_ROLE_KEY"); }
  return { url: _url, key: _key };
}

function restHeaders() {
  const { key } = getEnv();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

async function claimItems(limit: number): Promise<Array<{ id: string }>> {
  const { url } = getEnv();
  const res = await fetch(`${url}/rest/v1/rpc/claim_notifications`, {
    method: "POST",
    headers: restHeaders(),
    body: JSON.stringify({ p_limit: limit }),
  });
  if (!res.ok) throw new Error(`claim_notifications failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as Array<{ id: string }>;
}

async function markFailed(id: string, error: string, transient: boolean): Promise<void> {
  const { url } = getEnv();
  await fetch(`${url}/rest/v1/rpc/mark_notification_failed`, {
    method: "POST",
    headers: restHeaders(),
    body: JSON.stringify({ p_id: id, p_error: error.slice(0, 1000), p_transient: transient }),
  }).catch((e) => console.error("mark_notification_failed call failed", id, e));
}

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
    // Atomic claim — FOR UPDATE SKIP LOCKED on the DB side so two
    // cron ticks never pick up the same row. The RPC also reclaims
    // rows stuck in "processing" longer than 10 minutes.
    const items = await claimItems(25);

    const results: Array<{ id: string; ok: boolean }> = [];

    for (const item of items) {
      try {
        const { url, key } = getEnv();
        const dispatchRes = await fetch(`${url}/functions/v1/dispatch-notification`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ queueId: item.id }),
        });
        if (dispatchRes.ok) {
          results.push({ id: item.id, ok: true });
        } else {
          // 5xx / network / rate-limit / timeout = transient, retry with backoff.
          // Other 4xx (e.g. malformed payload) = permanent, go to DLQ.
          // 408 Request Timeout, 425 Too Early, 429 Too Many Requests
          // are all temporary even though they're 4xx.
          const transient = dispatchRes.status >= 500
            || dispatchRes.status === 408
            || dispatchRes.status === 425
            || dispatchRes.status === 429;
          const errBody = await dispatchRes.text().catch(() => `HTTP ${dispatchRes.status}`);
          await markFailed(item.id, errBody, transient);
          results.push({ id: item.id, ok: false });
        }
      } catch (err) {
        // Network / DNS / connection-refused — definitively transient.
        const msg = err instanceof Error ? err.message : String(err);
        console.error("Queue dispatch failed", item.id, msg);
        await markFailed(item.id, msg, true);
        results.push({ id: item.id, ok: false });
      }
    }

    return jsonRes({ success: true, processed: results.length, results });
  } catch (error) {
    console.error("process-notification-queue error", error);
    return jsonRes({ error: "Internal error" }, 500);
  }
});
