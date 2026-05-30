import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import {
  ArrowLeft, Loader2, PlayCircle, RefreshCw, CheckCircle2, XCircle, Clock, FileText, Send, AlertCircle,
} from "lucide-react";
import { useTranslation } from "../../i18n";

interface Campaign {
  id: string;
  name: string;
  description: string;
  status: string;
  mode: string;
  template_code: string | null;
  locale_mode: string;
  fixed_locale: string | null;
  audience_filter: Record<string, unknown>;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

interface Recipient {
  id: string;
  email: string;
  locale: string;
  status: string;
  error: string | null;
  sent_at: string | null;
  created_at: string;
}

const STATUS_META: Record<string, { cls: string; icon: React.ComponentType<{ className?: string }>; label: string }> = {
  draft: { cls: "bg-slate-100 text-slate-700", icon: FileText, label: "Draft" },
  scheduled: { cls: "bg-amber-100 text-amber-700", icon: Clock, label: "Planifikuar" },
  sending: { cls: "bg-teal-100 text-teal-700", icon: PlayCircle, label: "Duke derguar" },
  completed: { cls: "bg-emerald-100 text-emerald-700", icon: CheckCircle2, label: "Perfunduar" },
  failed: { cls: "bg-red-100 text-red-700", icon: XCircle, label: "Deshtoi" },
  cancelled: { cls: "bg-slate-100 text-slate-500", icon: XCircle, label: "Anulluar" },
};

const RCPT_STATUS: Record<string, string> = {
  pending: "bg-slate-100 text-slate-600",
  sent: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
  skipped: "bg-amber-100 text-amber-700",
};

export default function EmailCampaignDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [action, setAction] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; message: string } | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const { data: c } = await supabase
      .from("email_campaigns")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    setCampaign(c as Campaign | null);
    const { data: r } = await supabase
      .from("email_campaign_recipients")
      .select("id, email, locale, status, error, sent_at, created_at")
      .eq("campaign_id", id)
      .order("created_at", { ascending: false })
      .limit(500);
    setRecipients((r ?? []) as Recipient[]);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (campaign?.status !== "sending") return;
    const iv = setInterval(load, 3000);
    return () => clearInterval(iv);
  }, [campaign?.status, load]);

  async function triggerRun(retryFailed = false) {
    if (!campaign) return;
    setAction(retryFailed ? "retry" : "run");
    setToast(null);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email-campaign`;
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token || '';
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ campaign_id: campaign.id, retry_failed: retryFailed }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      setToast({ ok: true, message: retryFailed ? "Ridergimi filloi." : "Dergesa filloi." });
      load();
    } catch (e) {
      setToast({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setAction(null);
      setTimeout(() => setToast(null), 4000);
    }
  }

  async function cancel() {
    if (!campaign) return;
    if (!window.confirm(t('common.cancelCampaignConfirm'))) return;
    await supabase.from("email_campaigns").update({ status: "cancelled" }).eq("id", campaign.id);
    load();
  }

  if (loading || !campaign) {
    return <div className="flex items-center justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-teal-600" /></div>;
  }

  const filtered = filter === "all" ? recipients : recipients.filter((r) => r.status === filter);
  const meta = STATUS_META[campaign.status] ?? STATUS_META.draft;
  const StatusIcon = meta.icon;
  const total = campaign.total_recipients || 0;
  const done = campaign.sent_count + campaign.failed_count + campaign.skipped_count;
  const progress = total > 0 ? Math.min(100, (done / total) * 100) : 0;

  const canRun = campaign.status === "draft" || campaign.status === "scheduled" || campaign.status === "failed";
  const canRetry = campaign.failed_count > 0 && campaign.status !== "sending";
  const canCancel = campaign.status === "scheduled" || campaign.status === "sending" || campaign.status === "draft";

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-4 flex items-center gap-3">
        <Link to="/super-admin/email/campaigns" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="truncate text-xl font-bold text-slate-900">{campaign.name}</h1>
          {campaign.description && <p className="mt-0.5 truncate text-sm text-slate-500">{campaign.description}</p>}
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${meta.cls}`}>
          <StatusIcon className="h-3.5 w-3.5" />
          {meta.label}
        </span>
      </div>

      {toast && (
        <div className={`mb-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
          toast.ok ? "border-teal-200 bg-teal-50 text-teal-800" : "border-red-200 bg-red-50 text-red-800"
        }`}>
          {toast.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {toast.message}
        </div>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Marres</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{campaign.total_recipients}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium text-slate-500">{t('common.dergua')}</div>
          <div className="mt-1 text-2xl font-bold text-emerald-700">{campaign.sent_count}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium text-slate-500">{t('common.failed')}</div>
          <div className="mt-1 text-2xl font-bold text-red-700">{campaign.failed_count}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Anashkaluar</div>
          <div className="mt-1 text-2xl font-bold text-amber-700">{campaign.skipped_count}</div>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-medium text-slate-700">Progresi</span>
          <span className="text-slate-500">{done} / {total}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full bg-teal-500 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-3">
          {campaign.scheduled_at && <div><span className="text-slate-400">Planifikuar:</span> {new Date(campaign.scheduled_at).toLocaleString()}</div>}
          {campaign.started_at && <div><span className="text-slate-400">Filluar:</span> {new Date(campaign.started_at).toLocaleString()}</div>}
          {campaign.completed_at && <div><span className="text-slate-400">Perfunduar:</span> {new Date(campaign.completed_at).toLocaleString()}</div>}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {canRun && (
          <button
            type="button"
            onClick={() => triggerRun(false)}
            disabled={action !== null}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {action === "run" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Dergo tani
          </button>
        )}
        {canRetry && (
          <button
            type="button"
            onClick={() => triggerRun(true)}
            disabled={action !== null}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {action === "retry" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Ridergo te deshtuarit ({campaign.failed_count})
          </button>
        )}
        {canCancel && (
          <button
            type="button"
            onClick={cancel}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            <XCircle className="h-4 w-4" />
            Anullo
          </button>
        )}
      </div>

      <div className="mb-3 -mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {(["all", "pending", "sent", "failed", "skipped"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={`whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === s ? "border-teal-500 bg-teal-50 text-teal-700" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {s === "all" ? "Te gjithe" : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">{t('common.paMarres')}</div>
      ) : (
        <>
          <div className="grid gap-2 lg:hidden">
            {filtered.map((r) => (
              <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 font-mono text-xs text-slate-800 break-all">{r.email}</div>
                  <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${RCPT_STATUS[r.status] ?? "bg-slate-100 text-slate-600"}`}>
                    {r.status}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                  <span className="uppercase">{r.locale}</span>
                  {r.sent_at && <span>{new Date(r.sent_at).toLocaleString()}</span>}
                </div>
                {r.error && <div className="mt-2 break-words text-xs text-red-600">{r.error}</div>}
              </div>
            ))}
          </div>

          <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:block">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">{t('common.email')}</th>
                  <th className="px-4 py-3">Gjuha</th>
                  <th className="px-4 py-3">{t('common.status')}</th>
                  <th className="px-4 py-3">{t('common.error')}</th>
                  <th className="px-4 py-3">{t('common.dergua')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{r.email}</td>
                    <td className="px-4 py-2.5 text-xs uppercase text-slate-500">{r.locale}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${RCPT_STATUS[r.status] ?? "bg-slate-100 text-slate-600"}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 max-w-sm truncate text-xs text-red-600" title={r.error ?? ""}>{r.error ?? "—"}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">{r.sent_at ? new Date(r.sent_at).toLocaleString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
