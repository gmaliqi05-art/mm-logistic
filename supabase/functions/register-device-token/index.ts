import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface RegisterInput {
  platform: "ios" | "android";
  token: string;
  app_version?: string;
  device_model?: string;
  locale?: string;
}

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
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) return jsonRes({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (req.method === "DELETE") {
      const { token } = (await req.json()) as { token?: string };
      if (!token) return jsonRes({ error: "Token required" }, 400);
      await serviceClient
        .from("device_tokens")
        .update({ is_active: false })
        .eq("user_id", userId)
        .eq("token", token);
      return jsonRes({ success: true });
    }

    const input = (await req.json()) as Partial<RegisterInput>;
    if (!input.platform || !["ios", "android"].includes(input.platform)) {
      return jsonRes({ error: "Invalid platform" }, 400);
    }
    if (!input.token || typeof input.token !== "string" || input.token.length > 500) {
      return jsonRes({ error: "Invalid token" }, 400);
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
    return jsonRes({ error: error instanceof Error ? error.message : "Internal error" }, 500);
  }
});
