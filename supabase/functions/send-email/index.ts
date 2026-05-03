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
  to: string | string[];
  user_id?: string | null;
  company_id?: string | null;
  locale?: Locale;
  data?: Record<string, unknown>;
  attachments?: { filename: string; content: string }[];
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

interface TemplateResult {
  subject: string;
  heading: string;
  preheader: string;
  intro: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
}

type TemplateFn = (data: Record<string, unknown>, locale: Locale, brand: BrandConfig) => TemplateResult;

function pick<T>(locale: Locale, dict: Record<Locale, T>): T {
  return dict[locale] ?? dict.sq;
}

function appUrl(brand: BrandConfig, path: string): string {
  const base = brand.appBaseUrl.replace(/\/$/, "");
  return base ? `${base}${path.startsWith("/") ? path : `/${path}`}` : path;
}

const templates: Record<string, TemplateFn> = {
  welcome_company: (d, l, b) => {
    const company = escape(d.company_name);
    const name = escape(d.full_name);
    const t = pick(l, {
      sq: {
        subject: `Mireseerdhet ne ${b.brandName}`,
        heading: `Mireseerdhet, ${name}!`,
        preheader: `Llogaria per ${company} u krijua me sukses.`,
        intro: `Llogaria per <strong>${company}</strong> u krijua me sukses. Mund te kyceni dhe te nisni punen menjehere.`,
        body: `<p>Ekipi juaj tani ka akses ne: panelin e kompanise, menaxhim shoferesh, dergesa, depot dhe raporte.</p>`,
        cta: "Hap panelin",
        footer: `Nese keni pyetje, na kontaktoni ne <a href="${b.supportUrl}" style="color:${b.primary};">mbeshtetje</a>.`,
      },
      de: { subject: `Willkommen bei ${b.brandName}`, heading: `Willkommen, ${name}!`, preheader: `Konto fur ${company} wurde erstellt.`, intro: `Das Konto fur <strong>${company}</strong> wurde erfolgreich angelegt.`, body: `<p>Ihr Team hat nun Zugriff auf das Dashboard, Fahrer-Management, Lieferungen und mehr.</p>`, cta: "Dashboard offnen", footer: `Bei Fragen wenden Sie sich an den <a href="${b.supportUrl}" style="color:${b.primary};">Support</a>.` },
      en: { subject: `Welcome to ${b.brandName}`, heading: `Welcome, ${name}!`, preheader: `Account for ${company} has been created.`, intro: `Your account for <strong>${company}</strong> is ready.`, body: `<p>Your team now has access to the dashboard, driver management, deliveries, depots and reports.</p>`, cta: "Open dashboard", footer: `Need help? Visit <a href="${b.supportUrl}" style="color:${b.primary};">support</a>.` },
    });
    return { subject: t.subject, heading: t.heading, preheader: t.preheader, intro: t.intro, bodyHtml: t.body, ctaLabel: t.cta, ctaUrl: appUrl(b, "/"), footerNote: t.footer };
  },

  invite_user: (d, l, b) => {
    const name = escape(d.full_name);
    const company = escape(d.company_name);
    const role = escape(d.role_label);
    const link = escape(String(d.setup_url ?? appUrl(b, "/login")));
    const t = pick(l, {
      sq: { subject: `${escape(d.inviter_name)} ju ftoi ne ${company}`, heading: `Ju jeni ftuar ne ${b.brandName}`, preheader: `Vendosni fjalekalimin per te hyre.`, intro: `Pershendetje ${name}, ${escape(d.inviter_name)} ju ftoi si <strong>${role}</strong> ne ${company}.`, body: `<p>Klikoni butonin me poshte per te vendosur fjalekalimin tuaj dhe per te hyre.</p><p style="font-size:12px;color:#64748b;">Nese butoni nuk funksionon, hapni kete link: <a href="${link}" style="color:${b.primary};word-break:break-all;">${link}</a></p>`, cta: "Vendos fjalekalimin" },
      de: { subject: `${escape(d.inviter_name)} hat Sie zu ${company} eingeladen`, heading: `Sie wurden eingeladen`, preheader: `Legen Sie Ihr Passwort fest.`, intro: `Hallo ${name}, ${escape(d.inviter_name)} hat Sie als <strong>${role}</strong> zu ${company} eingeladen.`, body: `<p>Klicken Sie unten, um Ihr Passwort festzulegen.</p><p style="font-size:12px;color:#64748b;"><a href="${link}" style="color:${b.primary};word-break:break-all;">${link}</a></p>`, cta: "Passwort festlegen" },
      en: { subject: `${escape(d.inviter_name)} invited you to ${company}`, heading: `You've been invited`, preheader: `Set your password to sign in.`, intro: `Hi ${name}, ${escape(d.inviter_name)} invited you to ${company} as <strong>${role}</strong>.`, body: `<p>Click below to set your password and sign in.</p><p style="font-size:12px;color:#64748b;"><a href="${link}" style="color:${b.primary};word-break:break-all;">${link}</a></p>`, cta: "Set password" },
    });
    return { subject: t.subject, heading: t.heading, preheader: t.preheader, intro: t.intro, bodyHtml: t.body, ctaLabel: t.cta, ctaUrl: String(d.setup_url ?? appUrl(b, "/login")) };
  },

  password_reset: (d, l, b) => {
    const link = escape(String(d.reset_url));
    const t = pick(l, {
      sq: { subject: `Rivendosni fjalekalimin`, heading: `Rivendosje fjalekalimi`, preheader: `Link per te rivendosur fjalekalimin.`, intro: `Morem nje kerkese per te rivendosur fjalekalimin tuaj.`, body: `<p>Klikoni butonin me poshte. Linku skadon per 60 minuta.</p><p style="font-size:12px;color:#64748b;"><a href="${link}" style="color:${b.primary};word-break:break-all;">${link}</a></p><p>Nese nuk e keni kerkuar ju, injoroje kete email.</p>`, cta: "Rivendos fjalekalimin" },
      de: { subject: `Passwort zurucksetzen`, heading: `Passwort zurucksetzen`, preheader: `Link zum Zurucksetzen des Passworts.`, intro: `Wir haben eine Anfrage zum Zurucksetzen Ihres Passworts erhalten.`, body: `<p>Der Link ist 60 Minuten gultig.</p><p style="font-size:12px;color:#64748b;"><a href="${link}" style="color:${b.primary};word-break:break-all;">${link}</a></p>`, cta: "Passwort zurucksetzen" },
      en: { subject: `Reset your password`, heading: `Reset password`, preheader: `Link to reset your password.`, intro: `We received a request to reset your password.`, body: `<p>This link expires in 60 minutes.</p><p style="font-size:12px;color:#64748b;"><a href="${link}" style="color:${b.primary};word-break:break-all;">${link}</a></p>`, cta: "Reset password" },
    });
    return { subject: t.subject, heading: t.heading, preheader: t.preheader, intro: t.intro, bodyHtml: t.body, ctaLabel: t.cta, ctaUrl: String(d.reset_url) };
  },

  invoice_issued: (d, l, b) => {
    const number = escape(d.invoice_number);
    const total = escape(d.total_formatted);
    const due = escape(d.due_date ?? "-");
    const t = pick(l, {
      sq: { subject: `Fatura ${number}`, heading: `Fatura ${number}`, preheader: `Totali ${total}, afat ${due}.`, intro: `Ju dergojme faturen <strong>${number}</strong>.`, body: `<table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;margin:12px 0 20px 0;"><tr><td style="padding:10px 0;border-bottom:1px solid #e2e8f0;"><strong>Totali</strong></td><td style="padding:10px 0;border-bottom:1px solid #e2e8f0;text-align:right;">${total}</td></tr><tr><td style="padding:10px 0;border-bottom:1px solid #e2e8f0;"><strong>Afati i pageses</strong></td><td style="padding:10px 0;border-bottom:1px solid #e2e8f0;text-align:right;">${due}</td></tr></table>`, cta: "Shiko faturen" },
      de: { subject: `Rechnung ${number}`, heading: `Rechnung ${number}`, preheader: `Summe ${total}, Fallig ${due}.`, intro: `Ihre Rechnung <strong>${number}</strong>.`, body: `<p><strong>Summe:</strong> ${total}<br/><strong>Fallig:</strong> ${due}</p>`, cta: "Rechnung ansehen" },
      en: { subject: `Invoice ${number}`, heading: `Invoice ${number}`, preheader: `Total ${total}, due ${due}.`, intro: `Your invoice <strong>${number}</strong>.`, body: `<p><strong>Total:</strong> ${total}<br/><strong>Due:</strong> ${due}</p>`, cta: "View invoice" },
    });
    return { subject: t.subject, heading: t.heading, preheader: t.preheader, intro: t.intro, bodyHtml: t.body, ctaLabel: t.cta, ctaUrl: String(d.invoice_url ?? appUrl(b, `/accounting/invoices`)) };
  },

  invoice_paid: (d, l, b) => {
    const number = escape(d.invoice_number);
    const total = escape(d.total_formatted);
    const t = pick(l, {
      sq: { subject: `Fatura ${number} u pagua`, heading: `Fature e paguar`, preheader: `Fatura ${number} u pagua.`, intro: `Fatura <strong>${number}</strong> (${total}) u regjistrua si e paguar.`, body: `<p>Faleminderit per bashkepunimin.</p>`, cta: "Shiko detajet" },
      de: { subject: `Rechnung ${number} bezahlt`, heading: `Rechnung bezahlt`, preheader: `Rechnung ${number} wurde bezahlt.`, intro: `Die Rechnung <strong>${number}</strong> (${total}) wurde als bezahlt verbucht.`, body: `<p>Vielen Dank.</p>`, cta: "Details ansehen" },
      en: { subject: `Invoice ${number} paid`, heading: `Invoice paid`, preheader: `Invoice ${number} was paid.`, intro: `Invoice <strong>${number}</strong> (${total}) has been marked as paid.`, body: `<p>Thank you.</p>`, cta: "View details" },
    });
    return { subject: t.subject, heading: t.heading, preheader: t.preheader, intro: t.intro, bodyHtml: t.body, ctaLabel: t.cta, ctaUrl: String(d.invoice_url ?? appUrl(b, `/accounting/invoices`)) };
  },

  invoice_overdue: (d, l, b) => {
    const number = escape(d.invoice_number);
    const total = escape(d.total_formatted);
    const days = escape(d.days_overdue);
    const t = pick(l, {
      sq: { subject: `Rikujtese: Fatura ${number} eshte e vonuar`, heading: `Fature e vonuar`, preheader: `${days} dite pas afatit.`, intro: `Fatura <strong>${number}</strong> me total ${total} eshte <strong>${days} dite</strong> pas afatit.`, body: `<p>Ju lutemi procedoni me pagesen sa me shpejt.</p>`, cta: "Shiko faturen" },
      de: { subject: `Erinnerung: Rechnung ${number} uberfallig`, heading: `Uberfallige Rechnung`, preheader: `${days} Tage uberfallig.`, intro: `Die Rechnung <strong>${number}</strong> (${total}) ist seit <strong>${days} Tagen</strong> uberfallig.`, body: `<p>Bitte begleichen Sie die Zahlung.</p>`, cta: "Rechnung ansehen" },
      en: { subject: `Reminder: Invoice ${number} overdue`, heading: `Invoice overdue`, preheader: `${days} days past due.`, intro: `Invoice <strong>${number}</strong> for ${total} is <strong>${days} days</strong> overdue.`, body: `<p>Please process the payment as soon as possible.</p>`, cta: "View invoice" },
    });
    return { subject: t.subject, heading: t.heading, preheader: t.preheader, intro: t.intro, bodyHtml: t.body, ctaLabel: t.cta, ctaUrl: String(d.invoice_url ?? appUrl(b, `/accounting/invoices`)) };
  },

  compliance_expiring: (d, l, b) => {
    const type = escape(d.type_label);
    const subject_entity = escape(d.subject_label);
    const days = Number(d.days_remaining ?? 0);
    const expiry = escape(d.expiry_date);
    const t = pick(l, {
      sq: { subject: days < 0 ? `${type} ka skaduar - ${subject_entity}` : `${type} skadon per ${days} dite - ${subject_entity}`, heading: days < 0 ? `${type} ka skaduar` : days === 0 ? `${type} skadon sot` : `${type} skadon per ${days} dite`, preheader: `${subject_entity} - afat ${expiry}.`, intro: `<strong>${subject_entity}</strong>: ${type} ka afat <strong>${expiry}</strong>.`, body: `<p>Ju lutemi perditesoni dokumentin para skadimit per te shmangur nderprerjet.</p>`, cta: "Shko tek dokumenti" },
      de: { subject: days < 0 ? `${type} abgelaufen - ${subject_entity}` : `${type} lauft in ${days} Tagen ab`, heading: days < 0 ? `${type} abgelaufen` : `${type} lauft ab`, preheader: `${subject_entity} - ${expiry}.`, intro: `<strong>${subject_entity}</strong>: ${type} - <strong>${expiry}</strong>.`, body: `<p>Bitte aktualisieren Sie das Dokument.</p>`, cta: "Zum Dokument" },
      en: { subject: days < 0 ? `${type} expired - ${subject_entity}` : `${type} expires in ${days} days`, heading: days < 0 ? `${type} has expired` : `${type} expiring soon`, preheader: `${subject_entity} - ${expiry}.`, intro: `<strong>${subject_entity}</strong>: ${type} on <strong>${expiry}</strong>.`, body: `<p>Please update the document to avoid disruption.</p>`, cta: "Open document" },
    });
    return { subject: t.subject, heading: t.heading, preheader: t.preheader, intro: t.intro, bodyHtml: t.body, ctaLabel: t.cta, ctaUrl: String(d.url ?? appUrl(b, "/compliance")) };
  },

  delivery_assigned: (d, l, b) => {
    const number = escape(d.note_number);
    const t = pick(l, {
      sq: { subject: `Dergese e re: ${number}`, heading: `Dergese e re`, preheader: `Ju eshte caktuar ${number}.`, intro: `Ju eshte caktuar dergesa <strong>${number}</strong>.`, body: `<p>Hapni aplikacionin per te pare detajet.</p>`, cta: "Shiko dergesen" },
      de: { subject: `Neue Lieferung: ${number}`, heading: `Neue Lieferung`, preheader: `Ihnen wurde ${number} zugewiesen.`, intro: `Sie wurden der Lieferung <strong>${number}</strong> zugewiesen.`, body: `<p>Offnen Sie die App fur Details.</p>`, cta: "Lieferung ansehen" },
      en: { subject: `New delivery: ${number}`, heading: `New delivery`, preheader: `You were assigned ${number}.`, intro: `You have been assigned delivery <strong>${number}</strong>.`, body: `<p>Open the app to see details.</p>`, cta: "View delivery" },
    });
    return { subject: t.subject, heading: t.heading, preheader: t.preheader, intro: t.intro, bodyHtml: t.body, ctaLabel: t.cta, ctaUrl: String(d.url ?? appUrl(b, "/driver")) };
  },

  subscription_activated: (d, l, b) => {
    const plan = escape(d.plan_name);
    const t = pick(l, {
      sq: { subject: `Abonimi u aktivizua: ${plan}`, heading: `Abonim i aktivizuar`, preheader: `Planit ${plan}.`, intro: `Plani <strong>${plan}</strong> eshte aktivizuar per kompanine tuaj.`, body: `<p>Faleminderit per besimin.</p>`, cta: "Menaxho abonimin" },
      de: { subject: `Abonnement aktiv: ${plan}`, heading: `Abonnement aktiv`, preheader: `Plan ${plan}.`, intro: `Der Plan <strong>${plan}</strong> ist aktiviert.`, body: `<p>Vielen Dank.</p>`, cta: "Abonnement verwalten" },
      en: { subject: `Subscription active: ${plan}`, heading: `Subscription active`, preheader: `Plan ${plan}.`, intro: `Your <strong>${plan}</strong> plan is now active.`, body: `<p>Thank you.</p>`, cta: "Manage subscription" },
    });
    return { subject: t.subject, heading: t.heading, preheader: t.preheader, intro: t.intro, bodyHtml: t.body, ctaLabel: t.cta, ctaUrl: appUrl(b, "/company/settings") };
  },

  trial_ending_soon: (d, l, b) => {
    const days = escape(d.days_remaining);
    const t = pick(l, {
      sq: { subject: `Periudha provuese perfundon per ${days} dite`, heading: `Periudha provuese po perfundon`, preheader: `${days} dite te mbetura.`, intro: `Periudha provuese e ${b.brandName} perfundon per <strong>${days} dite</strong>.`, body: `<p>Zgjidhni nje plan per te vazhduar pa nderprerje.</p>`, cta: "Zgjidh planin" },
      de: { subject: `Testphase endet in ${days} Tagen`, heading: `Testphase endet bald`, preheader: `${days} Tage verbleibend.`, intro: `Ihre Testphase endet in <strong>${days} Tagen</strong>.`, body: `<p>Wahlen Sie einen Plan.</p>`, cta: "Plan wahlen" },
      en: { subject: `Trial ends in ${days} days`, heading: `Trial ending soon`, preheader: `${days} days remaining.`, intro: `Your trial of ${b.brandName} ends in <strong>${days} days</strong>.`, body: `<p>Choose a plan to continue without interruption.</p>`, cta: "Choose plan" },
    });
    return { subject: t.subject, heading: t.heading, preheader: t.preheader, intro: t.intro, bodyHtml: t.body, ctaLabel: t.cta, ctaUrl: appUrl(b, "/company/settings") };
  },

  fleet_doc_rejected: (d, l, b) => {
    const type = escape(d.doc_type);
    const reason = escape(d.reason);
    const t = pick(l, {
      sq: { subject: `Dokumenti u refuzua: ${type}`, heading: `Dokument i refuzuar`, preheader: reason, intro: `Dokumenti <strong>${type}</strong> u refuzua.`, body: `<p><strong>Arsyeja:</strong> ${reason}</p>`, cta: "Ringarko dokumentin" },
      de: { subject: `Dokument abgelehnt: ${type}`, heading: `Dokument abgelehnt`, preheader: reason, intro: `Das Dokument <strong>${type}</strong> wurde abgelehnt.`, body: `<p><strong>Grund:</strong> ${reason}</p>`, cta: "Erneut hochladen" },
      en: { subject: `Document rejected: ${type}`, heading: `Document rejected`, preheader: reason, intro: `Document <strong>${type}</strong> was rejected.`, body: `<p><strong>Reason:</strong> ${reason}</p>`, cta: "Re-upload document" },
    });
    return { subject: t.subject, heading: t.heading, preheader: t.preheader, intro: t.intro, bodyHtml: t.body, ctaLabel: t.cta, ctaUrl: appUrl(b, "/compliance") };
  },

  admin_broadcast: (d, _l, b) => {
    return {
      subject: String(d.subject ?? b.brandName),
      heading: String(d.heading ?? d.subject ?? b.brandName),
      preheader: String(d.preheader ?? ""),
      intro: String(d.intro ?? ""),
      bodyHtml: String(d.body_html ?? ""),
      ctaLabel: d.cta_label ? String(d.cta_label) : undefined,
      ctaUrl: d.cta_url ? String(d.cta_url) : undefined,
    };
  },
};

async function ensureUnsubscribeUrl(userId: string | null | undefined, brand: BrandConfig): Promise<string | undefined> {
  if (!userId) return undefined;
  try {
    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
    await supabase.from("unsubscribe_tokens").insert({ token, user_id: userId, channel_code: "all" });
    return `${brand.appBaseUrl.replace(/\/$/, "")}/unsubscribe?token=${token}`;
  } catch {
    return undefined;
  }
}

async function sendViaResend(to: string[], from: string, replyTo: string, subject: string, html: string, attachments?: SendRequest["attachments"]): Promise<{ ok: boolean; id?: string; error?: string }> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return { ok: false, error: "RESEND_API_KEY not configured" };
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, reply_to: replyTo, subject, html, attachments }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: j?.message || `HTTP ${r.status}` };
    return { ok: true, id: j?.id };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  try {
    const body = (await req.json()) as SendRequest;
    const recipients = Array.isArray(body.to) ? body.to : [body.to];
    if (!body.template_code || recipients.length === 0) {
      return new Response(JSON.stringify({ error: "template_code and to are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tpl = templates[body.template_code];
    if (!tpl) {
      return new Response(JSON.stringify({ error: `Unknown template: ${body.template_code}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const brand = await loadBrand();
    const locale = (body.locale ?? "sq") as Locale;

    const unsubscribeUrl = await ensureUnsubscribeUrl(body.user_id ?? null, brand);

    const rendered = tpl(body.data ?? {}, locale, brand);
    const html = renderLayout({
      brand,
      preheader: rendered.preheader,
      heading: rendered.heading,
      intro: rendered.intro,
      bodyHtml: rendered.bodyHtml,
      ctaLabel: rendered.ctaLabel,
      ctaUrl: rendered.ctaUrl,
      footerNote: rendered.footerNote,
      unsubscribeUrl,
      locale,
    });

    const { ok, id, error } = await sendViaResend(
      recipients,
      brand.fromAddress,
      brand.replyTo,
      rendered.subject,
      html,
      body.attachments,
    );

    const logRows = recipients.map((r) => ({
      user_id: body.user_id ?? null,
      recipient_email: r,
      company_id: body.company_id ?? null,
      template_code: body.template_code,
      subject: rendered.subject,
      status: ok ? "sent" : error === "RESEND_API_KEY not configured" ? "skipped" : "failed",
      provider: "resend",
      provider_id: id ?? null,
      error: error ?? null,
      locale,
      metadata: body.data ?? {},
      sent_at: ok ? new Date().toISOString() : null,
    }));
    await supabase.from("email_deliveries").insert(logRows);

    return new Response(JSON.stringify({ ok, id, error }), {
      status: ok ? 200 : 202,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
