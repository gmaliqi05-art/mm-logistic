import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

type Locale = "sq" | "de" | "en";

interface BrandConfig {
  brandName: string;
  logoUrl: string;
  primary: string;
  secondary: string;
  fromAddress: string;
  replyTo: string;
  supportUrl: string;
  legalAddress: string;
  appBaseUrl: string;
}

interface SendRequest {
  template_code: string;
  to?: string | string[];
  user_id?: string | null;
  company_id?: string | null;
  locale?: Locale;
  data?: Record<string, unknown>;
  attachments?: { filename: string; content: string }[];
  preview?: boolean;
  test?: boolean;
  campaign_id?: string | null;
  from_override?: string;
}

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

async function loadBrand(): Promise<BrandConfig> {
  const { data } = await supabase
    .from("platform_settings")
    .select("key, value")
    .in("key", [
      "email_from_address",
      "email_reply_to",
      "email_brand_name",
      "email_brand_primary_color",
      "email_brand_secondary_color",
      "email_brand_logo_url",
      "email_legal_address",
      "email_support_url",
      "email_app_base_url",
    ]);
  const m = new Map((data ?? []).map((r: { key: string; value: string }) => [r.key, r.value]));
  return {
    brandName: m.get("email_brand_name") || "MM Logistic",
    logoUrl: m.get("email_brand_logo_url") || "",
    primary: m.get("email_brand_primary_color") || "#0f766e",
    secondary: m.get("email_brand_secondary_color") || "#0f172a",
    fromAddress: m.get("email_from_address") || "noreply@margroup.app",
    replyTo: m.get("email_reply_to") || "support@margroup.app",
    supportUrl: m.get("email_support_url") || "",
    legalAddress: m.get("email_legal_address") || "",
    appBaseUrl: m.get("email_app_base_url") || "",
  };
}

function escape(s: unknown): string {
  const t = String(s ?? "");
  return t
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript:/gi, "");
}

function interpolate(template: string, data: Record<string, unknown>, brand: BrandConfig): string {
  if (!template) return "";
  const merged: Record<string, unknown> = {
    brand_name: brand.brandName,
    app_base_url: brand.appBaseUrl,
    support_url: brand.supportUrl,
    ...data,
  };
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key) => {
    const v = merged[key];
    return v === undefined || v === null ? "" : String(v);
  });
}

function renderLayout(params: {
  brand: BrandConfig;
  preheader: string;
  heading: string;
  intro: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
  unsubscribeUrl?: string;
  locale: Locale;
}): string {
  const { brand, preheader, heading, intro, bodyHtml, ctaLabel, ctaUrl, footerNote, unsubscribeUrl, locale } = params;
  const footerLabels: Record<Locale, { unsubscribe: string; support: string; sent: string }> = {
    sq: { unsubscribe: "Cregjistrohu", support: "Mbeshtetje", sent: "Ky email ju eshte derguar nga" },
    de: { unsubscribe: "Abmelden", support: "Support", sent: "Diese E-Mail wurde Ihnen gesendet von" },
    en: { unsubscribe: "Unsubscribe", support: "Support", sent: "This email was sent to you by" },
  };
  const labels = footerLabels[locale] || footerLabels.sq;
  const logoBlock = brand.logoUrl
    ? `<img src="${escape(brand.logoUrl)}" alt="${escape(brand.brandName)}" width="140" style="display:block;max-height:48px;width:auto;border:0;outline:none;text-decoration:none;" />`
    : `<div style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:0.3px;">${escape(brand.brandName)}</div>`;
  const ctaBlock = ctaLabel && ctaUrl
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0;">
        <tr><td style="border-radius:8px;background-color:${brand.primary};">
          <a href="${escape(ctaUrl)}" style="display:inline-block;padding:14px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${escape(ctaLabel)}</a>
        </td></tr>
      </table>`
    : "";

  return `<!DOCTYPE html>
<html lang="${locale}"><head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${escape(heading)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escape(preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f1f5f9;padding:32px 12px;">
  <tr><td align="center">
    <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.08);">
      <tr><td style="background-color:${brand.secondary};padding:24px 32px;">
        ${logoBlock}
      </td></tr>
      <tr><td style="padding:36px 32px 8px 32px;">
        <h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;color:${brand.secondary};font-weight:700;">${escape(heading)}</h1>
        <p style="margin:0 0 18px 0;font-size:15px;line-height:1.6;color:#334155;">${intro}</p>
      </td></tr>
      <tr><td style="padding:0 32px 8px 32px;font-size:15px;line-height:1.6;color:#334155;">
        ${bodyHtml}
        ${ctaBlock}
      </td></tr>
      ${footerNote ? `<tr><td style="padding:8px 32px 32px 32px;font-size:13px;line-height:1.5;color:#64748b;">${footerNote}</td></tr>` : ""}
      <tr><td style="background-color:#f8fafc;padding:20px 32px;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.5;color:#64748b;">
        <div style="margin-bottom:6px;">${labels.sent} <strong style="color:${brand.secondary};">${escape(brand.brandName)}</strong>.</div>
        ${brand.legalAddress ? `<div style="margin-bottom:6px;">${escape(brand.legalAddress)}</div>` : ""}
        <div>
          ${brand.supportUrl ? `<a href="${escape(brand.supportUrl)}" style="color:${brand.primary};text-decoration:none;">${labels.support}</a>` : ""}
          ${brand.supportUrl && unsubscribeUrl ? ` &middot; ` : ""}
          ${unsubscribeUrl ? `<a href="${escape(unsubscribeUrl)}" style="color:#64748b;text-decoration:underline;">${labels.unsubscribe}</a>` : ""}
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

interface TemplateRow {
  code: string;
  is_active: boolean;
  preheader_sq: string; preheader_de: string; preheader_en: string;
  subject_sq: string; subject_de: string; subject_en: string;
  heading_sq: string; heading_de: string; heading_en: string;
  intro_sq: string; intro_de: string; intro_en: string;
  body_html_sq: string; body_html_de: string; body_html_en: string;
  cta_label_sq: string; cta_label_de: string; cta_label_en: string;
  cta_url: string;
}

function pickLocale<T>(locale: Locale, sq: T, de: T, en: T): T {
  if (locale === "de") return de || sq;
  if (locale === "en") return en || sq;
  return sq;
}

async function ensureUnsubscribeUrl(userId: string | null | undefined, brand: BrandConfig): Promise<string | undefined> {
  if (!userId) return undefined;
  try {
    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
    await supabase.from("unsubscribe_tokens").insert({ token, user_id: userId, channel_code: "all" });
    const base = brand.appBaseUrl.replace(/\/$/, "");
    return base ? `${base}/unsubscribe?token=${token}` : `/unsubscribe?token=${token}`;
  } catch {
    return undefined;
  }
}

async function sendViaResend(to: string[], from: string, replyTo: string, subject: string, html: string, attachments?: SendRequest["attachments"]): Promise<{ ok: boolean; id?: string; error?: string; error_type?: string; error_name?: string }> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return { ok: false, error: "RESEND_API_KEY not configured", error_type: "no_key" };
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, reply_to: replyTo, subject, html, attachments }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = j?.message || `HTTP ${r.status}`;
      const name = j?.name || "";
      let type = "send_failed";
      if (/domain is not verified|verify your domain/i.test(msg) || name === "validation_error") {
        type = "domain_unverified";
      } else if (/invalid.*api.?key|unauthorized/i.test(msg) || r.status === 401) {
        type = "invalid_api_key";
      } else if (/testing emails.*only.*your own/i.test(msg) || /you can only send testing emails/i.test(msg)) {
        type = "testing_restriction";
      }
      return { ok: false, error: msg, error_type: type, error_name: name };
    }
    return { ok: true, id: j?.id };
  } catch (e) {
    return { ok: false, error: String(e), error_type: "network" };
  }
}

interface RenderedEmail {
  subject: string;
  html: string;
  preheader: string;
  heading: string;
  intro: string;
  bodyHtml: string;
  ctaLabel: string;
  ctaUrl: string;
}

async function renderTemplate(
  templateCode: string,
  locale: Locale,
  data: Record<string, unknown>,
  brand: BrandConfig,
  unsubscribeUrl?: string,
): Promise<RenderedEmail | { error: string }> {
  const { data: tpl } = await supabase
    .from("email_templates")
    .select("*")
    .eq("code", templateCode)
    .maybeSingle();

  if (!tpl) return { error: `Template not found: ${templateCode}` };
  const t = tpl as TemplateRow;
  if (!t.is_active) return { error: `Template inactive: ${templateCode}` };

  const subject = interpolate(pickLocale(locale, t.subject_sq, t.subject_de, t.subject_en), data, brand);
  const preheader = interpolate(pickLocale(locale, t.preheader_sq, t.preheader_de, t.preheader_en), data, brand);
  const heading = interpolate(pickLocale(locale, t.heading_sq, t.heading_de, t.heading_en), data, brand);
  const introRaw = pickLocale(locale, t.intro_sq, t.intro_de, t.intro_en);
  const intro = sanitizeHtml(interpolate(introRaw, data, brand));
  const bodyRaw = pickLocale(locale, t.body_html_sq, t.body_html_de, t.body_html_en);
  const bodyHtml = sanitizeHtml(interpolate(bodyRaw, data, brand));
  const ctaLabel = interpolate(pickLocale(locale, t.cta_label_sq, t.cta_label_de, t.cta_label_en), data, brand);
  const ctaUrl = interpolate(t.cta_url, data, brand);

  const html = renderLayout({
    brand, preheader, heading, intro, bodyHtml,
    ctaLabel: ctaLabel || undefined,
    ctaUrl: ctaUrl || undefined,
    unsubscribeUrl,
    locale,
  });

  return { subject, html, preheader, heading, intro, bodyHtml, ctaLabel, ctaUrl };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  try {
    const body = (await req.json()) as SendRequest;
    if (!body.template_code) {
      return new Response(JSON.stringify({ error: "template_code required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const brand = await loadBrand();
    const locale = (body.locale ?? "sq") as Locale;

    const rendered = await renderTemplate(body.template_code, locale, body.data ?? {}, brand, undefined);
    if ("error" in rendered) {
      return new Response(JSON.stringify(rendered), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.preview) {
      return new Response(JSON.stringify({
        subject: rendered.subject,
        html: rendered.html,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const recipients = Array.isArray(body.to) ? body.to : body.to ? [body.to] : [];
    if (recipients.length === 0) {
      return new Response(JSON.stringify({ error: "to required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const unsubscribeUrl = body.test ? undefined : await ensureUnsubscribeUrl(body.user_id ?? null, brand);
    const finalRendered = unsubscribeUrl
      ? await renderTemplate(body.template_code, locale, body.data ?? {}, brand, unsubscribeUrl)
      : rendered;
    const finalHtml = "error" in finalRendered ? rendered.html : finalRendered.html;
    const finalSubject = "error" in finalRendered ? rendered.subject : finalRendered.subject;

    const fromAddress = body.from_override?.trim() || brand.fromAddress;
    const { ok, id, error, error_type, error_name } = await sendViaResend(
      recipients,
      fromAddress,
      brand.replyTo,
      finalSubject,
      finalHtml,
      body.attachments,
    );

    if (!body.test) {
      const logRows = recipients.map((r) => ({
        user_id: body.user_id ?? null,
        recipient_email: r,
        company_id: body.company_id ?? null,
        template_code: body.template_code,
        subject: finalSubject,
        status: ok ? "sent" : error === "RESEND_API_KEY not configured" ? "skipped" : "failed",
        provider: "resend",
        provider_id: id ?? null,
        error: error ?? null,
        locale,
        metadata: { ...(body.data ?? {}), campaign_id: body.campaign_id ?? null },
        sent_at: ok ? new Date().toISOString() : null,
      }));
      await supabase.from("email_deliveries").insert(logRows);
    }

    return new Response(JSON.stringify({ ok, id, error, error_type, error_name, from: fromAddress }), {
      status: ok ? 200 : 202,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
