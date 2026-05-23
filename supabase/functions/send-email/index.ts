import { createClient } from "npm:@supabase/supabase-js@2";
import { checkRateLimit, getClientIp, rateLimitResponse } from "../_shared/rateLimit.ts";
import { requireCaller, isServiceRoleCall } from "../_shared/requireCaller.ts";

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
  companyPhone: string;
  companyWebsite: string;
  companyRegistration: string;
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

async function loadBrand(companyId?: string | null): Promise<BrandConfig> {
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
      "email_company_phone",
      "email_company_website",
      "email_company_registration",
    ]);
  const m = new Map((data ?? []).map((r: { key: string; value: string }) => [r.key, r.value]));
  const platformBrand: BrandConfig = {
    brandName: m.get("email_brand_name") || "MM Logistic",
    logoUrl: m.get("email_brand_logo_url") || "",
    primary: m.get("email_brand_primary_color") || "#0f766e",
    secondary: m.get("email_brand_secondary_color") || "#0f172a",
    fromAddress: m.get("email_from_address") || "info@mm-logistic.eu",
    replyTo: m.get("email_reply_to") || "info@mm-logistic.eu",
    supportUrl: m.get("email_support_url") || "",
    legalAddress: m.get("email_legal_address") || "",
    appBaseUrl: m.get("email_app_base_url") || "",
    companyPhone: m.get("email_company_phone") || "",
    companyWebsite: m.get("email_company_website") || "",
    companyRegistration: m.get("email_company_registration") || "",
  };

  if (!companyId) return platformBrand;

  const { data: companySettings } = await supabase
    .from("company_email_settings")
    .select("brand_name, brand_logo_url, brand_primary_color, brand_secondary_color, reply_to_email, from_name")
    .eq("company_id", companyId)
    .maybeSingle();

  if (!companySettings) return platformBrand;

  return {
    ...platformBrand,
    brandName: companySettings.brand_name || platformBrand.brandName,
    logoUrl: companySettings.brand_logo_url || platformBrand.logoUrl,
    primary: companySettings.brand_primary_color || platformBrand.primary,
    secondary: companySettings.brand_secondary_color || platformBrand.secondary,
    replyTo: companySettings.reply_to_email || platformBrand.replyTo,
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
    company_phone: brand.companyPhone,
    company_website: brand.companyWebsite,
    company_registration: brand.companyRegistration,
    legal_address: brand.legalAddress,
    current_year: String(new Date().getFullYear()),
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
  isMarketing?: boolean;
}): string {
  const { brand, preheader, heading, intro, bodyHtml, ctaLabel, ctaUrl, footerNote, unsubscribeUrl, locale, isMarketing } = params;
  const year = new Date().getFullYear();
  const l: Record<Locale, {
    tagline: string;
    unsubscribe: string;
    support: string;
    website: string;
    phone: string;
    contact: string;
    legal_title: string;
    confidentiality: string;
    wrong_recipient: string;
    privacy: string;
    terms: string;
    rights: string;
    why_received: string;
    why_marketing: string;
    why_transactional: string;
    sent_by: string;
  }> = {
    sq: {
      tagline: "Smart logistics, clear numbers",
      unsubscribe: "Cregjistrohu",
      support: "Mbeshtetje",
      website: "Website",
      phone: "Tel",
      contact: "Na kontaktoni",
      legal_title: "Shenim ligjor",
      confidentiality: "Ky mesazh dhe bashkengjitjet e tij jane konfidenciale dhe te destinuara vetem per marresin e emertuar.",
      wrong_recipient: "Nese nuk jeni marresi i duhur, ju lutem njoftoni derguesin menjehere dhe fshini kete email pa e ndare ose kopjuar.",
      privacy: "Politika e privatesise",
      terms: "Kushtet e perdorimit",
      rights: "Te gjitha te drejtat e rezervuara.",
      why_received: "Pse e mora kete email?",
      why_marketing: "E morre kete email sepse je pajtuar per lajme dhe oferta nga {{brand}}.",
      why_transactional: "Ky eshte nje email transaksional qe lidhet me llogarine tende ne {{brand}}.",
      sent_by: "Ky email ju eshte derguar nga",
    },
    de: {
      tagline: "Smart logistics, clear numbers",
      unsubscribe: "Abmelden",
      support: "Support",
      website: "Webseite",
      phone: "Tel",
      contact: "Kontaktieren Sie uns",
      legal_title: "Rechtlicher Hinweis",
      confidentiality: "Diese Nachricht und ihre Anhaenge sind vertraulich und ausschliesslich fuer den genannten Empfaenger bestimmt.",
      wrong_recipient: "Falls Sie nicht der richtige Empfaenger sind, benachrichtigen Sie bitte sofort den Absender und loeschen Sie diese E-Mail, ohne sie weiterzugeben oder zu kopieren.",
      privacy: "Datenschutzerklaerung",
      terms: "Nutzungsbedingungen",
      rights: "Alle Rechte vorbehalten.",
      why_received: "Warum erhalte ich diese E-Mail?",
      why_marketing: "Sie erhalten diese E-Mail, weil Sie Neuigkeiten und Angebote von {{brand}} abonniert haben.",
      why_transactional: "Dies ist eine transaktionale E-Mail im Zusammenhang mit Ihrem Konto bei {{brand}}.",
      sent_by: "Diese E-Mail wurde Ihnen gesendet von",
    },
    en: {
      tagline: "Smart logistics, clear numbers",
      unsubscribe: "Unsubscribe",
      support: "Support",
      website: "Website",
      phone: "Phone",
      contact: "Contact us",
      legal_title: "Legal notice",
      confidentiality: "This message and its attachments are confidential and intended solely for the named recipient.",
      wrong_recipient: "If you are not the intended recipient, please notify the sender immediately and delete this email without sharing or copying it.",
      privacy: "Privacy Policy",
      terms: "Terms of Service",
      rights: "All rights reserved.",
      why_received: "Why did I receive this email?",
      why_marketing: "You received this email because you subscribed to news and offers from {{brand}}.",
      why_transactional: "This is a transactional email related to your account at {{brand}}.",
      sent_by: "This email was sent to you by",
    },
  };
  const L = l[locale] || l.sq;
  const brandEsc = escape(brand.brandName);
  const whyLine = (isMarketing ? L.why_marketing : L.why_transactional).replace("{{brand}}", brandEsc);

  const logoBlock = brand.logoUrl
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td style="background:#ffffff;border-radius:10px;padding:8px 14px;">
         <img src="${escape(brand.logoUrl)}" alt="${brandEsc}" width="160" style="display:block;width:160px;max-width:160px;height:auto;border:0;outline:none;text-decoration:none;" />
       </td></tr></table>`
    : `<div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:0.3px;">${brandEsc}</div>`;

  const ctaBlock = ctaLabel && ctaUrl
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0 8px 0;">
        <tr><td style="border-radius:10px;background-color:${brand.primary};">
          <a href="${escape(ctaUrl)}" style="display:inline-block;padding:14px 30px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;letter-spacing:0.2px;">${escape(ctaLabel)}</a>
        </td></tr>
      </table>`
    : "";

  const companyCard = `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:8px;">
      <tr><td style="padding:18px 24px;background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;font-size:13px;line-height:1.65;color:#475569;">
        <div style="font-weight:700;color:${brand.secondary};font-size:14px;margin-bottom:6px;letter-spacing:0.2px;">${brandEsc}</div>
        ${brand.legalAddress ? `<div style="margin-bottom:3px;">${escape(brand.legalAddress)}</div>` : ""}
        ${brand.companyPhone ? `<div style="margin-bottom:3px;">${L.phone}: <a href="tel:${escape(brand.companyPhone.replace(/\s+/g, ""))}" style="color:#475569;text-decoration:none;">${escape(brand.companyPhone)}</a></div>` : ""}
        <div style="margin-bottom:3px;">Email: <a href="mailto:${escape(brand.replyTo)}" style="color:${brand.primary};text-decoration:none;">${escape(brand.replyTo)}</a></div>
        ${brand.companyWebsite ? `<div style="margin-bottom:3px;">${L.website}: <a href="${escape(brand.companyWebsite)}" style="color:${brand.primary};text-decoration:none;">${escape(brand.companyWebsite.replace(/^https?:\/\//, ""))}</a></div>` : ""}
        ${brand.companyRegistration ? `<div style="color:#64748b;font-size:12px;margin-top:6px;">${escape(brand.companyRegistration)}</div>` : ""}
      </td></tr>
    </table>`;

  const privacyUrl = brand.appBaseUrl ? `${brand.appBaseUrl.replace(/\/$/, "")}/privacy-policy` : "";

  const legalFinePrint = `
    <div style="font-family:Georgia,'Times New Roman',serif;font-size:11px;line-height:1.6;color:#94a3b8;font-style:italic;margin-top:14px;">
      <div style="font-weight:600;font-style:normal;color:#64748b;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;font-size:10px;font-family:Arial,Helvetica,sans-serif;">${L.legal_title}</div>
      <div style="margin-bottom:4px;">${L.confidentiality}</div>
      <div style="margin-bottom:6px;">${L.wrong_recipient}</div>
      <div style="font-style:normal;font-family:Arial,Helvetica,sans-serif;color:#64748b;">
        ${privacyUrl ? `<a href="${escape(privacyUrl)}" style="color:#64748b;text-decoration:underline;">${L.privacy}</a> &middot; ` : ""}
        &copy; ${year} ${brandEsc}. ${L.rights}
      </div>
    </div>`;

  const whyBox = isMarketing
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:12px;">
         <tr><td style="padding:12px 16px;background-color:#fffbeb;border:1px solid #fde68a;border-radius:8px;font-size:12px;line-height:1.55;color:#92400e;">
           <strong>${L.why_received}</strong> ${whyLine}
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
<body style="margin:0;padding:0;background-color:#eef2f6;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escape(preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#eef2f6;padding:32px 12px;">
  <tr><td align="center">
    <table role="presentation" width="620" cellspacing="0" cellpadding="0" border="0" style="max-width:620px;width:100%;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(15,23,42,0.08);">
      <tr><td style="background:linear-gradient(135deg, ${brand.secondary} 0%, #1e293b 100%);padding:28px 36px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
          <td>${logoBlock}</td>
          <td align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#94a3b8;letter-spacing:1.5px;text-transform:uppercase;">${L.tagline}</td>
        </tr></table>
      </td></tr>
      <tr><td style="height:4px;background:linear-gradient(90deg, ${brand.primary} 0%, #fbbf24 100%);line-height:4px;">&nbsp;</td></tr>
      <tr><td style="padding:40px 36px 8px 36px;">
        <h1 style="margin:0 0 14px 0;font-size:24px;line-height:1.3;color:${brand.secondary};font-weight:800;letter-spacing:-0.2px;">${escape(heading)}</h1>
        <p style="margin:0 0 20px 0;font-size:15px;line-height:1.65;color:#334155;">${intro}</p>
      </td></tr>
      <tr><td style="padding:0 36px 8px 36px;font-size:15px;line-height:1.65;color:#334155;">
        ${bodyHtml}
        ${ctaBlock}
      </td></tr>
      ${footerNote ? `<tr><td style="padding:8px 36px 24px 36px;font-size:13px;line-height:1.55;color:#64748b;">${footerNote}</td></tr>` : `<tr><td style="padding:0 36px 24px 36px;">&nbsp;</td></tr>`}
      <tr><td style="padding:0 36px 24px 36px;">${companyCard}</td></tr>
      <tr><td style="background-color:#f8fafc;padding:22px 36px;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.55;color:#64748b;">
        <div style="margin-bottom:8px;">${L.sent_by} <strong style="color:${brand.secondary};">${brandEsc}</strong>.</div>
        <div style="margin-bottom:4px;">
          ${brand.supportUrl ? `<a href="${escape(brand.supportUrl)}" style="color:${brand.primary};text-decoration:none;font-weight:600;">${L.support}</a>` : ""}
          ${brand.supportUrl && brand.companyWebsite ? ` &middot; ` : ""}
          ${brand.companyWebsite ? `<a href="${escape(brand.companyWebsite)}" style="color:${brand.primary};text-decoration:none;font-weight:600;">${L.website}</a>` : ""}
          ${(brand.supportUrl || brand.companyWebsite) && unsubscribeUrl ? ` &middot; ` : ""}
          ${unsubscribeUrl ? `<a href="${escape(unsubscribeUrl)}" style="color:#64748b;text-decoration:underline;">${L.unsubscribe}</a>` : ""}
        </div>
        ${whyBox}
        ${legalFinePrint}
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

interface TemplateRow {
  code: string;
  is_active: boolean;
  category: string;
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

async function sendViaResend(
  to: string[],
  from: string,
  replyTo: string,
  subject: string,
  html: string,
  attachments?: SendRequest["attachments"],
  unsubscribeUrl?: string,
): Promise<{ ok: boolean; id?: string; error?: string; error_type?: string; error_name?: string }> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return { ok: false, error: "RESEND_API_KEY not configured", error_type: "no_key" };
  try {
    // RFC 8058 one-click List-Unsubscribe. Required by Gmail and Yahoo
    // for senders shipping more than 5000 mails/day, and a strong
    // reputation signal even below that threshold. Falls back to
    // mailto: when no per-recipient token URL was generated (e.g.
    // transactional skip).
    const headers: Record<string, string> = {};
    const unsubscribeMailto = `mailto:unsubscribe@mm-logistic.eu?subject=unsubscribe`;
    if (unsubscribeUrl) {
      headers["List-Unsubscribe"] = `<${unsubscribeUrl}>, <${unsubscribeMailto}>`;
      headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
    } else {
      headers["List-Unsubscribe"] = `<${unsubscribeMailto}>`;
    }

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, reply_to: replyTo, subject, html, attachments, headers }),
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
  companyId?: string | null,
): Promise<RenderedEmail | { error: string }> {
  let tpl: any = null;

  // Try company-specific template first
  if (companyId) {
    const { data: companyTpl } = await supabase
      .from("email_templates")
      .select("*")
      .eq("code", templateCode)
      .eq("company_id", companyId)
      .eq("is_active", true)
      .maybeSingle();
    if (companyTpl) tpl = companyTpl;
  }

  // Fallback to global template
  if (!tpl) {
    const { data: globalTpl } = await supabase
      .from("email_templates")
      .select("*")
      .eq("code", templateCode)
      .is("company_id", null)
      .maybeSingle();
    tpl = globalTpl;
  }

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

  const isMarketing = t.category === "marketing";
  const html = renderLayout({
    brand, preheader, heading, intro, bodyHtml,
    ctaLabel: ctaLabel || undefined,
    ctaUrl: ctaUrl || undefined,
    unsubscribeUrl: isMarketing ? unsubscribeUrl : undefined,
    locale,
    isMarketing,
  });

  return { subject, html, preheader, heading, intro, bodyHtml, ctaLabel, ctaUrl };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  try {
    const ip = getClientIp(req);
    const rl = await checkRateLimit(`send-email:ip=${ip}`, 10, 60_000);
    if (!rl.allowed) return rateLimitResponse(rl, corsHeaders);

    // Allow service-role (cron / inter-function) OR super_admin user.
    // Without this guard the function is an open relay that sends
    // platform-branded email to any address.
    if (!isServiceRoleCall(req)) {
      const caller = await requireCaller(req, { roles: ["super_admin"], corsHeaders });
      if (!caller.ok) return caller.response;
    }

    const body = (await req.json()) as SendRequest;
    if (!body.template_code) {
      return new Response(JSON.stringify({ error: "template_code required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const companyId = body.company_id ?? null;
    const brand = await loadBrand(companyId);
    const locale = (body.locale ?? "sq") as Locale;
    const rendered = await renderTemplate(body.template_code, locale, body.data ?? {}, brand, undefined, companyId);
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

    // Drop suppressed addresses (hard bounces, complaints, one-click
    // unsubscribes). Tests are exempt so we can verify templates with
    // throwaway addresses on the suppression list.
    if (!body.test) {
      const { data: rows } = await supabase
        .from("email_suppression")
        .select("email")
        .in("email", recipients.map((r) => r.toLowerCase()));
      const suppressed = new Set((rows ?? []).map((r) => (r.email as string).toLowerCase()));
      const filteredRecipients = recipients.filter((r) => !suppressed.has(r.toLowerCase()));
      if (filteredRecipients.length === 0) {
        // Nothing left to send — log a skipped delivery and return 200.
        await supabase.from("email_deliveries").insert({
          template_code: body.template_code,
          to_emails: recipients,
          subject: rendered.subject,
          status: "suppressed",
          provider: "resend",
          error_message: "All recipients are on the suppression list",
          user_id: body.user_id ?? null,
          company_id: companyId,
        });
        return new Response(
          JSON.stringify({ ok: true, status: "suppressed", suppressed: Array.from(suppressed) }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      recipients.length = 0;
      recipients.push(...filteredRecipients);
    }

    const unsubscribeUrl = body.test ? undefined : await ensureUnsubscribeUrl(body.user_id ?? null, brand);
    const finalRendered = unsubscribeUrl
      ? await renderTemplate(body.template_code, locale, body.data ?? {}, brand, unsubscribeUrl, companyId)
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
      unsubscribeUrl,
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
