import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { requireCaller } from "../_shared/requireCaller.ts";
import { parseJson, z } from "../_shared/schemas.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";

const CreateApiKeyBody = z.object({
  name: z.string().trim().min(1, "Emri mungon").max(100, "Emri shume i gjate"),
  scopes: z
    .array(z.enum(["read", "write", "admin"]))
    .nonempty("Te pakten nje scope kerkohet")
    .max(3, "Shume scope")
    .default(["read"]),
});

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req, { methods: "POST, OPTIONS" });
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  // Use the shared helper so role enforcement is consistent across
  // the codebase rather than rolled-by-hand. Restricts to
  // company_admin + super_admin; everything else gets 403.
  const caller = await requireCaller(req, { roles: ["company_admin", "super_admin"], corsHeaders });
  if (!caller.ok) return caller.response;

  try {
    if (!caller.profile.company_id) {
      return new Response(
        JSON.stringify({ success: false, error: "No company" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const parsed = await parseJson(req, CreateApiKeyBody, corsHeaders);
    if (!parsed.ok) return parsed.response;
    const { name, scopes } = parsed.data;

    const token = "sk_live_" + randomToken(24);
    const key_hash = await sha256Hex(token);
    const key_prefix = token.slice(0, 16);

    const { data: inserted, error } = await caller.admin
      .from("company_api_keys")
      .insert({
        company_id: caller.profile.company_id,
        name,
        scopes,
        key_hash,
        key_prefix,
        created_by: caller.profile.id,
      })
      .select("id")
      .single();

    if (error) {
      console.error("create-api-key insert failed", error);
      return new Response(
        JSON.stringify({ success: false, error: "Internal error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, id: inserted.id, api_key: token, prefix: key_prefix }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("create-api-key error", err);
    return new Response(
      JSON.stringify({ success: false, error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
