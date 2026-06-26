import { createClient } from "npm:@supabase/supabase-js@2";
import { requireEnv } from "../_shared/env.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req, {
    methods: "GET, POST, PUT, DELETE, OPTIONS",
  });
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const supabaseAnonKey = requireEnv("SUPABASE_ANON_KEY");
    const supabaseServiceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Mungon autorizimi" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Token i pavlefshem" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: profile } = await adminClient
      .from("profiles")
      .select("role, company_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile) {
      return new Response(
        JSON.stringify({ error: "Profili nuk u gjet" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (profile.role === "company_admin" && profile.company_id) {
      await adminClient
        .from("companies")
        .update({
          deletion_requested_at: null,
          deletion_scheduled_for: null,
          deletion_reason: null,
        })
        .eq("id", profile.company_id);

      await adminClient
        .from("profiles")
        .update({
          deletion_requested_at: null,
          deletion_scheduled_for: null,
        })
        .eq("company_id", profile.company_id);
    } else {
      await adminClient
        .from("profiles")
        .update({
          deletion_requested_at: null,
          deletion_scheduled_for: null,
        })
        .eq("id", user.id);
    }

    await adminClient.from("audit_logs").insert({
      company_id: profile.company_id,
      user_id: user.id,
      action: "account_deletion_cancelled",
      entity_type: profile.role === "company_admin" ? "company" : "profile",
      entity_id: profile.role === "company_admin" ? profile.company_id : user.id,
      details: { role: profile.role },
    });

    return new Response(
      JSON.stringify({ success: true, message: "Fshirja e llogarise u anullua me sukses." }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
