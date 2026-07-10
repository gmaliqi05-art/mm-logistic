import { useState, useEffect, useCallback, useMemo } from 'react';
import { Clock, Wrench, Layers, Loader2, BarChart3 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTranslation } from '../../i18n';

interface ReportRow {
  worker_id: string;
  full_name: string | null;
  work_date: string;
  on_leave: boolean;
  net_productive_min: number;
  sorting_min: number;
  repair_min: number;
  repaired_pallets: number;
  scrapped_pallets: number;
  sorted_pallets: number;
}

interface WorkerAgg {
  worker_id: string;
  full_name: string | null;
  repair_min: number;
  sorting_min: number;
  repaired_pallets: number;
  scrapped_pallets: number;
  sorted_pallets: number;
  leave_days: number;
}

type Period = 'today' | '7d' | '30d';

function fmtMin(mins: number): string {
  const m = Math.max(0, Math.round(mins));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h > 0 ? `${h}h ${r}m` : `${r}m`;
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Per-worker repair-vs-sorting report, backed by the
 * `depot_worker_time_report` RPC. Used on both the depot dashboard (scoped to
 * one depot) and the company dashboard (all depots when depotId is null).
 */
export default function WorkerTimeReport({
  companyId,
  depotId = null,
}: {
  companyId: string | null;
  depotId?: string | null;
}) {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<Period>('7d');
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const from = period === 'today' ? today() : period === '7d' ? isoDaysAgo(6) : isoDaysAgo(29);
    const { data, error } = await supabase.rpc('depot_worker_time_report', {
      p_company_id: companyId,
      p_depot_id: depotId,
      p_from: from,
      p_to: today(),
    });
    if (!error) setRows((data ?? []) as ReportRow[]);
    setLoading(false);
  }, [companyId, depotId, period]);

  useEffect(() => { void load(); }, [load]);

  const workers = useMemo<WorkerAgg[]>(() => {
    const m = new Map<string, WorkerAgg>();
    for (const r of rows) {
      let w = m.get(r.worker_id);
      if (!w) {
        w = {
          worker_id: r.worker_id,
          full_name: r.full_name,
          repair_min: 0,
          sorting_min: 0,
          repaired_pallets: 0,
          scrapped_pallets: 0,
          sorted_pallets: 0,
          leave_days: 0,
        };
        m.set(r.worker_id, w);
      }
      w.repair_min += r.repair_min;
      w.sorting_min += r.sorting_min;
      w.repaired_pallets += r.repaired_pallets;
      w.scrapped_pallets += r.scrapped_pallets;
      w.sorted_pallets += r.sorted_pallets;
      if (r.on_leave) w.leave_days += 1;
    }
    return Array.from(m.values()).sort(
      (a, b) => b.repair_min + b.sorting_min - (a.repair_min + a.sorting_min),
    );
  }, [rows]);

  const totals = useMemo(() => {
    return workers.reduce(
      (acc, w) => ({
        repair_min: acc.repair_min + w.repair_min,
        sorting_min: acc.sorting_min + w.sorting_min,
        repaired: acc.repaired + w.repaired_pallets,
        sorted: acc.sorted + w.sorted_pallets,
        scrapped: acc.scrapped + w.scrapped_pallets,
      }),
      { repair_min: 0, sorting_min: 0, repaired: 0, sorted: 0, scrapped: 0 },
    );
  }, [workers]);

  const periods: Array<{ key: Period; label: string }> = [
    { key: 'today', label: t('depot.timeTracking.today') },
    { key: '7d', label: t('depot.timeTracking.last7') },
    { key: '30d', label: t('depot.timeTracking.last30') },
  ];

  return (
    <section className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center flex-shrink-0">
            <BarChart3 className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-800">{t('depot.timeTracking.reportTitle')}</h2>
            <p className="text-[11px] text-gray-500">{t('depot.timeTracking.reportSubtitle')}</p>
          </div>
        </div>
        <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden self-start">
          {periods.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                period === p.key ? 'bg-teal-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-10 flex items-center justify-center text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : workers.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">{t('depot.timeTracking.noData')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-100">
                <th className="px-4 py-2 font-medium">{t('depot.timeTracking.worker')}</th>
                <th className="px-3 py-2 font-medium text-right">
                  <span className="inline-flex items-center gap-1 justify-end">
                    <Wrench className="w-3 h-3 text-amber-500" />{t('depot.timeTracking.repairTime')}
                  </span>
                </th>
                <th className="px-3 py-2 font-medium text-right">
                  <span className="inline-flex items-center gap-1 justify-end">
                    <Layers className="w-3 h-3 text-indigo-500" />{t('depot.timeTracking.sortTime')}
                  </span>
                </th>
                <th className="px-3 py-2 font-medium text-right">{t('depot.timeTracking.repairedPallets')}</th>
                <th className="px-3 py-2 font-medium text-right">{t('depot.timeTracking.sortedPallets')}</th>
                <th className="px-3 py-2 font-medium text-right">{t('depot.timeTracking.scrapped')}</th>
              </tr>
            </thead>
            <tbody>
              {workers.map((w) => {
                const busy = w.repair_min + w.sorting_min;
                const sortPct = busy > 0 ? Math.round((w.sorting_min / busy) * 100) : 0;
                return (
                  <tr key={w.worker_id} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-gray-900">{w.full_name || '-'}</div>
                      <div className="mt-1 h-1.5 w-28 bg-amber-100 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${sortPct}%` }} />
                      </div>
                      {w.leave_days > 0 && (
                        <span className="text-[10px] text-slate-400">
                          {w.leave_days} {t('depot.timeTracking.onLeave')}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-amber-700">{fmtMin(w.repair_min)}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-indigo-700">{fmtMin(w.sorting_min)}</td>
                    <td className="px-3 py-2.5 text-right text-gray-700">{w.repaired_pallets}</td>
                    <td className="px-3 py-2.5 text-right text-gray-700">{w.sorted_pallets}</td>
                    <td className="px-3 py-2.5 text-right text-rose-600">{w.scrapped_pallets || ''}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50/70 text-xs font-semibold text-gray-700">
                <td className="px-4 py-2.5">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3 h-3 text-gray-400" />{t('depot.timeTracking.total')}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right text-amber-700">{fmtMin(totals.repair_min)}</td>
                <td className="px-3 py-2.5 text-right text-indigo-700">{fmtMin(totals.sorting_min)}</td>
                <td className="px-3 py-2.5 text-right">{totals.repaired}</td>
                <td className="px-3 py-2.5 text-right">{totals.sorted}</td>
                <td className="px-3 py-2.5 text-right text-rose-600">{totals.scrapped || ''}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
