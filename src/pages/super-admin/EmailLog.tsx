import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { Mail, Search, Loader2, CheckCircle2, XCircle, Eye, X } from "lucide-react";
import { useTranslation } from "../../i18n";

interface Delivery {
  id: string;
  recipient_email: string;
  template_code: string;
  subject: string;
  status: string;
  provider: string | null;
  provider_id: string | null;
  error: string | null;
  locale: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  sent_at: string | null;
  company_id: string | null;
}

const STATUS_CLS: Record<string, string> = {
  sent: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
  skipped: "bg-amber-100 text-amber-700",
  queued: "bg-slate-100 text-slate-600",
};

const RANGES = [
  { id: "1", label: "24 ore" },
  { id: "7", label: "7 dite" },
  { id: "30", label: "30 dite" },
  { id: "90", label: "90 dite" },
  { id: "all", label: "Te gjitha" },
];

export default function EmailLog() {
  const { t } = useTranslation();
  const [items, setItems] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [range, setRange] = useState<string>("7");
  const [templateFilter, setTemplateFilter] = useState<string>("all");
  const [templates, setTemplates] = useState<string[]>([]);
  const [detail, setDetail] = useState<Delivery | null>(null);

  useEffect(() => {
    load();
  }, [range]);

  useEffect(() => {
    supabase.from("email_templates").select("code").order("code").then(({ data }) => {
      setTemplates((data ?? []).map((r) => r.code as string));
    });
  }, []);

  async function load() {
    setLoading(true);
    let q = supabase
      .from("email_deliveries")
      .select("id, recipient_email, template_code, subject, status, provider, provider_id, error, locale, metadata, created_at, sent_at, company_id")
      .order("created_at", { ascending: false })
      .limit(500);
    if (range !== "all") {
      const since = new Date(Date.now() - parseInt(range, 10) * 86400_000).toISOString();
      q = q.gte("created_at", since);
    }
    const { data } = await q;
    setItems((data ?? []) as Delivery[]);
    setLoading(false);
  }

  const filtered = items.filter((d) => {
    if (status !== "all" && d.status !== status) return false;
    if (templateFilter !== "all" && d.template_code !== templateFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!d.recipient_email.toLowerCase().includes(q) && !d.subject.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900 sm:text-2xl">
          <Mail className="h-6 w-6 text-teal-600" />
          Log-u i emaileve
        </h1>
        <p className="mt-1 text-sm text-slate-500">{t('common.emailLogSubtitle')}</p>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative sm:col-span-2">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Kerko email ose subject..."
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
          />
        </div>
        <select
          value={templateFilter}
          onChange={(e) => setTemplateFilter(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
        >
          <option value="all">Te gjitha template-t</option>
          {templates.map((c) => (<option key={c} value={c}>{c}</option>))}
        </select>
        <select
          value={range}
          onChange={(e) => setRange(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
        >
          {RANGES.map((r) => (<option key={r.id} value={r.id}>{r.label}</option>))}
        </select>
      </div>

      <div className="mb-4 -mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {(["all", "sent", "failed", "skipped", "queued"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={`whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              status === s ? "border-teal-500 bg-teal-50 text-teal-700" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {s === "all" ? "Te gjitha" : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-teal-600" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">Pa te dhena.</div>
      ) : (
        <>
          <div className="grid gap-3 xl:hidden">
            {filtered.map((d) => (
              <div key={d.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-sm text-slate-800 break-all">{d.recipient_email}</div>
                    <div className="mt-0.5 text-sm text-slate-700 break-words line-clamp-2" title={d.subject}>{d.subject}</div>
                  </div>
                  <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLS[d.status] ?? "bg-slate-100 text-slate-600"}`}>
                    {d.status === "sent" ? <CheckCircle2 className="h-3 w-3" /> : d.status === "failed" ? <XCircle className="h-3 w-3" /> : null}
                    {d.status}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">{d.template_code}</code>
                  <span className="uppercase">{d.locale}</span>
                  <span>{new Date(d.created_at).toLocaleString()}</span>
                </div>
                <div className="mt-3 flex justify-end border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    onClick={() => setDetail(d)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-teal-600"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Detaje
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm xl:block">
            <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Koha</th>
                <th className="px-4 py-3">Marres</th>
                <th className="px-4 py-3">Template</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Gjuha</th>
                <th className="px-4 py-3">{t('common.status')}</th>
                <th className="px-4 py-3 text-right">Detaje</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filtered.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                      {new Date(d.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{d.recipient_email}</td>
                    <td className="px-4 py-2.5">
                      <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">{d.template_code}</code>
                    </td>
                    <td className="px-4 py-2.5 max-w-xs truncate text-slate-700" title={d.subject}>{d.subject}</td>
                    <td className="px-4 py-2.5 text-xs uppercase text-slate-500">{d.locale}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLS[d.status] ?? "bg-slate-100 text-slate-600"}`}>
                        {d.status === "sent" ? <CheckCircle2 className="h-3 w-3" /> : d.status === "failed" ? <XCircle className="h-3 w-3" /> : null}
                        {d.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <button
                        type="button"
                        onClick={() => setDetail(d)}
                        className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-teal-600"
                        title="Detaje"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          </div>
        </>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDetail(null)}>
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
              <h2 className="text-lg font-semibold text-slate-900">{t('common.deliveryDetails')}</h2>
              <button type="button" onClick={() => setDetail(null)} className="rounded-md p-1 text-slate-500 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3 px-5 py-4 text-sm">
              <Row k="Marres" v={detail.recipient_email} />
              <Row k="Subject" v={detail.subject} />
              <Row k="Template" v={detail.template_code} />
              <Row k="Gjuha" v={detail.locale} />
              <Row k="Statusi" v={detail.status} />
              <Row k="Provider" v={detail.provider ?? "—"} />
              <Row k="Provider ID" v={detail.provider_id ?? "—"} />
              <Row k="Krijuar" v={new Date(detail.created_at).toLocaleString()} />
              <Row k="Derguar" v={detail.sent_at ? new Date(detail.sent_at).toLocaleString() : "—"} />
              {detail.error && (
                <div>
                  <div className="mb-1 text-xs font-medium text-slate-500">Gabim</div>
                  <pre className="whitespace-pre-wrap rounded-lg bg-red-50 p-3 text-xs text-red-800">{detail.error}</pre>
                </div>
              )}
              {detail.metadata && Object.keys(detail.metadata).length > 0 && (
                <div>
                  <div className="mb-1 text-xs font-medium text-slate-500">{t('common.metadata')}</div>
                  <pre className="max-h-64 overflow-y-auto rounded-lg bg-slate-50 p-3 font-mono text-xs text-slate-700">
                    {JSON.stringify(detail.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-4">
      <div className="w-32 flex-shrink-0 text-xs font-medium text-slate-500">{k}</div>
      <div className="flex-1 break-all text-sm text-slate-800">{v}</div>
    </div>
  );
}
