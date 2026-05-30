import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import {
  ArrowLeft, Save, Send, Loader2, Eye, EyeOff, CheckCircle2, AlertCircle,
} from "lucide-react";
import EmailRichTextEditor from "../../components/superadmin/email/EmailRichTextEditor";
import EmailPreviewPane from "../../components/superadmin/email/EmailPreviewPane";
import VariableChipList from "../../components/superadmin/email/VariableChipList";
import TestSendDialog from "../../components/superadmin/email/TestSendDialog";

type Locale = "sq" | "de" | "en";

interface TemplateRow {
  id?: string;
  code: string;
  name: string;
  description: string;
  category: "transactional" | "marketing" | "system";
  is_system: boolean;
  is_active: boolean;
  preheader_sq: string; preheader_de: string; preheader_en: string;
  subject_sq: string; subject_de: string; subject_en: string;
  heading_sq: string; heading_de: string; heading_en: string;
  intro_sq: string; intro_de: string; intro_en: string;
  body_html_sq: string; body_html_de: string; body_html_en: string;
  cta_label_sq: string; cta_label_de: string; cta_label_en: string;
  cta_url: string;
  variables: string[];
}

const EMPTY: TemplateRow = {
  code: "", name: "", description: "", category: "marketing",
  is_system: false, is_active: true,
  preheader_sq: "", preheader_de: "", preheader_en: "",
  subject_sq: "", subject_de: "", subject_en: "",
  heading_sq: "", heading_de: "", heading_en: "",
  intro_sq: "", intro_de: "", intro_en: "",
  body_html_sq: "", body_html_de: "", body_html_en: "",
  cta_label_sq: "", cta_label_de: "", cta_label_en: "",
  cta_url: "",
  variables: [],
};

export default function EmailTemplateEditor() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const isNew = !code || code === "new";

  const [tpl, setTpl] = useState<TemplateRow>(EMPTY);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [locale, setLocale] = useState<Locale>("sq");
  const [showPreview, setShowPreview] = useState(true);
  const [testOpen, setTestOpen] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    if (isNew) return;
    supabase.from("email_templates").select("*").eq("code", code).maybeSingle().then(({ data }) => {
      if (data) {
        setTpl({
          ...(data as TemplateRow),
          variables: Array.isArray((data as { variables?: unknown }).variables)
            ? ((data as { variables: string[] }).variables)
            : [],
        });
      }
      setLoading(false);
    });
  }, [code, isNew]);

  const sampleData = useMemo<Record<string, unknown>>(() => {
    const d: Record<string, unknown> = {};
    (tpl.variables || []).forEach((v) => {
      d[v] = getSampleValue(v);
    });
    return d;
  }, [tpl.variables]);

  function getSampleValue(v: string): string {
    const map: Record<string, string> = {
      full_name: "Agim Bytyqi",
      company_name: "Kompania Shembull sh.p.k.",
      brand_name: "MM Logistic",
      app_base_url: import.meta.env.VITE_SUPABASE_URL || "https://app.example.com",
      role_label: "Shofer",
      inviter_name: "Admini",
      setup_url: "https://app.example.com/setup",
      reset_url: "https://app.example.com/reset",
      invoice_number: "INV-2026-0042",
      total_formatted: "1.250,00 €",
      due_date: "2026-05-15",
      invoice_url: "https://app.example.com/invoices/42",
      days_overdue: "7",
      type_label: "TUV",
      subject_label: "Mjeti AA-123-BB",
      days_remaining: "14",
      expiry_date: "2026-05-20",
      plan_name: "Pro",
      doc_type: "Patent shoferi",
      reason: "Foto e paqarte",
      note_number: "DN-2026-0123",
      subject: "Njoftim i ri",
      preheader: "Lexoni me shume...",
      heading: "Titulli kryesor",
      intro: "Paragrafi hyres.",
      body_html: "<p>Permbajtja e fushates.</p>",
      cta_label: "Meso me shume",
      cta_url: "https://example.com",
    };
    return map[v] ?? `{{${v}}}`;
  }

  const update = useCallback(<K extends keyof TemplateRow>(k: K, v: TemplateRow[K]) => {
    setTpl((prev) => ({ ...prev, [k]: v }));
  }, []);

  async function save() {
    setSaving(true);
    setToast(null);
    try {
      const payload = { ...tpl, updated_by: profile?.id ?? null };
      if (isNew) {
        const { error } = await supabase.from("email_templates").insert(payload);
        if (error) throw error;
        setToast({ ok: true, message: "U krijua." });
        setTimeout(() => navigate(`/super-admin/email/templates/${tpl.code}`), 700);
      } else {
        const { error } = await supabase.from("email_templates").update(payload).eq("code", code);
        if (error) throw error;
        setToast({ ok: true, message: "U ruajt." });
      }
    } catch (e) {
      setToast({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 3000);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-teal-600" /></div>;
  }

  const field = (locKey: "preheader" | "subject" | "heading" | "intro" | "body_html" | "cta_label") =>
    (`${locKey}_${locale}`) as keyof TemplateRow;

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-t-xl border border-slate-200 bg-white px-4 py-3 lg:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link to="/super-admin/email/templates" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-slate-900">
              {isNew ? "Template i ri" : tpl.name || tpl.code}
            </h1>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <code className="truncate rounded bg-slate-100 px-1 py-0.5">{tpl.code || "—"}</code>
              {tpl.is_system && <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium">sistem</span>}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowPreview((x) => !x)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {showPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            Preview
          </button>
          <button
            type="button"
            onClick={() => setTestOpen(true)}
            disabled={isNew}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            Dergo test
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Ruaj
          </button>
        </div>
      </div>

      {toast && (
        <div className={`fixed right-4 top-20 z-40 flex items-center gap-2 rounded-lg border px-4 py-2 text-sm shadow-lg ${
          toast.ok ? "border-teal-200 bg-teal-50 text-teal-800" : "border-red-200 bg-red-50 text-red-800"
        }`}>
          {toast.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {toast.message}
        </div>
      )}

      <div className="flex flex-col xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col bg-slate-50 p-4 lg:p-6">
          <div className="mx-auto w-full max-w-3xl space-y-5">
            {isNew && (
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="mb-3 text-sm font-semibold text-slate-900">Te dhena bazike</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">Kodi (unik)</label>
                    <input
                      type="text"
                      value={tpl.code}
                      onChange={(e) => update("code", e.target.value.replace(/[^a-z0-9_]/gi, "_").toLowerCase())}
                      placeholder="p.sh. summer_promo"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">Kategoria</label>
                    <select
                      value={tpl.category}
                      onChange={(e) => update("category", e.target.value as TemplateRow["category"])}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
                    >
                      <option value="marketing">Marketing</option>
                      <option value="transactional">Transaksional</option>
                      <option value="system">Sistem</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-medium text-slate-700">Emri</label>
                    <input
                      type="text"
                      value={tpl.name}
                      onChange={(e) => update("name", e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-medium text-slate-700">Pershkrim</label>
                    <textarea
                      value={tpl.description}
                      onChange={(e) => update("description", e.target.value)}
                      rows={2}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
                <h2 className="text-sm font-semibold text-slate-900">Permbajtja</h2>
                <div className="flex gap-1 rounded-lg border border-slate-300 p-0.5">
                  {(["sq", "de", "en"] as const).map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setLocale(l)}
                      className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                        locale === l ? "bg-teal-600 text-white" : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      {l.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-4 p-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Subject</label>
                  <input
                    type="text"
                    value={String(tpl[field("subject")] ?? "")}
                    onChange={(e) => update(field("subject"), e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Preheader</label>
                  <input
                    type="text"
                    value={String(tpl[field("preheader")] ?? "")}
                    onChange={(e) => update(field("preheader"), e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Heading</label>
                  <input
                    type="text"
                    value={String(tpl[field("heading")] ?? "")}
                    onChange={(e) => update(field("heading"), e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Intro (paragraf hyres, HTML lejohet)</label>
                  <textarea
                    value={String(tpl[field("intro")] ?? "")}
                    onChange={(e) => update(field("intro"), e.target.value)}
                    rows={2}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Permbajtja</label>
                  <EmailRichTextEditor
                    value={String(tpl[field("body_html")] ?? "")}
                    onChange={(v) => update(field("body_html"), v)}
                    placeholder="Shkruani permbajtjen kryesore..."
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">Etiketa CTA</label>
                    <input
                      type="text"
                      value={String(tpl[field("cta_label")] ?? "")}
                      onChange={(e) => update(field("cta_label"), e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">URL CTA (te gjitha gjuhet)</label>
                    <input
                      type="text"
                      value={tpl.cta_url}
                      onChange={(e) => update("cta_url", e.target.value)}
                      placeholder="{{app_base_url}}/..."
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-2 text-sm font-semibold text-slate-900">Variablat e disponueshme</h2>
              <p className="mb-3 text-xs text-slate-500">
                Klikoni per te kopjuar. Perdorni <code>{"{{variable}}"}</code> kudo ne subject, heading, intro, body ose CTA URL.
              </p>
              <VariableChipList variables={tpl.variables || []} />
              {!tpl.is_system && (
                <div className="mt-3">
                  <label className="mb-1 block text-xs font-medium text-slate-700">Lista e variablave (comma-separated)</label>
                  <input
                    type="text"
                    value={(tpl.variables || []).join(", ")}
                    onChange={(e) =>
                      update(
                        "variables",
                        e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                      )
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
                  />
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">Parametra</h2>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={tpl.is_active}
                  onChange={(e) => update("is_active", e.target.checked)}
                  className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                Template aktiv (dergohet kur thirret)
              </label>
            </div>
          </div>
        </div>

        {showPreview && !isNew && tpl.code && (
          <div className="shrink-0 border-t border-slate-200 bg-white p-4 xl:w-[460px] xl:border-l xl:border-t-0">
            <div className="xl:sticky xl:top-20">
              <EmailPreviewPane templateCode={tpl.code} locale={locale} sampleData={sampleData} />
            </div>
          </div>
        )}
      </div>

      <TestSendDialog
        open={testOpen}
        onClose={() => setTestOpen(false)}
        templateCode={tpl.code}
        defaultLocale={locale}
        defaultData={sampleData}
      />
    </div>
  );
}
