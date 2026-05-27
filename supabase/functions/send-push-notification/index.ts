import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import webpush from "npm:web-push@3.6.7";
import { requireCaller, isServiceRoleCall } from "../_shared/requireCaller.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY");
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:info@mm-logistic.eu";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_TYPES = new Set(["chat", "document", "delivery", "system"]);

interface PushPayload {
  recipientIds: string[];
  title: string;
  body: string;
  type: "chat" | "document" | "delivery" | "system";
  url?: string;
  icon?: string;
  tag?: string;
}

Deno.serve(async (req: Request) => {
  const jsonResponse = (payload: unknown, status = 200): Response =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // Internal callers (pg trigger via http_post, other edge functions)
  // carry the service-role bearer. Frontend chat / driver UIs carry a
  // user session bearer. Reject anonymous calls so the function can't
  // be used to spam push notifications to any device.
  let callerCompanyId: string | null = null;
  if (!isServiceRoleCall(req)) {
    const caller = await requireCaller(req, { corsHeaders, roles: ["super_admin", "company_admin", "logistics_admin"] });
    if (!caller.ok) return caller.response;
    callerCompanyId = caller.profile?.company_id ?? null;
  }

  try {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return jsonResponse({ error: "Push notifications are not configured" }, 503);
    }

    const payload = (await req.json()) as Partial<PushPayload>;
    const { recipientIds, title, body, type, url, icon, tag } = payload;

    if (!Array.isArray(recipientIds) || recipientIds.length === 0) {
      return jsonResponse({ error: "No recipients specified" }, 400);
    }

    const safeIds = recipientIds.filter((id): id is string => typeof id === "string" && UUID_RE.test(id));
    if (safeIds.length === 0) {
      return jsonResponse({ error: "Invalid recipient ids" }, 400);
    }

    if (typeof title !== "string" || typeof body !== "string" || !title.trim() || !body.trim()) {
      return jsonResponse({ error: "Title and body are required" }, 400);
    }
    if (typeof type !== "string" || !ALLOWED_TYPES.has(type)) {
      return jsonResponse({ error: "Invalid notification type" }, 400);
    }
    const cleanTitle = title.slice(0, 200);
    const cleanBody = body.slice(0, 1000);
    const cleanUrl = typeof url === "string" ? url.slice(0, 500) : undefined;
    const cleanIcon = typeof icon === "string" ? icon.slice(0, 500) : undefined;
    const cleanTag = typeof tag === "string" ? tag.slice(0, 200) : undefined;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const idsCsv = safeIds.map((id) => `"${id}"`).join(",");
    const subsRes = await fetch(
      `${supabaseUrl}/rest/v1/push_subscriptions?user_id=in.(${idsCsv})&is_active=eq.true&select=id,endpoint,p256dh_key,auth_key`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
    );

    if (!subsRes.ok) {
      const txt = await subsRes.text();
      throw new Error(`Failed to fetch subscriptions: ${txt}`);
    }

    const subscriptions = (await subsRes.json()) as Array<{
      id: string;
      endpoint: string;
      p256dh_key: string;
      auth_key: string;
    }>;

    if (subscriptions.length === 0) {
      return jsonResponse({ success: true, sent: 0, failed: 0, message: "No active subscriptions" });
    }

    const notificationPayload = JSON.stringify({
      title: cleanTitle,
      body: cleanBody,
      icon: cleanIcon || "/pwa-icon.svg",
      badge: "/pwa-icon.svg",
      tag: cleanTag || `${type}-${Date.now()}`,
      type,
      data: { url: cleanUrl || "/" },
    });

    const failedIds: string[] = [];
    let sent = 0;

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh_key, auth: sub.auth_key },
            },
            notificationPayload,
            { TTL: 86400 },
          );
          sent += 1;
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number })?.statusCode;
          if (statusCode === 404 || statusCode === 410) {
            failedIds.push(sub.id);
          }
          console.error("push send failed", sub.endpoint, statusCode, err);
        }
      }),
    );

    if (failedIds.length > 0) {
      const idsParam = failedIds.map((id) => `"${id}"`).join(",");
      await fetch(
        `${supabaseUrl}/rest/v1/push_subscriptions?id=in.(${idsParam})`,
        {
          method: "PATCH",
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ is_active: false }),
        },
      );
    }

    return jsonResponse({ success: true, sent, failed: failedIds.length, total: subscriptions.length });
  } catch (error) {
    console.error("Error in send-push-notification:", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Internal server error" },
      500,
    );
  }
});
