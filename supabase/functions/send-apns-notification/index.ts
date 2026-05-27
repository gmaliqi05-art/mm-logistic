import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { requireEnv } from "../_shared/env.ts";
import { isServiceRoleCall, forbidden } from "../_shared/requireCaller.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Payload {
  recipientIds: string[];
  title: string;
  body: string;
  data?: Record<string, string>;
  sandbox?: boolean;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getApnsProviderToken(
  keyP8: string,
  keyId: string,
  teamId: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt > now + 60) return cachedToken.token;

  const header = { alg: "ES256", kid: keyId, typ: "JWT" };
  const claim = { iss: teamId, iat: now };

  const b64url = (s: string) =>
    btoa(s).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claim))}`;

  const keyPem = keyP8
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");

  const keyBuf = Uint8Array.from(atob(keyPem), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyBuf,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    new TextEncoder().encode(unsigned),
  );
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const jwt = `${unsigned}.${sigB64}`;
  cachedToken = { token: jwt, expiresAt: now + 3000 };
  return jwt;
}

Deno.serve(async (req: Request) => {
  const jsonRes = (p: unknown, status = 200) =>
    new Response(JSON.stringify(p), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // Only callable from pg triggers (http_post with service-role bearer).
  if (!isServiceRoleCall(req)) return forbidden(corsHeaders, "Service-role required");

  try {
    const keyP8 = Deno.env.get("APNS_KEY_P8");
    const keyId = Deno.env.get("APNS_KEY_ID");
    const teamId = Deno.env.get("APNS_TEAM_ID");
    const bundleId = Deno.env.get("APNS_BUNDLE_ID");

    if (!keyP8 || !keyId || !teamId || !bundleId) {
      return jsonRes({ error: "APNs not configured" }, 503);
    }

    const { recipientIds, title, body, data, sandbox } = (await req.json()) as Partial<Payload>;

    if (!Array.isArray(recipientIds) || recipientIds.length === 0) {
      return jsonRes({ error: "No recipients" }, 400);
    }
    const safeIds = recipientIds.filter((i): i is string => typeof i === "string" && UUID_RE.test(i));
    if (safeIds.length === 0) return jsonRes({ error: "Invalid recipient ids" }, 400);
    if (!title || !body) return jsonRes({ error: "Title and body required" }, 400);

    const supabaseUrl = requireEnv("SUPABASE_URL");
    const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

    const idsCsv = safeIds.map((i) => `"${i}"`).join(",");
    const tokenRes = await fetch(
      `${supabaseUrl}/rest/v1/device_tokens?user_id=in.(${idsCsv})&platform=eq.ios&is_active=eq.true&select=id,token`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
    );

    if (!tokenRes.ok) throw new Error(`Token fetch failed: ${await tokenRes.text()}`);
    const tokens = (await tokenRes.json()) as Array<{ id: string; token: string }>;

    if (tokens.length === 0) {
      return jsonRes({ success: true, sent: 0, failed: 0, message: "No active tokens" });
    }

    const providerToken = await getApnsProviderToken(keyP8, keyId, teamId);
    const apnsHost = sandbox
      ? "https://api.sandbox.push.apple.com"
      : "https://api.push.apple.com";

    const payload = JSON.stringify({
      aps: {
        alert: { title: title.slice(0, 200), body: body.slice(0, 1000) },
        sound: "default",
        "mutable-content": 1,
      },
      ...(data ?? {}),
    });

    const failedIds: string[] = [];
    let sent = 0;

    await Promise.all(
      tokens.map(async (t) => {
        try {
          const res = await fetch(`${apnsHost}/3/device/${t.token}`, {
            method: "POST",
            headers: {
              Authorization: `bearer ${providerToken}`,
              "apns-topic": bundleId,
              "apns-push-type": "alert",
              "apns-priority": "10",
              "Content-Type": "application/json",
            },
            body: payload,
          });
          if (res.ok) {
            sent += 1;
          } else {
            const reason = await res.text();
            if (res.status === 410 || reason.includes("Unregistered") || reason.includes("BadDeviceToken")) {
              failedIds.push(t.id);
            }
            console.error("APNs send failed", res.status, reason);
          }
        } catch (err) {
          console.error("APNs error", err);
        }
      }),
    );

    if (failedIds.length > 0) {
      const idsParam = failedIds.map((i) => `"${i}"`).join(",");
      await fetch(`${supabaseUrl}/rest/v1/device_tokens?id=in.(${idsParam})`, {
        method: "PATCH",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ is_active: false }),
      });
    }

    return jsonRes({ success: true, sent, failed: failedIds.length, total: tokens.length });
  } catch (error) {
    console.error("send-apns-notification error", error);
    return jsonRes({ error: error instanceof Error ? error.message : "Internal error" }, 500);
  }
});
