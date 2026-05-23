import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { requireCaller, isServiceRoleCall } from "../_shared/requireCaller.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface DispatchInput {
  queueId?: string;
  channelCode?: string;
  title?: string;
  body?: string;
  data?: Record<string, string>;
  recipientIds?: string[];
  recipientRoles?: string[];
  recipientCompanyIds?: string[];
  targetPlatforms?: Array<"web" | "android" | "ios">;
  url?: string;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function pg<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`Supabase REST error ${res.status}: ${await res.text()}`);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function resolveRecipients(
  userIds: string[],
  roles: string[],
  companyIds: string[],
  channelCode: string,
): Promise<string[]> {
  const result = new Set<string>();

  for (const id of userIds) if (UUID_RE.test(id)) result.add(id);

  if (roles.length > 0 || companyIds.length > 0) {
    const filters: string[] = [];
    if (roles.length > 0) {
      const rolesCsv = roles.map((r) => `"${r.replace(/"/g, "")}"`).join(",");
      filters.push(`role=in.(${rolesCsv})`);
    }
    if (companyIds.length > 0) {
      const idsCsv = companyIds.filter((i) => UUID_RE.test(i)).map((i) => `"${i}"`).join(",");
      if (idsCsv) filters.push(`company_id=in.(${idsCsv})`);
    }
    const q = filters.join("&");
    const profiles = await pg<Array<{ id: string }>>(`profiles?${q}&select=id`);
    for (const p of profiles) result.add(p.id);
  }

  if (result.size === 0) return [];

  // Filter by notification_preferences (only recipients who haven't disabled this channel)
  const idsCsv = Array.from(result).map((i) => `"${i}"`).join(",");
  const prefs = await pg<Array<{ user_id: string; enabled: boolean }>>(
    `notification_preferences?user_id=in.(${idsCsv})&channel_code=eq.${channelCode}&select=user_id,enabled`,
  );
  const disabled = new Set(prefs.filter((p) => p.enabled === false).map((p) => p.user_id));
  return Array.from(result).filter((id) => !disabled.has(id));
}

async function invokeFunction(slug: string, body: unknown): Promise<{ sent: number; failed: number }> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${slug}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { sent?: number; failed?: number };
    return { sent: json.sent ?? 0, failed: json.failed ?? 0 };
  } catch (err) {
    console.error(`Invoke ${slug} failed`, err);
    return { sent: 0, failed: 0 };
  }
}

async function logDelivery(
  queueId: string | null,
  userId: string,
  channelCode: string,
  platform: string,
  status: string,
  errorMessage?: string,
): Promise<void> {
  await pg("notification_deliveries", {
    method: "POST",
    body: JSON.stringify({
      queue_id: queueId,
      user_id: userId,
      channel_code: channelCode,
      platform,
      status,
      error_message: errorMessage ?? null,
      delivered_at: status === "sent" || status === "delivered" ? new Date().toISOString() : null,
    }),
  }).catch((e) => console.error("Delivery log failed", e));
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

  // Internal callers (process-notification-queue, check-route-traffic,
  // pg_cron) use the service-role bearer. The super-admin manual
  // dispatch UI uses a session bearer. Anything else is rejected.
  if (!isServiceRoleCall(req)) {
    const caller = await requireCaller(req, { roles: ["super_admin"], corsHeaders });
    if (!caller.ok) return caller.response;
  }

  try {
    const input = (await req.json()) as DispatchInput;

    let queueId = input.queueId ?? null;
    let channelCode = input.channelCode ?? "system.broadcast";
    let title = input.title ?? "";
    let body = input.body ?? "";
    let data = input.data ?? {};
    let userIds = input.recipientIds ?? [];
    let roles = input.recipientRoles ?? [];
    let companyIds = input.recipientCompanyIds ?? [];
    let targetPlatforms = input.targetPlatforms ?? ["web", "android", "ios"];
    const url = input.url ?? "/";

    // If queueId provided, load queue row
    if (queueId && UUID_RE.test(queueId)) {
      const rows = await pg<Array<{
        channel_code: string;
        title: string;
        body: string;
        data: Record<string, string>;
        recipient_user_ids: string[];
        recipient_roles: string[];
        recipient_company_ids: string[];
        target_platforms: string[];
      }>>(`notification_queue?id=eq.${queueId}&select=*`);
      if (rows.length === 0) return jsonRes({ error: "Queue row not found" }, 404);
      const q = rows[0];
      channelCode = q.channel_code;
      title = q.title;
      body = q.body;
      data = q.data ?? {};
      userIds = q.recipient_user_ids ?? [];
      roles = q.recipient_roles ?? [];
      companyIds = q.recipient_company_ids ?? [];
      targetPlatforms = (q.target_platforms ?? ["web", "android", "ios"]) as typeof targetPlatforms;
      await pg(`notification_queue?id=eq.${queueId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "processing" }),
      });
    }

    if (!title || !body) return jsonRes({ error: "Title and body required" }, 400);

    const recipients = await resolveRecipients(userIds, roles, companyIds, channelCode);
    if (recipients.length === 0) {
      if (queueId) {
        await pg(`notification_queue?id=eq.${queueId}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "sent", sent_at: new Date().toISOString(), total_recipients: 0 }),
        });
      }
      return jsonRes({ success: true, total: 0, sent: 0, failed: 0, message: "No eligible recipients" });
    }

    // Create in-app notifications
    const inAppRows = recipients.map((userId) => ({
      user_id: userId,
      title: title.slice(0, 200),
      message: body.slice(0, 1000),
      type: channelCode.split(".")[0] === "chat" ? "chat"
        : channelCode.split(".")[0] === "delivery" ? "delivery"
        : channelCode.split(".")[0] === "document" ? "document"
        : "system",
      data: { ...data, channel_code: channelCode, url },
      push_sent: false,
    }));
    await pg("notifications", { method: "POST", body: JSON.stringify(inAppRows) });

    const results = { web: { sent: 0, failed: 0 }, android: { sent: 0, failed: 0 }, ios: { sent: 0, failed: 0 } };

    const pushTasks: Promise<void>[] = [];

    if (targetPlatforms.includes("web")) {
      pushTasks.push(
        invokeFunction("send-push-notification", {
          recipientIds: recipients,
          title,
          body,
          type: inAppRows[0].type,
          url,
        }).then((r) => { results.web = r; }),
      );
    }
    if (targetPlatforms.includes("android")) {
      pushTasks.push(
        invokeFunction("send-fcm-notification", {
          recipientIds: recipients,
          title,
          body,
          data: { ...data, url, channel_code: channelCode },
        }).then((r) => { results.android = r; }),
      );
    }
    if (targetPlatforms.includes("ios")) {
      pushTasks.push(
        invokeFunction("send-apns-notification", {
          recipientIds: recipients,
          title,
          body,
          data: { ...data, url, channel_code: channelCode },
        }).then((r) => { results.ios = r; }),
      );
    }

    await Promise.all(pushTasks);

    const totalSent = results.web.sent + results.android.sent + results.ios.sent;
    const totalFailed = results.web.failed + results.android.failed + results.ios.failed;

    for (const r of recipients) {
      await logDelivery(queueId, r, channelCode, "inapp", "sent");
    }

    if (queueId) {
      await pg(`notification_queue?id=eq.${queueId}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "sent",
          sent_at: new Date().toISOString(),
          total_recipients: recipients.length,
          sent_count: totalSent,
          failed_count: totalFailed,
        }),
      });
    }

    return jsonRes({
      success: true,
      total_recipients: recipients.length,
      platforms: results,
      sent: totalSent,
      failed: totalFailed,
    });
  } catch (error) {
    console.error("dispatch-notification error", error);
    return jsonRes({ error: error instanceof Error ? error.message : "Internal error" }, 500);
  }
});
