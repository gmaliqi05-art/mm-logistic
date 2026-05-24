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

function generateCode(): string {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return String(array[0] % 1000000).padStart(6, "0");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // IP-level rate limit — prevents single attacker hitting the
    // endpoint with a list of emails. Per-email limit below handles
    // the targeted-user case.
    const ip = getClientIp(req);
    const ipRl = await checkRateLimit(`reset-request:ip=${ip}`, 10, 60_000);
    if (!ipRl.allowed) return rateLimitResponse(ipRl, corsHeaders);

    const { email, locale } = await req.json() as { email: string; locale?: string };

    if (!email || typeof email !== "string") {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Rate limit: max 3 requests per email per 15 minutes
    const { data: recentCodes } = await supabase
      .from("password_reset_codes")
      .select("id")
      .eq("email", normalizedEmail)
      .gte("created_at", new Date(Date.now() - 15 * 60 * 1000).toISOString());

    if (recentCodes && recentCodes.length >= 3) {
      return new Response(
        JSON.stringify({ error: "too_many_requests", message: "Too many reset attempts. Please wait 15 minutes." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find user by email
    const { data: userData } = await supabase.auth.admin.listUsers();
    const user = userData?.users?.find(
      (u) => u.email?.toLowerCase() === normalizedEmail
    );

    // Always return success to prevent email enumeration
    if (!user) {
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Invalidate any previous unused codes for this email
    await supabase
      .from("password_reset_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("email", normalizedEmail)
      .is("used_at", null);

    // Generate new 6-digit code
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    await supabase.from("password_reset_codes").insert({
      user_id: user.id,
      email: normalizedEmail,
      code,
      expires_at: expiresAt,
    });

    // Get user's profile for first name
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();

    const firstName = profile?.full_name?.split(" ")[0] || "";

    // Get platform settings for base URL
    const { data: settings } = await supabase
      .from("platform_settings")
      .select("key, value")
      .in("key", ["email_app_base_url"]);

    const settingsMap = new Map((settings ?? []).map((r: { key: string; value: string }) => [r.key, r.value]));
    const baseUrl = settingsMap.get("email_app_base_url") || "https://app.mm-logistic.eu";

    const resetUrl = `${baseUrl}/reset-password?code=${code}&email=${encodeURIComponent(normalizedEmail)}`;

    // Send email via send-email function
    const sendRes = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          template_code: "password_reset",
          to: normalizedEmail,
          locale: locale || "sq",
          data: {
            first_name: firstName,
            reset_url: resetUrl,
            reset_code: code,
            expiry_minutes: "15",
          },
        }),
      }
    );

    if (!sendRes.ok) {
      console.error("Failed to send reset email:", await sendRes.text());
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("Password reset request error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
