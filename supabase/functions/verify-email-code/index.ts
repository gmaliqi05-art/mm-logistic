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
    const ip = getClientIp(req);
    const ipRl = await checkRateLimit(`verify-email-code:ip=${ip}`, 10, 60_000);
    if (!ipRl.allowed) return rateLimitResponse(ipRl, corsHeaders);

    const { email, code } = await req.json() as { email: string; code: string };

    if (!email || !code) {
      return new Response(
        JSON.stringify({ error: "missing_fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedCode = code.trim();

    // Per-email throttle: max 10 attempts in 10 minutes
    const emailRl = await checkRateLimit(
      `verify-email-code:email=${normalizedEmail}`,
      10,
      600_000,
    );
    if (!emailRl.allowed) return rateLimitResponse(emailRl, corsHeaders);

    // Find valid code
    const { data: verificationCode, error: codeError } = await supabase
      .from("email_verification_codes")
      .select("*")
      .eq("email", normalizedEmail)
      .eq("code", normalizedCode)
      .is("verified_at", null)
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (codeError || !verificationCode) {
      // Check if code exists but expired
      const { data: expiredCode } = await supabase
        .from("email_verification_codes")
        .select("id")
        .eq("email", normalizedEmail)
        .eq("code", normalizedCode)
        .is("verified_at", null)
        .lt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (expiredCode) {
        return new Response(
          JSON.stringify({ error: "code_expired" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({ error: "invalid_code" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Mark code as verified
    await supabase
      .from("email_verification_codes")
      .update({ verified_at: new Date().toISOString() })
      .eq("id", verificationCode.id);

    return new Response(
      JSON.stringify({ verified: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    // Log server-side, return generic text (pre-auth endpoint — no leak).
    console.error("Verify email code error:", err instanceof Error ? err.message : err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
