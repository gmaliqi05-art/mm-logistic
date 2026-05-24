import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { checkRateLimit, getClientIp, rateLimitResponse } from "../_shared/rateLimit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // Brute-force protection for the 6-digit code. Without this an
    // attacker can try ~1M combinations in seconds.
    const ip = getClientIp(req);
    const ipRl = await checkRateLimit(`reset-verify:ip=${ip}`, 10, 60_000);
    if (!ipRl.allowed) return rateLimitResponse(ipRl, corsHeaders);

    const { email, code, newPassword } = await req.json() as {
      email: string;
      code: string;
      newPassword: string;
    };

    // Per-email throttle: at most 10 attempts in 10 minutes against
    // the same email regardless of IP.
    if (email && typeof email === "string") {
      const emailRl = await checkRateLimit(
        `reset-verify:email=${email.trim().toLowerCase()}`,
        10,
        600_000,
      );
      if (!emailRl.allowed) return rateLimitResponse(emailRl, corsHeaders);
    }

    if (!email || !code || !newPassword) {
      return new Response(
        JSON.stringify({ error: "missing_fields", message: "Email, code, and new password are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (newPassword.length < 6) {
      return new Response(
        JSON.stringify({ error: "weak_password", message: "Password must be at least 6 characters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedCode = code.trim();

    // Find valid code
    const { data: resetCode, error: codeError } = await supabase
      .from("password_reset_codes")
      .select("*")
      .eq("email", normalizedEmail)
      .eq("code", normalizedCode)
      .is("used_at", null)
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (codeError || !resetCode) {
      // Check if code exists but expired
      const { data: expiredCode } = await supabase
        .from("password_reset_codes")
        .select("id")
        .eq("email", normalizedEmail)
        .eq("code", normalizedCode)
        .is("used_at", null)
        .lt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (expiredCode) {
        return new Response(
          JSON.stringify({ error: "code_expired", message: "This code has expired. Please request a new one." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "invalid_code", message: "Invalid code. Please check and try again." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    // Mark code as used
    await supabase
      .from("password_reset_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("id", resetCode.id);

    // Update user password via admin API
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      resetCode.user_id,
      { password: newPassword }
    );

    if (updateError) {
      return new Response(
        JSON.stringify({ error: "update_failed", message: "Failed to update password. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("Verify reset code error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
