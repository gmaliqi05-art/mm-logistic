import { useEffect, useMemo, useState } from "react";
import { X, Send, Loader2, CheckCircle2, AlertCircle, Eye, Settings2, ChevronDown, ChevronUp, Tag } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../contexts/AuthContext";
import { useTranslation } from "../../../i18n";
import EmailPreviewPane from "./EmailPreviewPane";

interface Props {
  open: boolean;
  onClose: () => void;
  templateCode: string;
  defaultLocale?: "sq" | "de" | "en";
  defaultData?: Record<string, unknown>;
}

interface TemplateInfo {
  name: string;
  category: "transactional" | "marketing" | "system";
  variables: string[];
}

interface BrandInfo {
  brand_name: string;
  logo_url: string;
  app_base_url: string;
  support_url: string;
  legal_address: string;
  from_address: string;
}

const CATEGORY_META: Record<string, { cls: string; label: string }> = {
  transactional: { cls: "bg-teal-50 text-teal-700 border-teal-200", label: "Transaksional" },
  marketing: { cls: "bg-amber-50 text-amber-700 border-amber-200", label: "Promovim / Marketing" },
  system: { cls: "bg-slate-100 text-slate-700 border-slate-300", label: "Sistem / Informim" },
};

function buildSampleData(
  variables: string[],
  email: string,
  brand: BrandInfo,
  extras: Record<string, unknown>,
): Record<string, unknown> {
  const namePart = email.split("@")[0]?.replace(/[._-]/g, " ") || "Perdoruesi";
  const name = namePart.charAt(0).toUpperCase() + namePart.slice(1);
  const defaults: Record<string, unknown> = {
    user_name: name,
    recipient_name: name,
    name,
    first_name: name,
    email,
    user_email: email,
    company_name: brand.brand_name,
    brand_name: brand.brand_name,
    app_base_url: brand.app_base_url,
    support_url: brand.support_url,
    legal_address: brand.legal_address,
    login_url: brand.app_base_url ? `${brand.app_base_url}/login` : "https://example.com/login",
    dashboard_url: brand.app_base_url || "https://example.com",
    reset_url: brand.app_base_url ? `${brand.app_base_url}/reset-password` : "https://example.com/reset",
    doc_type: "Patent shoferi",
    document_type: "Patent shoferi",
    reason: "Foto e paqarte",
    invoice_no: "F-2026-0001",
    invoice_number: "F-2026-0001",
    amount: "150.00",
    amount_due: "150.00",
    currency: "EUR",
    due_date: new Date(Date.now() + 7 * 86400_000).toLocaleDateString(),
    trial_ends_at: new Date(Date.now() + 7 * 86400_000).toLocaleDateString(),
    driver_name: "Arben Krasniqi",
    plate: "01-AAA-111",
    delivery_no: "DN-2026-0001",
    plan_name: "Professional",
  };
  const out: Record<string, unknown> = { ...defaults, ...extras };
  variables.forEach((v) => {
    if (out[v] === undefined || out[v] === null || out[v] === "") {
      out[v] = `[${v}]`;
    }
  });
  return out;
}

export default function TestSendDialog({ open, onClose, templateCode, defaultLocale = "sq", defaultData = {} }: Props) {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [locale, setLocale] = useState<"sq" | "de" | "en">(defaultLocale);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; errorType?: string } | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [dataJson, setDataJson] = useState("{}");
  const [template, setTemplate] = useState<TemplateInfo | null>(null);
  const [brand, setBrand] = useState<BrandInfo | null>(null);

  useEffect(() => {
    if (!open) return;
    setEmail(profile?.email || "");
    setLocale(defaultLocale);
    setResult(null);
    setShowPreview(false);
    setShowAdvanced(false);

    (async () => {
      const [tplRes, brandRes] = await Promise.all([
        supabase
          .from("email_templates")
          .select("name, category, variables")
          .eq("code", templateCode)
          .maybeSingle(),
        supabase
          .from("platform_settings")
          .select("key, value")
          .in("key", [
            "email_brand_name",
            "email_brand_logo_url",
            "email_app_base_url",
            "email_support_url",
            "email_legal_address",
            "email_from_address",
          ]),
      ]);
      const tpl = tplRes.data as { name: string; category: TemplateInfo["category"]; variables: unknown } | null;
      if (tpl) {
        setTemplate({
          name: tpl.name,
          category: tpl.category,
          variables: Array.isArray(tpl.variables) ? (tpl.variables as string[]) : [],
        });
      }
      const map = new Map((brandRes.data ?? []).map((r: { key: string; value: string }) => [r.key, r.value]));
      setBrand({
        brand_name: map.get("email_brand_name") || "MM Logistic",
        logo_url: map.get("email_brand_logo_url") || "",
        app_base_url: map.get("email_app_base_url") || "",
        support_url: map.get("email_support_url") || "",
        legal_address: map.get("email_legal_address") || "",
        from_address: map.get("email_from_address") || "",
      });
    })();
  }, [open, profile?.email, defaultLocale, templateCode]);

  const sampleData = useMemo(() => {
    if (!brand) return { ...defaultData };
    return buildSampleData(template?.variables || [], email || "user@example.com", brand, defaultData);
  }, [template, email, brand, defaultData]);

  useEffect(() => {
    if (showAdvanced) {
      setDataJson(JSON.stringify(sampleData, null, 2));
    }
  }, [showAdvanced, sampleData]);

  if (!open) return null;

  const brandIncomplete = brand && (!brand.from_address || !brand.brand_name);

  async function send(opts?: { useResendSandbox?: boolean }) {
    setSending(true);
    setResult(null);
    try {
      let data: Record<string, unknown> = sampleData;
      if (showAdvanced) {
        try {
          data = JSON.parse(dataJson || "{}");
        } catch {
          setResult({ ok: false, message: "JSON i pavlefshem." });
          setSending(false);
          return;
        }
      }
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email`;
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token ?? '';
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          template_code: templateCode,
          to: email,
          locale,
          data,
          test: true,
          from_override: opts?.useResendSandbox ? `${brand?.brand_name || "MM Logistic"} <onboarding@resend.dev>` : undefined,
        }),
      });
      const j = await resp.json();
      if (resp.ok && j.ok) {
        setResult({ ok: true, message: `U dergua tek ${email}. Kontrollo inbox-in (mund te jete edhe ne Spam).` });
      } else {
        setResult({ ok: false, message: j.error || "Dergimi deshtoi", errorType: j.error_type });
      }
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setSending(false);
    }
  }

  const catMeta = template ? CATEGORY_META[template.category] : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3 backdrop-blur-sm sm:p-4" onClick={onClose}>
      <div
        className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-slate-900">{t('common.sendEmail')}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {template && <span className="truncate text-sm text-slate-700">{template.name}</span>}
              {catMeta && (
                <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${catMeta.cls}`}>
                  <Tag className="h-3 w-3" />
                  {catMeta.label}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Kodi: <code className="text-teal-700">{templateCode}</code>
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {brandIncomplete && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                Markimi nuk eshte konfiguruar plotesisht.{" "}
                <Link to="/super-admin/email/settings" className="font-medium underline hover:text-amber-900" onClick={onClose}>
                  Konfiguro parametrat
                </Link>
              </div>
            </div>
          )}

          <div className="flex items-start gap-2 rounded-lg border border-teal-100 bg-teal-50 p-3 text-xs text-teal-800">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              Email-i dergohet me logon, ngjyrat dhe tekstin e markes automatikisht. Variablat plotesohen me shembuj te arsyeshem.
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700">Adresa e marresit</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
              placeholder="email@example.com"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700">Gjuha e email-it</label>
            <div className="flex gap-2">
              {(["sq", "de", "en"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLocale(l)}
                  className={`flex-1 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                    locale === l ? "border-teal-500 bg-teal-50 text-teal-700" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div>
            <button
              type="button"
              onClick={() => setShowPreview((v) => !v)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-700 hover:text-teal-800"
            >
              <Eye className="h-3.5 w-3.5" />
              {showPreview ? "Fshih preview" : "Shiko preview para dergimit"}
              {showPreview ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            {showPreview && (
              <div className="mt-2 h-72 overflow-hidden rounded-lg border border-slate-200">
                <EmailPreviewPane templateCode={templateCode} locale={locale} sampleData={sampleData} />
              </div>
            )}
          </div>

          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700"
            >
              <Settings2 className="h-3.5 w-3.5" />
              {showAdvanced ? "Fshih opsionet e avancuara" : "Opsione te avancuara (JSON)"}
              {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            {showAdvanced && (
              <div className="mt-2">
                <label className="mb-1 block text-xs font-medium text-slate-700">Te dhenat e template-it (JSON)</label>
                <textarea
                  value={dataJson}
                  onChange={(e) => setDataJson(e.target.value)}
                  rows={6}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Plotesuar automatikisht nga variablat e template-it. Modifiko vetem nese duhet.
                </p>
              </div>
            )}
          </div>

          {result && (
            <div className={`rounded-lg p-3 text-sm ${result.ok ? "bg-teal-50 text-teal-800" : "bg-red-50 text-red-800"}`}>
              <div className="flex items-start gap-2">
                {result.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
                <span className="break-words">{result.message}</span>
              </div>
              {!result.ok && result.errorType === "domain_unverified" && (
                <div className="mt-3 space-y-2 border-t border-red-200 pt-3 text-xs">
                  <div className="font-medium text-red-900">Si te rregullosh:</div>
                  <ol className="list-inside list-decimal space-y-1 text-red-800">
                    <li>
                      Verifiko domain-in ne{" "}
                      <a href="https://resend.com/domains" target="_blank" rel="noreferrer" className="underline hover:text-red-900">
                        resend.com/domains
                      </a>{" "}
                      (shto SPF + DKIM), ose
                    </li>
                    <li>
                      Ndrysho <code className="rounded bg-red-100 px-1">email_from_address</code> ne{" "}
                      <Link to="/super-admin/email/settings" className="underline hover:text-red-900" onClick={onClose}>
                        Parametrat e emailit
                      </Link>{" "}
                      me nje adrese te domain-it te verifikuar.
                    </li>
                  </ol>
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => send({ useResendSandbox: true })}
                      disabled={sending}
                      className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      Dergo tani me onboarding@resend.dev (test)
                    </button>
                    <p className="mt-1 text-[11px] text-red-700">
                      Perdor adresen e testit te Resend per te pare si duket email-i. Per prodhim, verifiko domain-in.
                    </p>
                  </div>
                </div>
              )}
              {!result.ok && result.errorType === "invalid_api_key" && (
                <div className="mt-2 border-t border-red-200 pt-2 text-xs text-red-800">
                  Kontrollo <code className="rounded bg-red-100 px-1">RESEND_API_KEY</code> ne secrets e Supabase.
                </div>
              )}
              {!result.ok && result.errorType === "testing_restriction" && (
                <div className="mt-2 border-t border-red-200 pt-2 text-xs text-red-800">
                  Resend ne testim lejon dergim vetem te adresa e pronarit te llogarise. Verifiko domain-in per te derguar kudo.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 sm:w-auto"
          >
            Mbyll
          </button>
          <button
            type="button"
            onClick={() => send()}
            disabled={sending || !email}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? "Po dergohet..." : "Dergo tani"}
          </button>
        </div>
      </div>
    </div>
  );
}
