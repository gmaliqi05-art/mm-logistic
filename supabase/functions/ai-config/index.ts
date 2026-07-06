import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

/*
  Super-admin AI configuration endpoint.

  GET  -> { configured, model, enabled } (never returns the key itself).
  POST -> { api_key?, model?, enabled? } upserts the singleton ai_config row
          (only provided fields; an empty/absent api_key leaves the stored key
          untouched) and returns the same status.

  Only super_admin may call this. The api key is write-only: it is stored
  (service role, RLS-shielded from browsers) and never read back to the client.
*/

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, apikey",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function requireSuperAdmin(req: Request): Promise<{ ok: true; admin: SupabaseClient; userId: string } | { ok: false; res: Response }> {
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return { ok: false, res: json(500, { error: "Server misconfigured" }) };

  const auth = req.headers.get("Authorization") || req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return { ok: false, res: json(401, { error: "Missing bearer token" }) };

  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: u, error: uErr } = await userClient.auth.getUser();
  if (uErr || !u?.user) return { ok: false, res: json(401, { error: "Invalid session" }) };

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data: profile } = await admin.from("profiles").select("role, is_active").eq("id", u.user.id).maybeSingle();
  if (!profile || profile.is_active !== true) return { ok: false, res: json(403, { error: "Account disabled" }) };
  if (profile.role !== "super_admin") return { ok: false, res: json(403, { error: "Super admin only" }) };

  return { ok: true, admin, userId: u.user.id };
}

async function readStatus(admin: SupabaseClient) {
  const { data } = await admin.from("ai_config").select("anthropic_api_key, model, enabled, elevenlabs_api_key, elevenlabs_voice_id").eq("id", true).maybeSingle();
  return {
    configured: !!(data?.anthropic_api_key && data.anthropic_api_key.length > 0),
    model: data?.model ?? "claude-haiku-4-5-20251001",
    enabled: data?.enabled ?? true,
    voice_configured: !!(data?.elevenlabs_api_key && data.elevenlabs_api_key.length > 0),
    voice_id: data?.elevenlabs_voice_id ?? "JBFqnCBsd6RMkjVDRZzb",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const gate = await requireSuperAdmin(req);
  if (!gate.ok) return gate.res;
  const { admin, userId } = gate;

  if (req.method === "GET") {
    return json(200, await readStatus(admin));
  }

  if (req.method === "POST") {
    // deno-lint-ignore no-explicit-any
    let body: any;
    try { body = await req.json(); } catch { return json(400, { error: "Invalid JSON" }); }

    const update: Record<string, unknown> = { id: true, updated_at: new Date().toISOString(), updated_by: userId };
    if (typeof body?.api_key === "string" && body.api_key.trim().length > 0) update.anthropic_api_key = body.api_key.trim();
    if (typeof body?.model === "string" && body.model.trim().length > 0) update.model = body.model.trim();
    if (typeof body?.enabled === "boolean") update.enabled = body.enabled;
    if (typeof body?.elevenlabs_api_key === "string" && body.elevenlabs_api_key.trim().length > 0) update.elevenlabs_api_key = body.elevenlabs_api_key.trim();
    if (typeof body?.elevenlabs_voice_id === "string" && body.elevenlabs_voice_id.trim().length > 0) update.elevenlabs_voice_id = body.elevenlabs_voice_id.trim();

    const { error } = await admin.from("ai_config").upsert(update, { onConflict: "id" });
    if (error) return json(500, { error: "Failed to save config" });
    return json(200, await readStatus(admin));
  }

  return json(405, { error: "Method not allowed" });
});
