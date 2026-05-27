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
}

async function getAccessToken(serviceAccount: {
  client_email: string;
  private_key: string;
  token_uri: string;
}): Promise<string> {
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: serviceAccount.token_uri,
    exp: now + 3600,
    iat: now,
  };

  const enc = new TextEncoder();
  const b64 = (s: string) =>
    btoa(s).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

  const unsigned = `${b64(JSON.stringify(header))}.${b64(JSON.stringify(claim))}`;

  const keyPem = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");

  const keyBuf = Uint8Array.from(atob(keyPem), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyBuf,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    enc.encode(unsigned),
  );
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const jwt = `${unsigned}.${sigB64}`;

  const res = await fetch(serviceAccount.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!res.ok) {
    throw new Error(`FCM token fetch failed: ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
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
    const svcJson = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON");
    if (!svcJson) {
      return jsonRes({ error: "FCM not configured" }, 503);
    }

    const serviceAccount = JSON.parse(svcJson) as {
      client_email: string;
      private_key: string;
      token_uri: string;
      project_id: string;
    };

    const { recipientIds, title, body, data } = (await req.json()) as Partial<Payload>;

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
      `${supabaseUrl}/rest/v1/device_tokens?user_id=in.(${idsCsv})&platform=eq.android&is_active=eq.true&select=id,token`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
    );

    if (!tokenRes.ok) throw new Error(`Token fetch failed: ${await tokenRes.text()}`);
    const tokens = (await tokenRes.json()) as Array<{ id: string; token: string }>;

    if (tokens.length === 0) {
      return jsonRes({ success: true, sent: 0, failed: 0, message: "No active tokens" });
    }

    const accessToken = await getAccessToken(serviceAccount);
    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`;

    const failedIds: string[] = [];
    let sent = 0;

    await Promise.all(
      tokens.map(async (t) => {
        try {
          const res = await fetch(fcmUrl, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              message: {
                token: t.token,
                notification: { title: title.slice(0, 200), body: body.slice(0, 1000) },
                data: data ?? {},
                android: { priority: "HIGH" },
              },
            }),
          });
          if (res.ok) {
            sent += 1;
          } else {
            const txt = await res.text();
            if (res.status === 404 || res.status === 400 || txt.includes("UNREGISTERED")) {
              failedIds.push(t.id);
            }
            console.error("FCM send failed", res.status, txt);
          }
        } catch (err) {
          console.error("FCM error", err);
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
    console.error("send-fcm-notification error", error);
    return jsonRes({ error: error instanceof Error ? error.message : "Internal error" }, 500);
  }
});
