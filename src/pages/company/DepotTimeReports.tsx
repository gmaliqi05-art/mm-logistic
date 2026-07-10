import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FileClock, Loader2, ChevronRight, X, Wrench, Layers, Package, Recycle, Building2,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import WorkerTimeReport from '../../components/depot/WorkerTimeReport';

interface PayloadWorker {
  worker_id: string;
  full_name: string | null;
  repair_min: number;
  sorting_min: number;
  repaired_pallets: number;
  sorted_pallets: number;
  scrapped_pallets: number;
  leave_days: number;
}

interface Submission {
  id: string;
  depot_id: string | null;
  submitted_by: string | null;
  period_type: string;
  from_date: string;
  to_date: string;
  worker_id: string | null;
  note: string | null;
  payload: {
    totals?: { repair_min: number; sorting_min: number; repaired: number; sorted: number; scrapped: number };
    workers?: PayloadWorker[];
  };
  created_at: string;
}

function fmtMin(mins: number): string {
  const m = Math.max(0, Math.round(mins || 0));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h > 0 ? `${h}h ${r}m` : `${r}m`;
}

export default function CompanyDepotTimeReports() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [subs, setSubs] = useState<Submission[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [depotNames, setDepotNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Submission | null>(null);
  const [periodFilter, setPeriodFilter] = useState<string>('');

  const companyId = profile?.company_id ?? null;

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const { data } = await supabase
      .from('depot_time_report_submissions')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(200);
    const rows = (data ?? []) as Submission[];
    setSubs(rows);

    const [{ data: profs }, { data: depots }] = await Promise.all([
      supabase.from('profiles').select('id, full_name').eq('company_id', companyId),
      supabase.from('depots').select('id, name').eq('company_id', companyId),
    ]);
    setNames(new Map((profs ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name ?? '-'])));
    setDepotNames(new Map((depots ?? []).map((d: { id: string; name: string }) => [d.id, d.name])));
    setLoading(false);
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

  const periodLabel: Record<string, string> = {
    daily: t('depot.timeTracking.today'),
    weekly: t('depot.timeTracking.last7'),
    monthly: t('depot.timeTracking.last30'),
    custom: t('depot.timeTracking.custom'),
  };

  const filtered = useMemo(
    () => (periodFilter ? subs.filter((s) => s.period_type === periodFilter) : subs),
    [subs, periodFilter],
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold text-gray-900 flex items-center gap-2">
          <FileClock className="w-6 h-6 text-teal-600" />
          {t('depot.timeTracking.companyReportsTitle')}
        </h1>
        <p className="text-gray-500 text-sm mt-0.5">{t('depot.timeTracking.companyReportsSubtitle')}</p>
      </div>

      {/* Live company-wide report (all depots). */}
      <WorkerTimeReport companyId={companyId} variant="company" allowCustomRange allowWorkerFilter />

      {/* Submitted reports from depots. */}
      <section className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-800">{t('depot.timeTracking.companyReportsTitle')}</h2>
          <select
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
          >
            <option value="">{t('depot.timeTracking.period')}</option>
            <option value="daily">{periodLabel.daily}</option>
            <option value="weekly">{periodLabel.weekly}</option>
            <option value="monthly">{periodLabel.monthly}</option>
            <option value="custom">{periodLabel.custom}</option>
          </select>
        </div>

        {loading ? (
          <div className="py-10 flex items-center justify-center text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">{t('depot.timeTracking.noReports')}</p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {filtered.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => setOpen(s)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50/60 transition-colors"
                >
                  <div className="w-9 h-9 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center flex-shrink-0">
                    <FileClock className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {new Date(s.from_date).toLocaleDateString()} → {new Date(s.to_date).toLocaleDateString()}
                      <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
                        {periodLabel[s.period_type] ?? s.period_type}
                      </span>
                    </p>
                    <p className="text-[11px] text-gray-500 truncate">
                      {s.depot_id && depotNames.get(s.depot_id) && (
                        <span className="inline-flex items-center gap-1">
                          <Building2 className="w-3 h-3" />{depotNames.get(s.depot_id)} ·{' '}
                        </span>
                      )}
                      {t('depot.timeTracking.submittedBy')}: {s.submitted_by ? names.get(s.submitted_by) ?? '-' : '-'} ·{' '}
                      {new Date(s.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {s.payload?.totals && (
                      <span className="hidden sm:inline text-xs text-amber-700 font-semibold">
                        {fmtMin(s.payload.totals.repair_min)} · <span className="text-indigo-700">{fmtMin(s.payload.totals.sorting_min)}</span>
                      </span>
                    )}
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setOpen(null)} />
          <div className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-2xl max-h-[92dvh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div>
                <h2 className="text-base font-bold text-gray-900">
                  {new Date(open.from_date).toLocaleDateString()} → {new Date(open.to_date).toLocaleDateString()}
                </h2>
                <p className="text-[11px] text-gray-500">
                  {open.depot_id && depotNames.get(open.depot_id) ? `${depotNames.get(open.depot_id)} · ` : ''}
                  {t('depot.timeTracking.submittedBy')}: {open.submitted_by ? names.get(open.submitted_by) ?? '-' : '-'}
                </p>
              </div>
              <button onClick={() => setOpen(null)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 space-y-3">
              {open.payload?.totals && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Tile icon={Wrench} tone="text-amber-600" label={t('depot.timeTracking.repairTime')} value={fmtMin(open.payload.totals.repair_min)} />
                  <Tile icon={Layers} tone="text-indigo-600" label={t('depot.timeTracking.sortTime')} value={fmtMin(open.payload.totals.sorting_min)} />
                  <Tile icon={Package} tone="text-emerald-600" label={t('depot.timeTracking.repairedPallets')} value={open.payload.totals.repaired} />
                  <Tile icon={Recycle} tone="text-rose-600" label={t('depot.timeTracking.scrapped')} value={open.payload.totals.scrapped} />
                </div>
              )}
              <div className="overflow-x-auto border border-gray-100 rounded-lg">
                <table className="w-full text-sm min-w-[520px]">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-100">
                      <th className="px-3 py-2 font-medium">{t('depot.timeTracking.worker')}</th>
                      <th className="px-3 py-2 font-medium text-right">{t('depot.timeTracking.repairTime')}</th>
                      <th className="px-3 py-2 font-medium text-right">{t('depot.timeTracking.sortTime')}</th>
                      <th className="px-3 py-2 font-medium text-right">{t('depot.timeTracking.repairedPallets')}</th>
                      <th className="px-3 py-2 font-medium text-right">{t('depot.timeTracking.sortedPallets')}</th>
                      <th className="px-3 py-2 font-medium text-right">{t('depot.timeTracking.scrapped')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(open.payload?.workers ?? []).map((w) => (
                      <tr key={w.worker_id} className="border-b border-gray-50 last:border-0">
                        <td className="px-3 py-2 font-medium text-gray-900">{w.full_name || '-'}</td>
                        <td className="px-3 py-2 text-right text-amber-700 font-semibold">{fmtMin(w.repair_min)}</td>
                        <td className="px-3 py-2 text-right text-indigo-700 font-semibold">{fmtMin(w.sorting_min)}</td>
                        <td className="px-3 py-2 text-right text-gray-700">{w.repaired_pallets}</td>
                        <td className="px-3 py-2 text-right text-gray-700">{w.sorted_pallets}</td>
                        <td className="px-3 py-2 text-right text-rose-600">{w.scrapped_pallets || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Tile({ icon: Icon, tone, label, value }: { icon: typeof Wrench; tone: string; label: string; value: string | number }) {
  return (
    <div className="border border-gray-100 rounded-lg px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-gray-400 font-medium">
        <Icon className={`w-3 h-3 ${tone}`} />
        <span className="truncate">{label}</span>
      </div>
      <div className={`text-lg font-bold mt-0.5 ${tone}`}>{value}</div>
    </div>
  );
}
