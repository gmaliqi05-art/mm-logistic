// Bootstrap demo data. Disabled unless SETUP_TOKEN is configured AND
// the caller presents it in X-Setup-Token. This endpoint creates
// shared-password demo accounts (super_admin included) and must never
// be world-reachable in production.
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { requireSetupToken } from "../_shared/requireCaller.ts";
import { requireEnv } from "../_shared/env.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey, X-Setup-Token",
};

const DEMO_PASSWORD = "demo123456";

const demoUsers = [
  {
    email: "demo-superadmin@demo.com",
    full_name: "Demo Super Admin",
    role: "super_admin",
    phone: "+49 170 0000000",
    needsCompany: false,
  },
  {
    email: "demo-admin@demo.com",
    full_name: "Demo Admin",
    role: "company_admin",
    phone: "+49 170 0000001",
    needsCompany: true,
  },
  {
    email: "demo-depot@demo.com",
    full_name: "Demo Depo",
    role: "depot_worker",
    phone: "+49 170 0000002",
    needsCompany: true,
  },
  {
    email: "demo-driver@demo.com",
    full_name: "Demo Shofer",
    role: "driver",
    phone: "+49 170 0000003",
    needsCompany: true,
  },
  {
    email: "accountant@demo.com",
    full_name: "Demo Kontabilist",
    role: "accountant",
    phone: "+49 170 0000004",
    needsCompany: true,
  },
];

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

    const { data: companies } = await supabaseAdmin
      .from("companies")
      .select("id")
      .limit(1);

    if (!companies || companies.length === 0) {
      return new Response(
        JSON.stringify({ error: "No companies found. Register a company first." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const companyId = companies[0].id;
    const results: Array<{ email: string; status: string; error?: string }> = [];

    for (const demo of demoUsers) {
      const { data: existing } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("email", demo.email)
        .maybeSingle();

      if (existing) {
        results.push({ email: demo.email, status: "already_exists" });
        continue;
      }

      const { data: newUser, error: createError } =
        await supabaseAdmin.auth.admin.createUser({
          email: demo.email,
          password: DEMO_PASSWORD,
          email_confirm: true,
          user_metadata: { full_name: demo.full_name },
        });

      if (createError) {
        results.push({ email: demo.email, status: "error", error: createError.message });
        continue;
      }

      const profileData: Record<string, unknown> = {
        id: newUser.user.id,
        email: demo.email,
        full_name: demo.full_name,
        role: demo.role,
        phone: demo.phone,
        is_active: true,
      };
      if (demo.needsCompany) {
        profileData.company_id = companyId;
      }

      const { error: profileError } = await supabaseAdmin.from("profiles").insert(profileData);

      if (profileError) {
        await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
        results.push({ email: demo.email, status: "error", error: profileError.message });
        continue;
      }

      results.push({ email: demo.email, status: "created" });
    }

    return new Response(
      JSON.stringify({ success: true, companyId, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("seed-demo-users error:", err instanceof Error ? err.message : err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
