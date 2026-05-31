import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { Settings, Save, Loader2, CheckCircle2, AlertCircle, Clock, Mail } from "lucide-react";
import { useTranslation } from '../../i18n';

type BrandKey = {
  key: string;
  label: string;
  placeholder: string;
  mono?: boolean;
  multiline?: boolean;
};

const BRAND_KEYS: readonly BrandKey[] = [
  { key: "email_brand_name", label: "Emri i markes", placeholder: "MM Logistic" },
  { key: "email_from_address", label: "Nga (From)", placeholder: "noreply@domain.com", mono: true },
  { key: "email_reply_to", label: "Reply-To", placeholder: "support@domain.com", mono: true },
  { key: "email_app_base_url", label: "URL baze e aplikacionit", placeholder: "https://app.domain.com", mono: true },
  { key: "email_support_url", label: "URL e mbeshtetjes", placeholder: "https://domain.com/support", mono: true },
  { key: "email_brand_logo_url", label: "URL e logos", placeholder: "https://domain.com/logo.png", mono: true },
  { key: "email_legal_address", label: "Adresa ligjore (footer)", placeholder: "Rr. Shembull 1, 10000 Prishtine", multiline: true },
];

const COLOR_KEYS = [
  { key: "email_brand_primary_color", label: "Ngjyra kryesore", default: "#0f766e" },
  { key: "email_brand_secondary_color", label: "Ngjyra dytesore", default: "#0f172a" },
] as const;

export default function EmailSettings() {
  const { t } = useTranslation();
  const [values, setValues] = useState<Record<string, string>>({});
  // Note: service_role_key is NEVER fetched into client state. The
  // DB column stores it for pg_cron to read server-side, but pulling
  // it back into the React app meant an XSS / browser-extension /
  // screen-recorder leak would compromise the entire platform (all
  // tenants). We only know whether the column is non-empty, and we
  // only write a new value if the user explicitly types one.
  const [cron, setCron] = useState<{ project_url: string; enabled: boolean; keyConfigured: boolean } | null>(null);
  const [newServiceKey, setNewServiceKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const keys = [...BRAND_KEYS.map((b) => b.key), ...COLOR_KEYS.map((c) => c.key)];
    const { data } = await supabase.from("platform_settings").select("key, value").in("key", keys);
    const map: Record<string, string> = {};
    (data ?? []).forEach((r) => { map[r.key as string] = (r.value as string) ?? ""; });
    COLOR_KEYS.forEach((c) => { if (!map[c.key]) map[c.key] = c.default; });
    setValues(map);

    // Read only the safe columns + whether the key is set, not the
    // key itself.
    const { data: cr } = await supabase
      .from("email_cron_config")
      .select("project_url, enabled")
      .eq("id", 1)
      .maybeSingle();
    if (cr) {
      const row = cr as { project_url: string | null; enabled: boolean };
      setCron({
        project_url: row.project_url ?? '',
        enabled: !!row.enabled,
        keyConfigured: !!row.enabled,
      });
    } else {
      setCron({ project_url: '', enabled: false, keyConfigured: false });
    }
    setNewServiceKey('');
    setLoading(false);
  }

  async function save() {
    setSaving(true);
    setToast(null);
    try {
      for (const [key, value] of Object.entries(values)) {
        const { error } = await supabase
          .from("platform_settings")
          .upsert({ key, value }, { onConflict: "key" });
        if (error) throw error;
      }
      if (cron) {
        // Only send service_role_key when the operator typed a new
        // value in this session — keeps the existing key untouched
        // on every other save, and prevents an empty-string clear
        // by accident.
        const payload: Record<string, unknown> = {
          id: 1,
          project_url: cron.project_url,
          enabled: cron.enabled,
          updated_at: new Date().toISOString(),
        };
        if (newServiceKey.trim()) payload.service_role_key = newServiceKey.trim();
        const { error } = await supabase
          .from("email_cron_config")
          .upsert(payload, { onConflict: "id" });
        if (error) throw error;
        if (newServiceKey.trim()) {
          setCron({ ...cron, keyConfigured: true });
          setNewServiceKey('');
        }
      }
      setToast({ ok: true, message: "Parametrat u ruajten." });
    } catch (e) {
      setToast({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 4000);
    }
  }

  const primary = values.email_brand_primary_color || "#0f766e";
  const secondary = values.email_brand_secondary_color || "#0f172a";

  if (loading) {
    return <div className="flex items-center justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-teal-600" /></div>;
  }

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900 sm:text-2xl">
            <Settings className="h-6 w-6 text-teal-600" />
            Parametrat e emailit
          </h1>
          <p className="mt-1 text-sm text-slate-500">{t('common.identitetiIMarkesAdresatDheAutomatizimi')}</p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50 sm:w-auto"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Ruaj
        </button>
      </div>

      {toast && (
        <div className={`mb-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
          toast.ok ? "border-teal-200 bg-teal-50 text-teal-800" : "border-red-200 bg-red-50 text-red-800"
        }`}>
          {toast.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {toast.message}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Mail className="h-4 w-4 text-teal-600" />
              Markimi dhe adresat
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {BRAND_KEYS.map((b) => (
                <div key={b.key} className={b.multiline ? "sm:col-span-2" : ""}>
                  <label className="mb-1 block text-xs font-medium text-slate-700">{b.label}</label>
                  {b.multiline ? (
                    <textarea
                      value={values[b.key] ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [b.key]: e.target.value }))}
                      placeholder={b.placeholder}
                      rows={2}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
                    />
                  ) : (
                    <input
                      type="text"
                      value={values[b.key] ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [b.key]: e.target.value }))}
                      placeholder={b.placeholder}
                      className={`w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100 ${b.mono ? "font-mono text-xs" : ""}`}
                    />
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-slate-900">Ngjyrat</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {COLOR_KEYS.map((c) => (
                <div key={c.key}>
                  <label className="mb-1 block text-xs font-medium text-slate-700">{c.label}</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={values[c.key] || c.default}
                      onChange={(e) => setValues((v) => ({ ...v, [c.key]: e.target.value }))}
                      className="h-10 w-14 cursor-pointer rounded border border-slate-300"
                    />
                    <input
                      type="text"
                      value={values[c.key] ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [c.key]: e.target.value }))}
                      placeholder={c.default}
                      className="flex-1 rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Clock className="h-4 w-4 text-teal-600" />{t('common.automatizimiPgCron')}</h2>
            <p className="mb-4 text-xs text-slate-500">
              Konfigurimi per fushata te planifikuara. Cron-u thiret cdo 5 minuta dhe kontrollon fushatat e gatshme.
            </p>
            {cron && (
              <div className="space-y-4">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={cron.enabled}
                    onChange={(e) => setCron({ ...cron, enabled: e.target.checked })}
                    className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                  />
                  Aktivizo automatizimin
                </label>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Project URL</label>
                  <input
                    type="text"
                    value={cron.project_url}
                    onChange={(e) => setCron({ ...cron, project_url: e.target.value })}
                    placeholder="https://xxxx.supabase.co"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Service Role Key
                    {cron.keyConfigured && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                        I KONFIGURUAR
                      </span>
                    )}
                  </label>
                  <input
                    type="password"
                    value={newServiceKey}
                    onChange={(e) => setNewServiceKey(e.target.value)}
                    autoComplete="new-password"
                    placeholder={cron.keyConfigured ? t('common.writeNewValueToChange') : 'eyJ...'}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
                  />
                  <p className="mt-1 text-xs text-slate-500">{t('common.nevojitetPerThirrjetEBrendshmeHttp')}</p>
                </div>
              </div>
            )}
          </section>
        </div>

        <div className="lg:col-span-2">
          <div className="sticky top-20 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">{t('common.headerPreview')}</h2>
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <div className="flex items-center gap-3 px-5 py-4" style={{ backgroundColor: primary }}>
                {values.email_brand_logo_url ? (
                  <img src={values.email_brand_logo_url} alt="" className="h-8 w-8 rounded object-contain bg-white/10" />
                ) : (
                  <div className="h-8 w-8 rounded bg-white/20" />
                )}
                <div className="font-semibold text-white">{values.email_brand_name || "Brand"}</div>
              </div>
              <div className="bg-white px-5 py-6">
                <h3 className="mb-2 text-lg font-semibold" style={{ color: secondary }}>Titulli i emailit</h3>
                <p className="mb-4 text-sm text-slate-600">{t('common.kjoEshteNjePreviewSeSi')}</p>
                <button
                  type="button"
                  className="rounded-lg px-4 py-2 text-sm font-medium text-white"
                  style={{ backgroundColor: primary }}
                >
                  CTA kryesor
                </button>
              </div>
              <div className="bg-slate-50 px-5 py-3 text-center text-[10px] text-slate-500" style={{ color: secondary, opacity: 0.6 }}>
                {values.email_legal_address || "Adresa ligjore shfaqet ketu"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
