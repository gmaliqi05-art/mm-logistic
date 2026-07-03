import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { requireEnv } from "../_shared/env.ts";
import { parseJson, z } from "../_shared/schemas.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Per-platform token shape: iOS APNs tokens are 32-200 hex chars; FCM
// Android tokens are base64url-ish. Validating up-front blocks
// log-injection and clearly-malformed strings from being persisted.
const RegisterBody = z.discriminatedUnion("platform", [
  z.object({
    platform: z.literal("ios"),
    token: z.string().regex(/^[A-Fa-f0-9]{32,200}$/, "Invalid APNs token format"),
    app_version: z.string().max(64).optional(),
    device_model: z.string().max(128).optional(),
    locale: z.string().max(8).optional(),
  }),
  z.object({
    platform: z.literal("android"),
    token: z.string().regex(/^[A-Za-z0-9_\-:.]{20,500}$/, "Invalid FCM token format"),
    app_version: z.string().max(64).optional(),
    device_model: z.string().max(128).optional(),
    locale: z.string().max(8).optional(),
  }),
]);

const DeleteBody = z.object({
  token: z.string().min(1, "Token required").max(500),
});

Deno.serve(async (req: Request) => {
  const jsonRes = (p: unknown, status = 200) =>
    new Response(JSON.stringify(p), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_ANON_KEY"),
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) return jsonRes({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const serviceClient = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    );

    if (req.method === "DELETE") {
      const parsed = await parseJson(req, DeleteBody, corsHeaders);
      if (!parsed.ok) return parsed.response;
      await serviceClient
        .from("device_tokens")
        .update({ is_active: false })
        .eq("user_id", userId)
        .eq("token", parsed.data.token);
      return jsonRes({ success: true });
    }

    const parsed = await parseJson(req, RegisterBody, corsHeaders);
    if (!parsed.ok) return parsed.response;
    const input = parsed.data;

    // Token-takeover guard: device_tokens has UNIQUE(token), so an upsert
    // with onConflict: "token" would silently rewrite an existing row's
    // user_id if someone obtained another user's APNs/FCM token (debug
    // log leak, MITM, etc.) and registered it under their own account.
    // That would hijack push delivery for the original device. If the
    // token is already bound to a different user, reject with 409.
    const { data: existing } = await serviceClient
      .from("device_tokens")
      .select("user_id")
      .eq("token", input.token)
      .maybeSingle();
    if (existing && existing.user_id !== userId) {
      return jsonRes({ error: "Token already registered to another account" }, 409);
    }

    const { data, error } = await serviceClient
      .from("device_tokens")
      .upsert(
        {
          user_id: userId,
          platform: input.platform,
          token: input.token,
          app_version: input.app_version ?? "",
          device_model: input.device_model ?? "",
          locale: input.locale ?? "en",
          is_active: true,
          last_active_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "token" },
      )
      .select()
      .maybeSingle();

    if (error) throw error;
    return jsonRes({ success: true, id: data?.id });
  } catch (error) {
    console.error("register-device-token error", error);
    return jsonRes({ error: "Internal error" }, 500);
  }
});
