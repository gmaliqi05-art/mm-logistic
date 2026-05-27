import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Calendar,
  Users,
  Wrench,
  TrendingUp,
  Trophy,
  Package,
  Tag,
  AlertTriangle,
  X,
  Warehouse,
  ChevronDown,
  ChevronRight,
  Filter,
  Search,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PageSkeleton } from '../../components/ui/Skeleton';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import type { Depot } from '../../types';

type Granularity = 'day' | 'week' | 'month';
type RangePreset = '7d' | '30d' | '90d' | 'year' | 'custom';

interface RepairRow {
  id: string;
  depot_id: string | null;
  worker_id: string | null;
  category_id: string | null;
  category_product_id: string | null;
  product_name: string | null;
  quantity_repaired: number | null;
  quantity_scrapped: number | null;
  quantity_in: number | null;
  logged_at: string;
  worker?: { full_name: string | null; avatar_url: string | null } | null;
  category?: { name: string | null } | null;
}

interface WorkerAgg {
  workerId: string;
  workerName: string;
  avatarUrl: string | null;
  depotId: string | null;
  totalRepaired: number;
  totalScrapped: number;
  totalIn: number;
  entries: number;
  days: Set<string>;
  bestDay: { date: string; qty: number };
  byCategory: Map<string, number>;
  byProduct: Map<string, number>;
  timeSeries: Map<string, number>;
  lastActivity: string;
}

function bucketKey(dateIso: string, g: Granularity): string {
  const d = new Date(dateIso);
  if (g === 'day') return d.toISOString().slice(0, 10);
  if (g === 'month') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  // week -> ISO week key: year-week
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (tmp.getUTCDay() + 6) % 7;
  tmp.setUTCDate(tmp.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 4));
  const diff = (tmp.getTime() - firstThursday.getTime()) / 86400000;
  const week = 1 + Math.round((diff - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${tmp.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function rangeToIso(r: RangePreset, customFrom: string, customTo: string): { from: string; to: string } {
  const now = new Date();
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  if (r === '7d') from.setDate(from.getDate() - 6);
  else if (r === '30d') from.setDate(from.getDate() - 29);
  else if (r === '90d') from.setDate(from.getDate() - 89);
  else if (r === 'year') from.setDate(from.getDate() - 364);
  else if (r === 'custom') {
    const f = customFrom ? new Date(customFrom) : from;
    const t = customTo ? new Date(customTo) : to;
    f.setHours(0, 0, 0, 0);
    t.setHours(23, 59, 59, 999);
    return { from: f.toISOString(), to: t.toISOString() };
  }
  return { from: from.toISOString(), to: to.toISOString() };
}

export default function WorkerRepairStats() {
  const { profile } = useAuth();
  const { t } = useTranslation();

  const [rows, setRows] = useState<RepairRow[]>([]);
  const [depots, setDepots] = useState<Depot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [granularity, setGranularity] = useState<Granularity>('day');
  const [rangePreset, setRangePreset] = useState<RangePreset>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [depotFilter, setDepotFilter] = useState('');
  const [search, setSearch] = useState('');
  const [expandedWorker, setExpandedWorker] = useState<string | null>(null);

  const range = useMemo(() => rangeToIso(rangePreset, customFrom, customTo), [rangePreset, customFrom, customTo]);

  const load = useCallback(async () => {
    if (!profile?.company_id) return;
    try {
      setLoading(true);
      setError(null);
      const [repairsRes, depotsRes] = await Promise.all([
        supabase
          .from('depot_repairs')
          .select(
            'id, depot_id, worker_id, category_id, category_product_id, product_name, quantity_repaired, quantity_scrapped, quantity_in, logged_at, worker:profiles!depot_repairs_worker_id_fkey(full_name, avatar_url), category:product_categories(name)',
          )
          .eq('company_id', profile.company_id)
          // Only rows where actual repair work was logged. Sorting-originated
          // rows (worker_id IS NULL, quantity_repaired = 0) are case openers,
          // not repair-worker contributions — they belong in sorting reports.
          .not('worker_id', 'is', null)
          .gt('quantity_repaired', 0)
          .gte('logged_at', range.from)
          .lte('logged_at', range.to)
          .order('logged_at', { ascending: false })
          .limit(5000),
        supabase.from('depots').select('*').eq('company_id', profile.company_id).order('name'),
      ]);
      if (repairsRes.error) throw repairsRes.error;
      if (depotsRes.error) throw depotsRes.error;
      setRows((repairsRes.data ?? []) as unknown as RepairRow[]);
      setDepots((depotsRes.data ?? []) as Depot[]);
    } catch (err) {
      setError(err.message || 'Failed to load statistics');
    } finally {
      setLoading(false);
    }
  }, [profile?.company_id, range.from, range.to]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!profile?.company_id) return;
    const ch = supabase
      .channel(`worker-stats-${profile.company_id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'depot_repairs', filter: `company_id=eq.${profile.company_id}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [profile?.company_id, load]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (depotFilter && r.depot_id !== depotFilter) return false;
      if (q) {
        const hay = `${r.worker?.full_name ?? ''} ${r.category?.name ?? ''} ${r.product_name ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, depotFilter, search]);

  const workerAggs = useMemo(() => {
    const map = new Map<string, WorkerAgg>();
    const dayMap = new Map<string, Map<string, number>>();

    for (const r of filteredRows) {
      if (!r.worker_id) continue;
      const repaired = r.quantity_repaired ?? 0;
      const scrapped = r.quantity_scrapped ?? 0;
      const incoming = r.quantity_in ?? 0;
      const dayK = new Date(r.logged_at).toISOString().slice(0, 10);
      const bucketK = bucketKey(r.logged_at, granularity);

      let agg = map.get(r.worker_id);
      if (!agg) {
        agg = {
          workerId: r.worker_id,
          workerName: r.worker?.full_name || 'Unknown',
          avatarUrl: r.worker?.avatar_url ?? null,
          depotId: r.depot_id,
          totalRepaired: 0,
          totalScrapped: 0,
          totalIn: 0,
          entries: 0,
          days: new Set(),
          bestDay: { date: dayK, qty: 0 },
          byCategory: new Map(),
          byProduct: new Map(),
          timeSeries: new Map(),
          lastActivity: r.logged_at,
        };
        map.set(r.worker_id, agg);
      }
      agg.totalRepaired += repaired;
      agg.totalScrapped += scrapped;
      agg.totalIn += incoming;
      agg.entries += 1;
      agg.days.add(dayK);
      if (new Date(r.logged_at) > new Date(agg.lastActivity)) agg.lastActivity = r.logged_at;

      const catName = r.category?.name ?? '—';
      agg.byCategory.set(catName, (agg.byCategory.get(catName) ?? 0) + repaired);
      const prodName = (r.product_name ?? '').trim() || '—';
      agg.byProduct.set(prodName, (agg.byProduct.get(prodName) ?? 0) + repaired);
      agg.timeSeries.set(bucketK, (agg.timeSeries.get(bucketK) ?? 0) + repaired);

      let wd = dayMap.get(r.worker_id);
      if (!wd) {
        wd = new Map();
        dayMap.set(r.worker_id, wd);
      }
      wd.set(dayK, (wd.get(dayK) ?? 0) + repaired);
    }

    for (const [wid, wd] of dayMap) {
      const agg = map.get(wid);
      if (!agg) continue;
      let best = { date: '', qty: 0 };
      for (const [k, v] of wd) if (v > best.qty) best = { date: k, qty: v };
      agg.bestDay = best;
    }

    return Array.from(map.values()).sort((a, b) => b.totalRepaired - a.totalRepaired);
  }, [filteredRows, granularity]);

  const totals = useMemo(() => {
    let repaired = 0;
    let scrapped = 0;
    let entries = 0;
    const workers = new Set<string>();
    for (const w of workerAggs) {
      repaired += w.totalRepaired;
      scrapped += w.totalScrapped;
      entries += w.entries;
      workers.add(w.workerId);
    }
    return { repaired, scrapped, entries, workers: workers.size };
  }, [workerAggs]);

  const timeBuckets = useMemo(() => {
    const all = new Set<string>();
    for (const w of workerAggs) for (const k of w.timeSeries.keys()) all.add(k);
    return Array.from(all).sort();
  }, [workerAggs]);

  const maxBucketValue = useMemo(() => {
    let m = 0;
    for (const w of workerAggs) for (const v of w.timeSeries.values()) if (v > m) m = v;
    return m;
  }, [workerAggs]);

  function formatBucket(k: string): string {
    if (granularity === 'day') {
      const d = new Date(k);
      return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
    }
    if (granularity === 'month') {
      const [y, m] = k.split('-');
      return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
    }
    return k.replace('-W', ' W');
  }

  function exportCsv() {
    const headers = ['Worker', 'Depot', 'Total Repaired', 'Total Scrapped', 'Entries', 'Active Days', 'Best Day', 'Best Day Qty', 'Avg/Day', 'Last Activity'];
    const lines = [headers.join(',')];
    for (const w of workerAggs) {
      const depot = depots.find((d) => d.id === w.depotId)?.name ?? '';
      const avg = w.days.size ? (w.totalRepaired / w.days.size).toFixed(1) : '0';
      lines.push(
        [
          `"${w.workerName.replace(/"/g, '""')}"`,
          `"${depot.replace(/"/g, '""')}"`,
          w.totalRepaired,
          w.totalScrapped,
          w.entries,
          w.days.size,
          w.bestDay.date,
          w.bestDay.qty,
          avg,
          new Date(w.lastActivity).toISOString(),
        ].join(','),
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `worker-repair-stats-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return <PageSkeleton rows={8} cols={5} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-teal-600" />
            {t('company.workerRepairStats.title')}
          </h1>
          <p className="text-gray-500 mt-1">{t('company.workerRepairStats.subtitle')}</p>
        </div>
        <button
          onClick={exportCsv}
          disabled={workerAggs.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-teal-700 bg-teal-50 rounded-lg hover:bg-teal-100 transition-colors disabled:opacity-50"
        >
          <BarChart3 className="w-4 h-4" />
          {t('company.workerRepairStats.exportCsv')}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-red-700 text-sm flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('company.workerRepairStats.searchPlaceholder')}
              className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
              {(['day', 'week', 'month'] as Granularity[]).map((g) => (
                <button
                  key={g}
                  onClick={() => setGranularity(g)}
                  className={`px-3 py-2 text-xs font-semibold transition-colors ${
                    granularity === g ? 'bg-teal-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {t(`company.workerRepairStats.granularity.${g}` as const)}
                </button>
              ))}
            </div>
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={rangePreset}
              onChange={(e) => setRangePreset(e.target.value as RangePreset)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="7d">{t('company.workerRepairStats.range.7d')}</option>
              <option value="30d">{t('company.workerRepairStats.range.30d')}</option>
              <option value="90d">{t('company.workerRepairStats.range.90d')}</option>
              <option value="year">{t('company.workerRepairStats.range.year')}</option>
              <option value="custom">{t('company.workerRepairStats.range.custom')}</option>
            </select>
            {rangePreset === 'custom' && (
              <>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </>
            )}
            <select
              value={depotFilter}
              onChange={(e) => setDepotFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="">{t('company.workerRepairStats.allDepots')}</option>
              {depots.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label={t('company.workerRepairStats.kpiWorkers')} value={totals.workers} icon={Users} color="bg-teal-500" />
        <KpiCard label={t('company.workerRepairStats.kpiRepaired')} value={totals.repaired} icon={Wrench} color="bg-emerald-500" />
        <KpiCard label={t('company.workerRepairStats.kpiScrapped')} value={totals.scrapped} icon={Warehouse} color="bg-amber-500" />
        <KpiCard label={t('company.workerRepairStats.kpiEntries')} value={totals.entries} icon={TrendingUp} color="bg-cyan-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden lg:col-span-1">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-gray-900">{t('company.workerRepairStats.leaderboard')}</h3>
          </div>
          <div className="p-3">
            {workerAggs.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">{t('common.noResults')}</p>
            ) : (
              <div className="space-y-2">
                {workerAggs.slice(0, 5).map((w, idx) => {
                  const rankColors = ['bg-amber-100 text-amber-700', 'bg-gray-100 text-gray-700', 'bg-orange-100 text-orange-700'];
                  const rankColor = rankColors[idx] ?? 'bg-teal-50 text-teal-700';
                  const pct = totals.repaired ? (w.totalRepaired / totals.repaired) * 100 : 0;
                  return (
                    <div key={w.workerId} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${rankColor}`}>
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{w.workerName}</p>
                        <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden mt-1">
                          <div
                            className="h-full bg-gradient-to-r from-teal-400 to-emerald-500 rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold text-teal-700">{w.totalRepaired}</p>
                        <p className="text-[10px] text-gray-400">{pct.toFixed(1)}%</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden lg:col-span-2">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-teal-600" />
              <h3 className="text-sm font-semibold text-gray-900">{t('company.workerRepairStats.timeline')}</h3>
            </div>
            <span className="text-[10px] text-gray-400 uppercase tracking-wider">
              {t(`company.workerRepairStats.granularity.${granularity}` as const)}
            </span>
          </div>
          <div className="p-4 overflow-x-auto">
            {timeBuckets.length === 0 || workerAggs.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">{t('common.noResults')}</p>
            ) : (
              <div className="min-w-full">
                <div className="grid gap-1" style={{ gridTemplateColumns: `minmax(120px, 160px) repeat(${timeBuckets.length}, minmax(32px, 1fr))` }}>
                  <div />
                  {timeBuckets.map((b) => (
                    <div key={b} className="text-[9px] text-gray-400 text-center truncate">
                      {formatBucket(b)}
                    </div>
                  ))}
                  {workerAggs.slice(0, 8).map((w) => (
                    <TimelineRow key={w.workerId} worker={w} buckets={timeBuckets} max={maxBucketValue} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
          <Users className="w-4 h-4 text-teal-600" />
          <h3 className="text-sm font-semibold text-gray-900">{t('company.workerRepairStats.workersTable')}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  {t('company.workerRepairStats.worker')}
                </th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  {t('company.repairReports.depot')}
                </th>
                <th className="text-right px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  {t('company.workerRepairStats.totalRepaired')}
                </th>
                <th className="text-right px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  {t('company.workerRepairStats.scrapped')}
                </th>
                <th className="text-right px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  {t('company.workerRepairStats.activeDays')}
                </th>
                <th className="text-right px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  {t('company.workerRepairStats.avgPerDay')}
                </th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  {t('company.workerRepairStats.bestDay')}
                </th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  {t('company.workerRepairStats.lastActivity')}
                </th>
                <th className="w-8 px-2 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {workerAggs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-gray-400">
                    <Users className="w-10 h-10 mx-auto mb-2 text-gray-200" />
                    {t('common.noResults')}
                  </td>
                </tr>
              ) : (
                workerAggs.map((w) => {
                  const isOpen = expandedWorker === w.workerId;
                  const depot = depots.find((d) => d.id === w.depotId)?.name ?? '-';
                  const avg = w.days.size ? (w.totalRepaired / w.days.size).toFixed(1) : '0';
                  return (
                    <>
                      <tr
                        key={w.workerId}
                        onClick={() => setExpandedWorker(isOpen ? null : w.workerId)}
                        className="hover:bg-gray-50 transition-colors cursor-pointer"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-xs font-bold flex-shrink-0 overflow-hidden">
                              {w.avatarUrl ? (
                                <img src={w.avatarUrl} alt={w.workerName} className="w-full h-full object-cover" />
                              ) : (
                                w.workerName.substring(0, 2).toUpperCase()
                              )}
                            </div>
                            <span className="text-sm font-semibold text-gray-900 truncate">{w.workerName}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">{depot}</td>
                        <td className="px-4 py-3 text-sm text-right font-bold text-teal-700">{w.totalRepaired}</td>
                        <td className="px-4 py-3 text-sm text-right text-amber-700">{w.totalScrapped}</td>
                        <td className="px-4 py-3 text-sm text-right text-gray-700">{w.days.size}</td>
                        <td className="px-4 py-3 text-sm text-right text-gray-700">{avg}</td>
                        <td className="px-4 py-3 text-xs text-gray-600">
                          {w.bestDay.date ? (
                            <span className="inline-flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-gray-400" />
                              {new Date(w.bestDay.date).toLocaleDateString()} · <span className="font-semibold text-gray-900">{w.bestDay.qty}</span>
                            </span>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {new Date(w.lastActivity).toLocaleDateString()}
                        </td>
                        <td className="px-2 py-3 text-gray-400">
                          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={9} className="bg-gray-50/50 px-4 py-4">
                            <WorkerDrillDown worker={w} />
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: typeof Users;
  color: string;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-[10px] lg:text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
          <p className="text-2xl lg:text-3xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
        <div className={`${color} p-2 rounded-xl flex-shrink-0`}>
          <Icon className="w-4 h-4 lg:w-5 lg:h-5 text-white" />
        </div>
      </div>
    </div>
  );
}

function TimelineRow({ worker, buckets, max }: { worker: WorkerAgg; buckets: string[]; max: number }) {
  return (
    <>
      <div className="flex items-center gap-2 pr-3 py-1">
        <div className="w-6 h-6 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
          {worker.workerName.substring(0, 2).toUpperCase()}
        </div>
        <span className="text-xs font-medium text-gray-700 truncate">{worker.workerName}</span>
      </div>
      {buckets.map((b) => {
        const v = worker.timeSeries.get(b) ?? 0;
        const h = max ? Math.max(2, (v / max) * 40) : 2;
        return (
          <div key={b} className="flex items-end justify-center h-12 relative group">
            <div
              className={`w-full rounded-t transition-all ${v > 0 ? 'bg-gradient-to-t from-teal-500 to-emerald-400' : 'bg-gray-100'}`}
              style={{ height: `${h}px` }}
              title={`${v}`}
            />
            {v > 0 && (
              <span className="absolute -top-4 text-[9px] font-semibold text-teal-700 opacity-0 group-hover:opacity-100 transition-opacity">
                {v}
              </span>
            )}
          </div>
        );
      })}
    </>
  );
}

function WorkerDrillDown({ worker }: { worker: WorkerAgg }) {
  const { t } = useTranslation();
  const categories = Array.from(worker.byCategory.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const products = Array.from(worker.byProduct.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const maxCat = categories[0]?.[1] ?? 1;
  const maxProd = products[0]?.[1] ?? 1;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="bg-white rounded-lg border border-gray-100 p-3">
        <h4 className="text-xs font-semibold text-gray-700 flex items-center gap-1.5 mb-2">
          <Tag className="w-3.5 h-3.5 text-teal-600" />
          {t('company.repairReports.byCategory')}
        </h4>
        {categories.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-3">{t('common.noResults')}</p>
        ) : (
          <div className="space-y-1.5">
            {categories.map(([name, qty]) => (
              <div key={name}>
                <div className="flex justify-between text-[11px] mb-0.5">
                  <span className="text-gray-700 truncate pr-2">{name}</span>
                  <span className="font-semibold text-teal-700">{qty}</span>
                </div>
                <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-teal-500" style={{ width: `${(qty / maxCat) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="bg-white rounded-lg border border-gray-100 p-3">
        <h4 className="text-xs font-semibold text-gray-700 flex items-center gap-1.5 mb-2">
          <Package className="w-3.5 h-3.5 text-teal-600" />
          {t('company.repairReports.byProduct')}
        </h4>
        {products.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-3">{t('common.noResults')}</p>
        ) : (
          <div className="space-y-1.5">
            {products.map(([name, qty]) => (
              <div key={name}>
                <div className="flex justify-between text-[11px] mb-0.5">
                  <span className="text-gray-700 truncate pr-2">{name}</span>
                  <span className="font-semibold text-emerald-700">{qty}</span>
                </div>
                <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500" style={{ width: `${(qty / maxProd) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
