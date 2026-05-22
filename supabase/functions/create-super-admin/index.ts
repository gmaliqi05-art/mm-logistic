// Bootstrap-only endpoint. Disabled unless SETUP_TOKEN is configured in
// the environment, and the caller must present the same value in
// X-Setup-Token. There is no other path to a super_admin account, by
// design — once the first super_admin exists, further super_admins are
// created through manage-users by an existing super_admin.
import { createClient } from "npm:@supabase/supabase-js@2";
import { requireSetupToken } from "../_shared/requireCaller.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey, X-Setup-Token",
};

interface CreateSuperAdminPayload {
  email: string;
  password: string;
  fullName: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const tokenError = requireSetupToken(req, corsHeaders);
  if (tokenError) return tokenError;

  try {
    const { email, password, fullName }: CreateSuperAdminPayload = await req.json();

    if (!email || !password || !fullName) {
      throw new Error("Email, password, and full name are required");
    }
    if (typeof email !== "string" || typeof password !== "string" || typeof fullName !== "string") {
      throw new Error("Invalid payload types");
    }
    if (password.length < 12) {
      throw new Error("Password must be at least 12 characters");
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Refuse if the email already exists — avoid silent privilege change.
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (existing) {
      throw new Error("A profile with this email already exists");
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true,
    });

    if (authError) throw new Error(authError.message);
    const userId = authData.user.id;

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .insert({
        id: userId,
        email: email,
        full_name: fullName,
        role: "super_admin",
        company_id: null,
        phone: "",
        avatar_url: "",
        is_active: true,
      });

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new Error(profileError.message);
    }

    return new Response(
      JSON.stringify({
        success: true,
        userId,
        message: "Super admin created successfully",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
