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

function buildEmailHtml(code: string, locale: string): { subject: string; html: string } {
  const isEn = locale === "en";
  const isDe = locale === "de";
  const isFr = locale === "fr";

  const subject = isDe
    ? `Ihr Verifizierungscode: ${code}`
    : isEn
    ? `Your verification code: ${code}`
    : isFr
    ? `Votre code de verification: ${code}`
    : `Kodi juaj i verifikimit: ${code}`;

  const heading = isDe
    ? "E-Mail verifizieren"
    : isEn
    ? "Verify Your Email"
    : isFr
    ? "Verifier votre email"
    : "Verifikoni Emailin Tuaj";

  const intro = isDe
    ? "Bitte verwenden Sie den folgenden Code, um Ihre E-Mail-Adresse zu verifizieren."
    : isEn
    ? "Please use the code below to verify your email address."
    : isFr
    ? "Veuillez utiliser le code ci-dessous pour verifier votre adresse email."
    : "Ju lutem perdorni kodin e meposhtem per te verifikuar adresen tuaj te emailit.";

  const expiryNote = isDe
    ? "Dieser Code laeuft in <strong>15 Minuten</strong> ab."
    : isEn
    ? "This code expires in <strong>15 minutes</strong>."
    : isFr
    ? "Ce code expire dans <strong>15 minutes</strong>."
    : "Ky kod skadon pas <strong>15 minutash</strong>.";

  const ignoreNote = isDe
    ? "Wenn Sie diesen Code nicht angefordert haben, koennen Sie diese E-Mail ignorieren."
    : isEn
    ? "If you did not request this code, you can safely ignore this email."
    : isFr
    ? "Si vous n'avez pas demande ce code, vous pouvez ignorer cet email."
    : "Nese nuk keni kerkuar kete kod, mund ta injoroni kete email.";

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background-color:#eef2f6;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#eef2f6;padding:32px 12px;">
  <tr><td align="center">
    <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;width:100%;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(15,23,42,0.08);">
      <tr><td style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);padding:24px 32px;">
        <div style="font-size:20px;font-weight:800;color:#ffffff;letter-spacing:0.3px;">MM Logistic</div>
      </td></tr>
      <tr><td style="height:4px;background:linear-gradient(90deg,#0f766e 0%,#fbbf24 100%);line-height:4px;">&nbsp;</td></tr>
      <tr><td style="padding:36px 32px;">
        <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#0f172a;">${heading}</h1>
        <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">${intro}</p>
        <div style="text-align:center;margin:28px 0;">
          <div style="display:inline-block;background:#f0fdf4;border:2px solid #bbf7d0;border-radius:16px;padding:24px 48px;">
            <div style="font-size:40px;font-weight:800;letter-spacing:12px;color:#0f766e;font-family:'Courier New',Courier,monospace;">${code}</div>
          </div>
        </div>
        <p style="font-size:14px;color:#475569;line-height:1.6;text-align:center;">${expiryNote}</p>
        <p style="font-size:13px;color:#64748b;line-height:1.6;text-align:center;margin-top:16px;">${ignoreNote}</p>
      </td></tr>
      <tr><td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;">
        <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;">&copy; ${new Date().getFullYear()} MM Logistic</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

  return { subject, html };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const ip = getClientIp(req);
    const ipRl = await checkRateLimit(`verify-email:ip=${ip}`, 10, 60_000);
    if (!ipRl.allowed) return rateLimitResponse(ipRl, corsHeaders);

    const { email, locale } = await req.json() as { email: string; locale?: string };

    if (!email || typeof email !== "string") {
      return new Response(
        JSON.stringify({ error: "email_required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(normalizedEmail) || normalizedEmail.length > 254) {
      return new Response(
        JSON.stringify({ error: "invalid_email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Per-email rate limit: max 3 codes per 15 minutes
    const { data: recentCodes } = await supabase
      .from("email_verification_codes")
      .select("id")
      .eq("email", normalizedEmail)
      .gte("created_at", new Date(Date.now() - 15 * 60 * 1000).toISOString());

    if (recentCodes && recentCodes.length >= 3) {
      return new Response(
        JSON.stringify({ error: "too_many_requests" }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Check if email already exists in auth.users
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (existingProfile) {
      return new Response(
        JSON.stringify({ error: "email_already_registered" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Check if email already used as company email
    const { data: existingCompany } = await supabase
      .from("companies")
      .select("id")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (existingCompany) {
      return new Response(
        JSON.stringify({ error: "email_already_registered" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Invalidate previous unused codes for this email
    await supabase
      .from("email_verification_codes")
      .update({ verified_at: new Date().toISOString() })
      .eq("email", normalizedEmail)
      .is("verified_at", null);

    // Generate and store new code
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    await supabase.from("email_verification_codes").insert({
      email: normalizedEmail,
      code,
      expires_at: expiresAt,
    });

    // Load from address from platform_settings
    const { data: settingsRows } = await supabase
      .from("platform_settings")
      .select("key, value")
      .in("key", ["email_from_address", "email_brand_name"]);
    const settingsMap = new Map(
      (settingsRows ?? []).map((r: { key: string; value: string }) => [r.key, r.value]),
    );
    const brandName = settingsMap.get("email_brand_name") || "MM Logistic";
    const fromAddress = settingsMap.get("email_from_address") || "info@mm-logistic.eu";

    // Send email directly via Resend API
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "email_service_unavailable" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { subject, html } = buildEmailHtml(code, locale || "sq");

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${brandName} <${fromAddress}>`,
        to: [normalizedEmail],
        subject,
        html,
      }),
    });

    const resendData = await resendRes.json().catch(() => ({}));

    if (!resendRes.ok) {
      const errorMsg = resendData?.message || `Resend HTTP ${resendRes.status}`;
      console.error("Resend API error:", errorMsg, resendData);
      return new Response(
        JSON.stringify({ error: "email_send_failed", detail: errorMsg }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    // Log the real error server-side, return a generic message so internal /
    // SQL error text isn't disclosed to the (pre-auth) caller.
    console.error("Send verification code error:", err instanceof Error ? err.message : err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
