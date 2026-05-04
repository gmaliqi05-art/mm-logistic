import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

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
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) throw new Error("Unauthorized");

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: userData } = await userClient.auth.getUser();
    if (!userData.user) throw new Error("Unauthorized");

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: profile } = await admin
      .from("profiles")
      .select("id, company_id, role")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (!profile?.company_id) throw new Error("No company");
    if (!["company_admin", "super_admin"].includes(profile.role)) {
      throw new Error("Not authorized");
    }

    const body = await req.json();
    const name = String(body.name || "").slice(0, 100);
    const scopes = Array.isArray(body.scopes) ? body.scopes : ["read"];

    const token = "sk_live_" + randomToken(24);
    const key_hash = await sha256Hex(token);
    const key_prefix = token.slice(0, 16);

    const { data: inserted, error } = await admin
      .from("company_api_keys")
      .insert({
        company_id: profile.company_id,
        name,
        scopes,
        key_hash,
        key_prefix,
        created_by: profile.id,
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);

    return new Response(
      JSON.stringify({ success: true, id: inserted.id, api_key: token, prefix: key_prefix }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
