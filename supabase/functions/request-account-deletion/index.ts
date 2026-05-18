import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

    const body = await req.json();
    const { password, reason } = body;

    if (!password || typeof password !== "string") {
      return new Response(
        JSON.stringify({ error: "Fjalekalimi eshte i detyrueshem" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { error: signInError } = await createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
    }).auth.signInWithPassword({
      email: user.email!,
      password,
    });

    if (signInError) {
      return new Response(
        JSON.stringify({ error: "Fjalekalimi i gabuar. Ju lutem provoni perseri." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: profile } = await adminClient
      .from("profiles")
      .select("role, company_id, full_name")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile) {
      return new Response(
        JSON.stringify({ error: "Profili nuk u gjet" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const now = new Date();
    const scheduledFor = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    if (profile.role === "company_admin" && profile.company_id) {
      const { error: companyErr } = await adminClient
        .from("companies")
        .update({
          deletion_requested_at: now.toISOString(),
          deletion_scheduled_for: scheduledFor.toISOString(),
          deletion_reason: reason || null,
        })
        .eq("id", profile.company_id);

      if (companyErr) {
        return new Response(
          JSON.stringify({ error: companyErr.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await adminClient
        .from("profiles")
        .update({
          deletion_requested_at: now.toISOString(),
          deletion_scheduled_for: scheduledFor.toISOString(),
        })
        .eq("company_id", profile.company_id);

    } else {
      await adminClient
        .from("profiles")
        .update({
          deletion_requested_at: now.toISOString(),
          deletion_scheduled_for: scheduledFor.toISOString(),
        })
        .eq("id", user.id);
    }

    await adminClient.from("audit_logs").insert({
      company_id: profile.company_id,
      user_id: user.id,
      action: "account_deletion_requested",
      entity_type: profile.role === "company_admin" ? "company" : "profile",
      entity_id: profile.role === "company_admin" ? profile.company_id : user.id,
      details: {
        role: profile.role,
        scheduled_for: scheduledFor.toISOString(),
        reason: reason || null,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        scheduled_for: scheduledFor.toISOString(),
        message: profile.role === "company_admin"
          ? "Llogaria e kompanise dhe te gjitha llogarite e lidhura do te fshihen me " + scheduledFor.toLocaleDateString("de-DE")
          : "Llogaria juaj do te fshihet me " + scheduledFor.toLocaleDateString("de-DE"),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
