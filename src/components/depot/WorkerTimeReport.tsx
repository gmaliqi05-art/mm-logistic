import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Clock, Wrench, Layers, Loader2, BarChart3, ChevronDown, ChevronRight,
  Package, Recycle, Users,
} from 'lucide-react';
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
  days: ReportRow[];
}

interface Depot {
  id: string;
  name: string;
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
 * `depot_worker_time_report` RPC.
 *
 * - variant="depot": compact table for the depot dashboard (one depot).
 * - variant="company": company-wide detailed overview — KPI summary across all
 *   depots, a depot filter, and expandable per-worker rows that drill into the
 *   worker's daily breakdown.
 */
export default function WorkerTimeReport({
  companyId,
  depotId = null,
  variant = 'depot',
}: {
  companyId: string | null;
  depotId?: string | null;
  variant?: 'depot' | 'company';
}) {
  const { t } = useTranslation();
  const isCompany = variant === 'company';
  const [period, setPeriod] = useState<Period>('7d');
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [depots, setDepots] = useState<Depot[]>([]);
  const [depotFilter, setDepotFilter] = useState<string | null>(depotId);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Company variant: load the depot list once for the filter dropdown.
  useEffect(() => {
    if (!isCompany || !companyId) return;
    void (async () => {
      const { data } = await supabase
        .from('depots')
        .select('id, name')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('name');
      setDepots((data ?? []) as Depot[]);
    })();
  }, [isCompany, companyId]);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const from = period === 'today' ? today() : period === '7d' ? isoDaysAgo(6) : isoDaysAgo(29);
    const { data, error } = await supabase.rpc('depot_worker_time_report', {
      p_company_id: companyId,
      p_depot_id: isCompany ? depotFilter : depotId,
      p_from: from,
      p_to: today(),
    });
    if (!error) setRows((data ?? []) as ReportRow[]);
    setLoading(false);
  }, [companyId, depotId, depotFilter, isCompany, period]);

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
          days: [],
        };
        m.set(r.worker_id, w);
      }
      w.repair_min += r.repair_min;
      w.sorting_min += r.sorting_min;
      w.repaired_pallets += r.repaired_pallets;
      w.scrapped_pallets += r.scrapped_pallets;
      w.sorted_pallets += r.sorted_pallets;
      if (r.on_leave) w.leave_days += 1;
      w.days.push(r);
    }
    for (const w of m.values()) w.days.sort((a, b) => b.work_date.localeCompare(a.work_date));
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
        <div className="flex items-center gap-2 self-start flex-wrap">
          {isCompany && depots.length > 0 && (
            <select
              value={depotFilter ?? ''}
              onChange={(e) => setDepotFilter(e.target.value || null)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            >
              <option value="">{t('depot.timeTracking.allDepots')}</option>
              {depots.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          )}
          <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
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
      </div>

      {/* Company overview — KPI summary across the whole company. */}
      {isCompany && !loading && workers.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px bg-gray-100 border-b border-gray-100">
          <Kpi icon={Wrench} tone="amber" label={t('depot.timeTracking.repairTime')} value={fmtMin(totals.repair_min)} />
          <Kpi icon={Layers} tone="indigo" label={t('depot.timeTracking.sortTime')} value={fmtMin(totals.sorting_min)} />
          <Kpi icon={Package} tone="emerald" label={t('depot.timeTracking.repairedPallets')} value={totals.repaired} />
          <Kpi icon={Layers} tone="sky" label={t('depot.timeTracking.sortedPallets')} value={totals.sorted} />
          <Kpi icon={Recycle} tone="rose" label={t('depot.timeTracking.scrapped')} value={totals.scrapped} />
          <Kpi icon={Users} tone="slate" label={t('depot.timeTracking.activeWorkers')} value={workers.length} />
        </div>
      )}

      {loading ? (
        <div className="py-10 flex items-center justify-center text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : workers.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">{t('depot.timeTracking.noData')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
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
                const isOpen = expanded === w.worker_id;
                return (
                  <FragmentRow
                    key={w.worker_id}
                    w={w}
                    sortPct={sortPct}
                    isOpen={isOpen}
                    expandable={isCompany}
                    onToggle={() => setExpanded(isOpen ? null : w.worker_id)}
                    t={t}
                  />
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

function FragmentRow({
  w, sortPct, isOpen, expandable, onToggle, t,
}: {
  w: WorkerAgg;
  sortPct: number;
  isOpen: boolean;
  expandable: boolean;
  onToggle: () => void;
  t: (k: string) => string;
}) {
  return (
    <>
      <tr
        className={`border-b border-gray-50 last:border-0 ${expandable ? 'cursor-pointer hover:bg-gray-50/60' : ''}`}
        onClick={expandable ? onToggle : undefined}
      >
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            {expandable && (
              isOpen ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
            )}
            <div>
              <div className="font-medium text-gray-900">{w.full_name || '-'}</div>
              <div className="mt-1 h-1.5 w-28 bg-amber-100 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${sortPct}%` }} />
              </div>
              {w.leave_days > 0 && (
                <span className="text-[10px] text-slate-400">
                  {w.leave_days} {t('depot.timeTracking.onLeave')}
                </span>
              )}
            </div>
          </div>
        </td>
        <td className="px-3 py-2.5 text-right font-semibold text-amber-700">{fmtMin(w.repair_min)}</td>
        <td className="px-3 py-2.5 text-right font-semibold text-indigo-700">{fmtMin(w.sorting_min)}</td>
        <td className="px-3 py-2.5 text-right text-gray-700">{w.repaired_pallets}</td>
        <td className="px-3 py-2.5 text-right text-gray-700">{w.sorted_pallets}</td>
        <td className="px-3 py-2.5 text-right text-rose-600">{w.scrapped_pallets || ''}</td>
      </tr>
      {expandable && isOpen && (
        <tr className="bg-slate-50/70">
          <td colSpan={6} className="px-4 py-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1 font-medium">
              {t('depot.timeTracking.details')}
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400">
                  <th className="py-1 font-medium">{t('depot.timeTracking.date')}</th>
                  <th className="py-1 font-medium text-right">{t('depot.timeTracking.repairTime')}</th>
                  <th className="py-1 font-medium text-right">{t('depot.timeTracking.sortTime')}</th>
                  <th className="py-1 font-medium text-right">{t('depot.timeTracking.repairedPallets')}</th>
                  <th className="py-1 font-medium text-right">{t('depot.timeTracking.sortedPallets')}</th>
                  <th className="py-1 font-medium text-right">{t('depot.timeTracking.scrapped')}</th>
                </tr>
              </thead>
              <tbody>
                {w.days.map((d) => (
                  <tr key={d.work_date} className="border-t border-slate-100">
                    <td className="py-1 text-slate-600">
                      {new Date(d.work_date).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' })}
                      {d.on_leave && <span className="ml-1.5 text-[10px] text-amber-600">({t('depot.timeTracking.onLeave')})</span>}
                    </td>
                    <td className="py-1 text-right text-amber-700">{fmtMin(d.repair_min)}</td>
                    <td className="py-1 text-right text-indigo-700">{fmtMin(d.sorting_min)}</td>
                    <td className="py-1 text-right text-slate-600">{d.repaired_pallets || ''}</td>
                    <td className="py-1 text-right text-slate-600">{d.sorted_pallets || ''}</td>
                    <td className="py-1 text-right text-rose-600">{d.scrapped_pallets || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}

function Kpi({
  icon: Icon, tone, label, value,
}: {
  icon: typeof Wrench;
  tone: 'amber' | 'indigo' | 'emerald' | 'sky' | 'rose' | 'slate';
  label: string;
  value: string | number;
}) {
  const toneMap: Record<string, string> = {
    amber: 'text-amber-600',
    indigo: 'text-indigo-600',
    emerald: 'text-emerald-600',
    sky: 'text-sky-600',
    rose: 'text-rose-600',
    slate: 'text-slate-600',
  };
  return (
    <div className="bg-white px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-gray-400 font-medium">
        <Icon className={`w-3 h-3 ${toneMap[tone]}`} />
        <span className="truncate">{label}</span>
      </div>
      <div className={`text-lg font-bold mt-0.5 ${toneMap[tone]}`}>{value}</div>
    </div>
  );
}
