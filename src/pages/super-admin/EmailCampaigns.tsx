import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { Megaphone, Plus, Loader2, Clock, CheckCircle2, XCircle, PlayCircle, FileText, Trash2 } from "lucide-react";

interface Campaign {
  id: string;
  name: string;
  description: string;
  status: string;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  scheduled_at: string | null;
  created_at: string;
  completed_at: string | null;
}

const STATUS_BADGE: Record<string, { cls: string; icon: React.ComponentType<{ className?: string }>; label: string }> = {
  draft: { cls: "bg-slate-100 text-slate-700", icon: FileText, label: "Draft" },
  scheduled: { cls: "bg-amber-100 text-amber-700", icon: Clock, label: "Planifikuar" },
  sending: { cls: "bg-teal-100 text-teal-700", icon: PlayCircle, label: "Duke derguar" },
  completed: { cls: "bg-emerald-100 text-emerald-700", icon: CheckCircle2, label: "Perfunduar" },
  failed: { cls: "bg-red-100 text-red-700", icon: XCircle, label: "Deshtoi" },
  cancelled: { cls: "bg-slate-100 text-slate-500", icon: XCircle, label: "Anulluar" },
};

export default function EmailCampaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("email_campaigns")
      .select("id, name, description, status, total_recipients, sent_count, failed_count, scheduled_at, created_at, completed_at")
      .not("name", "like", "__audience_probe_%")
      .order("created_at", { ascending: false });
    setCampaigns((data ?? []) as Campaign[]);
    setLoading(false);
  }

  async function remove(c: Campaign) {
    if (!window.confirm(`Fshi fushaten "${c.name}"?`)) return;
    await supabase.from("email_campaigns").delete().eq("id", c.id);
    load();
  }

  const filtered = filter === "all" ? campaigns : campaigns.filter((c) => c.status === filter);

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Megaphone className="h-6 w-6 text-teal-600" />
            Fushata emaili
          </h1>
          <p className="mt-1 text-sm text-slate-500">Dergoni njoftime dhe emaile marketingu te perdoruesit.</p>
        </div>
        <Link
          to="/super-admin/email/campaigns/new"
          className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
        >
          <Plus className="h-4 w-4" />
          Fushate e re
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap gap-1">
        {(["all", "draft", "scheduled", "sending", "completed", "failed"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === s ? "border-teal-500 bg-teal-50 text-teal-700" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {s === "all" ? "Te gjitha" : STATUS_BADGE[s].label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-teal-600" /></div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Fushata</th>
                <th className="px-4 py-3">Statusi</th>
                <th className="px-4 py-3">Marres</th>
                <th className="px-4 py-3">Dergua</th>
                <th className="px-4 py-3">Deshtuan</th>
                <th className="px-4 py-3">Planifikuar</th>
                <th className="px-4 py-3 text-right">Veprime</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">Pa fushata.</td></tr>
              ) : (
                filtered.map((c) => {
                  const s = STATUS_BADGE[c.status] ?? STATUS_BADGE.draft;
                  const Icon = s.icon;
                  return (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <Link to={`/super-admin/email/campaigns/${c.id}`} className="font-medium text-slate-900 hover:text-teal-600">
                          {c.name}
                        </Link>
                        {c.description && <div className="mt-0.5 max-w-md truncate text-xs text-slate-500">{c.description}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}>
                          <Icon className="h-3 w-3" />
                          {s.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{c.total_recipients}</td>
                      <td className="px-4 py-3 text-emerald-700">{c.sent_count}</td>
                      <td className="px-4 py-3 text-red-700">{c.failed_count}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {c.scheduled_at ? new Date(c.scheduled_at).toLocaleString() : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => remove(c)}
                            className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                            title="Fshi"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
