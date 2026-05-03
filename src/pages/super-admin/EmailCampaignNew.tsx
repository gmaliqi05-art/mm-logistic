import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import {
  ArrowLeft, ArrowRight, Send, Clock, Loader2, Users, FileText,
  CheckCircle2, AlertCircle, Mail,
} from "lucide-react";
import EmailRichTextEditor from "../../components/superadmin/email/EmailRichTextEditor";
import AudienceSelector, { AudienceFilter } from "../../components/superadmin/email/AudienceSelector";

type Locale = "sq" | "de" | "en";

interface TemplateOption { code: string; name: string; category: string; }

interface AdHocContent {
  subject_sq: string; subject_de: string; subject_en: string;
  preheader_sq: string; preheader_de: string; preheader_en: string;
  heading_sq: string; heading_de: string; heading_en: string;
  intro_sq: string; intro_de: string; intro_en: string;
  body_html_sq: string; body_html_de: string; body_html_en: string;
  cta_label_sq: string; cta_label_de: string; cta_label_en: string;
  cta_url: string;
}

const EMPTY_AD_HOC: AdHocContent = {
  subject_sq: "", subject_de: "", subject_en: "",
  preheader_sq: "", preheader_de: "", preheader_en: "",
  heading_sq: "", heading_de: "", heading_en: "",
  intro_sq: "", intro_de: "", intro_en: "",
  body_html_sq: "", body_html_de: "", body_html_en: "",
  cta_label_sq: "", cta_label_de: "", cta_label_en: "",
  cta_url: "",
};

export default function EmailCampaignNew() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [step, setStep] = useState(1);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<"template" | "adhoc">("adhoc");
  const [templateCode, setTemplateCode] = useState<string>("");
  const [adHoc, setAdHoc] = useState<AdHocContent>(EMPTY_AD_HOC);
  const [contentLocale, setContentLocale] = useState<Locale>("sq");
  const [localeMode, setLocaleMode] = useState<"per_user" | "fixed">("per_user");
  const [fixedLocale, setFixedLocale] = useState<Locale>("sq");

  const [audience, setAudience] = useState<AudienceFilter>({ active_only: true });

  const [schedule, setSchedule] = useState<"now" | "later">("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("email_templates")
      .select("code, name, category")
      .eq("is_active", true)
      .in("category", ["marketing", "system"])
      .order("name")
      .then(({ data }) => setTemplates((data ?? []) as TemplateOption[]));
  }, []);

  useEffect(() => {
    if (profile?.email && !testEmail) setTestEmail(profile.email);
  }, [profile?.email, testEmail]);

  function updateAdHoc<K extends keyof AdHocContent>(k: K, v: AdHocContent[K]) {
    setAdHoc((p) => ({ ...p, [k]: v }));
  }

  async function sendTest() {
    setTestSending(true);
    setTestResult(null);
    try {
      const code = mode === "template" ? templateCode : "admin_broadcast";
      const data = mode === "template" ? {} : buildAdHocData(contentLocale);
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email`;
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ template_code: code, to: testEmail, locale: contentLocale, data, test: true }),
      });
      const j = await resp.json();
      setTestResult(resp.ok && j.ok ? { ok: true, message: `U dergua tek ${testEmail}` } : { ok: false, message: j.error || "Dergimi deshtoi" });
    } catch (e) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setTestSending(false);
    }
  }

  function buildAdHocData(l: Locale): Record<string, string> {
    const pick = <K extends "subject" | "preheader" | "heading" | "intro" | "body_html" | "cta_label">(
      key: K,
    ): string => {
      const raw = adHoc[`${key}_${l}` as keyof AdHocContent] as string;
      if (raw) return raw;
      const fallback = adHoc[`${key}_sq` as keyof AdHocContent] as string;
      return fallback || "";
    };
    return {
      subject: pick("subject"),
      preheader: pick("preheader"),
      heading: pick("heading"),
      intro: pick("intro"),
      body_html: pick("body_html"),
      cta_label: pick("cta_label"),
      cta_url: adHoc.cta_url,
    };
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const isSchedule = schedule === "later" && scheduledAt;
      const status = isSchedule ? "scheduled" : "sending";

      const adHocPayload: Record<string, string> = mode === "adhoc" ? buildAdHocData(contentLocale) : {};

      const { data: inserted, error: insertErr } = await supabase
        .from("email_campaigns")
        .insert({
          name,
          description,
          template_code: mode === "template" ? templateCode : "admin_broadcast",
          ad_hoc_content: adHocPayload,
          audience_filter: audience,
          locale_mode: localeMode,
          fixed_locale: fixedLocale,
          scheduled_at: isSchedule ? new Date(scheduledAt).toISOString() : null,
          status,
          test_recipients: [testEmail].filter(Boolean),
          created_by: profile?.id ?? null,
        })
        .select("id")
        .maybeSingle();
      if (insertErr || !inserted) throw new Error(insertErr?.message || "Nuk u krijua fushata");

      if (!isSchedule) {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email-campaign`;
        const { data: session } = await supabase.auth.getSession();
        const token = session.session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY;
        fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ campaign_id: inserted.id }),
        }).catch(() => {});
      }

      navigate(`/super-admin/email/campaigns/${inserted.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  const steps = [
    { n: 1, label: "Permbajtja", icon: FileText },
    { n: 2, label: "Audienca", icon: Users },
    { n: 3, label: "Dergesa", icon: Mail },
  ];

  const canNext1 = name.trim() !== "" && (mode === "template" ? !!templateCode : !!adHoc.subject_sq || !!adHoc.body_html_sq);
  const canNext2 = true;
  const canSubmit = schedule === "now" || (schedule === "later" && !!scheduledAt);

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/super-admin/email/campaigns" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Fushate e re emaili</h1>
            <p className="text-sm text-slate-500">Hapi {step} nga 3</p>
          </div>
        </div>
      </div>

      <div className="mb-6 flex items-center gap-2">
        {steps.map((s, i) => {
          const Icon = s.icon;
          const done = step > s.n;
          const active = step === s.n;
          return (
            <div key={s.n} className="flex items-center gap-2">
              <div className={`flex h-9 w-9 items-center justify-center rounded-full border-2 ${
                done ? "border-teal-600 bg-teal-600 text-white" : active ? "border-teal-600 text-teal-600" : "border-slate-300 text-slate-400"
              }`}>
                {done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </div>
              <span className={`text-sm font-medium ${active ? "text-slate-900" : "text-slate-500"}`}>{s.label}</span>
              {i < steps.length - 1 && <div className={`mx-2 h-0.5 w-10 ${done ? "bg-teal-600" : "bg-slate-200"}`} />}
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        {step === 1 && (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Emri i fushates</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
                  placeholder="p.sh. Promocion i veres 2026"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Pershkrim (opsional)</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-medium text-slate-700">Burimi i permbajtjes</label>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setMode("adhoc")}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    mode === "adhoc" ? "border-teal-500 bg-teal-50" : "border-slate-300 bg-white hover:bg-slate-50"
                  }`}
                >
                  <div className="text-sm font-semibold text-slate-900">Permbajtje ad-hoc</div>
                  <div className="text-xs text-slate-500">Shkruaj drejtperdrejt per kete fushate.</div>
                </button>
                <button
                  type="button"
                  onClick={() => setMode("template")}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    mode === "template" ? "border-teal-500 bg-teal-50" : "border-slate-300 bg-white hover:bg-slate-50"
                  }`}
                >
                  <div className="text-sm font-semibold text-slate-900">Perdor template ekzistues</div>
                  <div className="text-xs text-slate-500">Kategori marketing ose sistem.</div>
                </button>
              </div>
            </div>

            {mode === "template" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Template-i</label>
                <select
                  value={templateCode}
                  onChange={(e) => setTemplateCode(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
                >
                  <option value="">Zgjidh template...</option>
                  {templates.map((t) => (
                    <option key={t.code} value={t.code}>{t.name} ({t.code})</option>
                  ))}
                </select>
              </div>
            )}

            {mode === "adhoc" && (
              <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-900">Permbajtja</span>
                  <div className="flex gap-1 rounded-lg border border-slate-300 bg-white p-0.5">
                    {(["sq", "de", "en"] as const).map((l) => (
                      <button
                        key={l}
                        type="button"
                        onClick={() => setContentLocale(l)}
                        className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                          contentLocale === l ? "bg-teal-600 text-white" : "text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        {l.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Subject</label>
                  <input
                    type="text"
                    value={adHoc[`subject_${contentLocale}` as keyof AdHocContent]}
                    onChange={(e) => updateAdHoc(`subject_${contentLocale}` as keyof AdHocContent, e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Preheader</label>
                  <input
                    type="text"
                    value={adHoc[`preheader_${contentLocale}` as keyof AdHocContent]}
                    onChange={(e) => updateAdHoc(`preheader_${contentLocale}` as keyof AdHocContent, e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Heading</label>
                  <input
                    type="text"
                    value={adHoc[`heading_${contentLocale}` as keyof AdHocContent]}
                    onChange={(e) => updateAdHoc(`heading_${contentLocale}` as keyof AdHocContent, e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Intro</label>
                  <textarea
                    value={adHoc[`intro_${contentLocale}` as keyof AdHocContent]}
                    onChange={(e) => updateAdHoc(`intro_${contentLocale}` as keyof AdHocContent, e.target.value)}
                    rows={2}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Permbajtja (WYSIWYG)</label>
                  <EmailRichTextEditor
                    value={adHoc[`body_html_${contentLocale}` as keyof AdHocContent]}
                    onChange={(v) => updateAdHoc(`body_html_${contentLocale}` as keyof AdHocContent, v)}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">Etiketa CTA</label>
                    <input
                      type="text"
                      value={adHoc[`cta_label_${contentLocale}` as keyof AdHocContent]}
                      onChange={(e) => updateAdHoc(`cta_label_${contentLocale}` as keyof AdHocContent, e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">URL CTA</label>
                    <input
                      type="text"
                      value={adHoc.cta_url}
                      onChange={(e) => updateAdHoc("cta_url", e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-lg bg-slate-50 p-4">
              <label className="mb-2 block text-xs font-medium text-slate-700">Gjuha e dergimit</label>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" checked={localeMode === "per_user"} onChange={() => setLocaleMode("per_user")} />
                  Sipas gjuhes se cdo perdoruesi
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" checked={localeMode === "fixed"} onChange={() => setLocaleMode("fixed")} />
                  Gjuhe fikse:
                </label>
                {localeMode === "fixed" && (
                  <select
                    value={fixedLocale}
                    onChange={(e) => setFixedLocale(e.target.value as Locale)}
                    className="rounded border border-slate-300 px-2 py-1 text-sm"
                  >
                    <option value="sq">Shqip</option>
                    <option value="de">Gjermanisht</option>
                    <option value="en">Anglisht</option>
                  </select>
                )}
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <AudienceSelector value={audience} onChange={setAudience} />
        )}

        {step === 3 && (
          <div className="space-y-5">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <h3 className="mb-2 text-sm font-semibold text-slate-900">Dergo nje test perpara</h3>
              <div className="flex flex-wrap gap-2">
                <input
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="flex-1 min-w-[220px] rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
                />
                <button
                  type="button"
                  onClick={sendTest}
                  disabled={testSending || !testEmail}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {testSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Dergo test
                </button>
              </div>
              {testResult && (
                <div className={`mt-2 flex items-center gap-2 text-sm ${testResult.ok ? "text-teal-700" : "text-red-700"}`}>
                  {testResult.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                  {testResult.message}
                </div>
              )}
            </div>

            <div>
              <label className="mb-2 block text-xs font-medium text-slate-700">Kur te dergohet?</label>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setSchedule("now")}
                  className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                    schedule === "now" ? "border-teal-500 bg-teal-50" : "border-slate-300 bg-white hover:bg-slate-50"
                  }`}
                >
                  <Send className="h-5 w-5 text-teal-600" />
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Dergo menjehere</div>
                    <div className="text-xs text-slate-500">Fillon menjehere pas krijimit.</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setSchedule("later")}
                  className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                    schedule === "later" ? "border-teal-500 bg-teal-50" : "border-slate-300 bg-white hover:bg-slate-50"
                  }`}
                >
                  <Clock className="h-5 w-5 text-teal-600" />
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Planifiko</div>
                    <div className="text-xs text-slate-500">Dergohet automatikisht ne oren e zgjedhur.</div>
                  </div>
                </button>
              </div>
              {schedule === "later" && (
                <div className="mt-3">
                  <label className="mb-1 block text-xs font-medium text-slate-700">Data dhe ora</label>
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
                  />
                </div>
              )}
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">
                <AlertCircle className="mt-0.5 h-4 w-4" />
                {error}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-6 flex justify-between">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(1, s - 1))}
          disabled={step === 1}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <ArrowLeft className="h-4 w-4" /> Mbrapa
        </button>
        {step < 3 ? (
          <button
            type="button"
            onClick={() => setStep((s) => s + 1)}
            disabled={(step === 1 && !canNext1) || (step === 2 && !canNext2)}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
          >
            Vazhdo <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit || submitting}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Krijo fushaten
          </button>
        )}
      </div>
    </div>
  );
}
