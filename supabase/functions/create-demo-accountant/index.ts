// Bootstrap demo accountant. Disabled unless SETUP_TOKEN is configured
// and presented in X-Setup-Token. Same rationale as seed-demo-users:
// this creates a known-password account, which must never be
// world-reachable in production.
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { requireSetupToken } from "../_shared/requireCaller.ts";
import { requireEnv } from "../_shared/env.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey, X-Setup-Token",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const tokenError = await requireSetupToken(req, corsHeaders);
  if (tokenError) return tokenError;

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const supabaseServiceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: existingProfiles } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", "accountant@demo.com");

    if (existingProfiles && existingProfiles.length > 0) {
      return new Response(
        JSON.stringify({ message: "Demo accountant already exists", id: existingProfiles[0].id }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: companies } = await supabaseAdmin
      .from("companies")
      .select("id")
      .limit(1);

    if (!companies || companies.length === 0) {
      return new Response(
        JSON.stringify({ error: "No companies found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const companyId = companies[0].id;

    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: "accountant@demo.com",
      password: "demo123456",
      email_confirm: true,
      user_metadata: { full_name: "Demo Kontabilist" },
    });

    if (createError) {
      return new Response(
        JSON.stringify({ error: createError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { error: profileError } = await supabaseAdmin.from("profiles").insert({
      id: newUser.user.id,
      email: "accountant@demo.com",
      full_name: "Demo Kontabilist",
      role: "accountant",
      company_id: companyId,
      phone: "+49 170 1234567",
      is_active: true,
    });

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
      return new Response(
        JSON.stringify({ error: profileError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, userId: newUser.user.id, companyId }),
      { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("create-demo-accountant error:", err instanceof Error ? err.message : err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
