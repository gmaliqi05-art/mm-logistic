import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Wrench,
  Package,
  Calendar,
  Search,
  Loader2,
  AlertTriangle,
  X,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  FileText,
  TrendingUp,
  Warehouse,
  Filter,
  Tag,
  Users,
  Clock,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { BarChart3 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import type { Depot } from '../../types';

interface ReportEntry {
  category_id?: string | null;
  category_name?: string;
  product_name?: string;
  quantity?: number;
  logged_at?: string;
}

interface WorkerReport {
  id: string;
  company_id: string;
  depot_id: string | null;
  worker_id: string | null;
  report_date: string;
  total_quantity: number;
  entry_count: number;
  details: {
    entries?: ReportEntry[];
    by_category?: Array<{ name: string; quantity: number }>;
    by_product?: Array<{ name: string; quantity: number }>;
    workers?: Array<{
      worker_id: string;
      worker_name: string;
      total_quantity: number;
      entry_count: number;
      by_category?: Array<{ name: string; quantity: number }>;
      entries?: ReportEntry[];
    }>;
  };
  created_at: string;
  sent_to_stock_at: string | null;
  depot?: { name: string } | null;
  worker?: { full_name: string } | null;
}

type DateRange = 'today' | 'week' | 'month' | 'all';

function startOf(range: DateRange): string | null {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (range === 'today') return d.toISOString();
  if (range === 'week') {
    d.setDate(d.getDate() - 7);
    return d.toISOString();
  }
  if (range === 'month') {
    d.setDate(d.getDate() - 30);
    return d.toISOString();
  }
  return null;
}

export default function CompanyRepairReports() {
  const { profile } = useAuth();
  const { t } = useTranslation();

  const [reports, setReports] = useState<WorkerReport[]>([]);
  const [depots, setDepots] = useState<Depot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [range, setRange] = useState<DateRange>('month');
  const [depotFilter, setDepotFilter] = useState<string>('');

  const [detailOpen, setDetailOpen] = useState<WorkerReport | null>(null);

  const load = useCallback(async () => {
    if (!profile?.company_id) return;
    try {
      setLoading(true);
      setError(null);

      const [reportsRes, depotsRes] = await Promise.all([
        supabase
          .from('depot_repair_reports')
          .select(
            'id, company_id, depot_id, worker_id, report_date, total_quantity, entry_count, details, created_at, sent_to_stock_at, depot:depots(name), worker:profiles!depot_repair_reports_worker_id_fkey(full_name)',
          )
          .eq('company_id', profile.company_id)
          .order('report_date', { ascending: false })
          .limit(500),
        supabase
          .from('depots')
          .select('*')
          .eq('company_id', profile.company_id)
          .order('name'),
      ]);

      if (reportsRes.error) throw reportsRes.error;
      if (depotsRes.error) throw depotsRes.error;

      setReports((reportsRes.data ?? []) as unknown as WorkerReport[]);
      setDepots((depotsRes.data ?? []) as Depot[]);
    } catch (err: any) {
      setError(err.message || t('common.errorLoading'));
    } finally {
      setLoading(false);
    }
  }, [profile?.company_id, t]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!profile?.company_id) return;
    const channel = supabase
      .channel(`repair-reports-${profile.company_id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'depot_repair_reports',
          filter: `company_id=eq.${profile.company_id}`,
        },
        () => {
          load();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.company_id, load]);

  const filtered = useMemo(() => {
    const startIso = startOf(range);
    const q = search.trim().toLowerCase();
    return reports.filter((r) => {
      if (startIso && new Date(r.report_date).toISOString() < startIso) return false;
      if (depotFilter && r.depot_id !== depotFilter) return false;
      if (q) {
        const hay = [
          r.report_date,
          r.depot?.name ?? '',
          r.worker?.full_name ?? '',
          ...(r.details?.by_category ?? []).map((c) => c.name),
          ...(r.details?.by_product ?? []).map((p) => p.name),
          ...(r.details?.entries ?? []).map((e) => e.product_name ?? ''),
          ...(r.details?.workers ?? []).flatMap((w) => [
            w.worker_name,
            ...(w.entries ?? []).map((e) => e.product_name ?? ''),
          ]),
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [reports, range, depotFilter, search]);

  const summary = useMemo(() => {
    const todayIso = startOf('today')!;
    const weekIso = startOf('week')!;
    const monthIso = startOf('month')!;
    let today = 0;
    let week = 0;
    let month = 0;
    let total = 0;
    for (const r of reports) {
      const d = new Date(r.report_date).toISOString();
      total += r.total_quantity;
      if (d >= monthIso) month += r.total_quantity;
      if (d >= weekIso) week += r.total_quantity;
      if (d >= todayIso) today += r.total_quantity;
    }
    return { today, week, month, total };
  }, [reports]);

  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filtered) {
      for (const c of r.details?.by_category ?? []) {
        map.set(c.name, (map.get(c.name) ?? 0) + (c.quantity ?? 0));
      }
      for (const w of r.details?.workers ?? []) {
        for (const c of w.by_category ?? []) {
          map.set(c.name, (map.get(c.name) ?? 0) + (c.quantity ?? 0));
        }
      }
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);
  }, [filtered]);

  const productBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filtered) {
      for (const p of r.details?.by_product ?? []) {
        if (p.name) map.set(p.name, (map.get(p.name) ?? 0) + (p.quantity ?? 0));
      }
      for (const w of r.details?.workers ?? []) {
        for (const e of w.entries ?? []) {
          const name = (e.product_name || '').trim();
          if (name) map.set(name, (map.get(name) ?? 0) + (e.quantity ?? 0));
        }
      }
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);
  }, [filtered]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-10 h-10 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Wrench className="w-6 h-6 text-teal-600" />
            {t('company.repairReports.title')}
          </h1>
          <p className="text-gray-500 mt-1">{t('company.repairReports.subtitle')}</p>
        </div>
        <Link
          to="/company/worker-repair-stats"
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-teal-700 bg-teal-50 rounded-lg hover:bg-teal-100 transition-colors"
        >
          <BarChart3 className="w-4 h-4" />
          {t('company.workerRepairStats.title')}
        </Link>
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label={t('company.repairReports.statsToday')}
          value={summary.today}
          icon={Clock}
          color="bg-teal-500"
        />
        <StatCard
          label={t('company.repairReports.statsWeek')}
          value={summary.week}
          icon={TrendingUp}
          color="bg-emerald-500"
        />
        <StatCard
          label={t('company.repairReports.statsMonth')}
          value={summary.month}
          icon={Calendar}
          color="bg-cyan-500"
        />
        <StatCard
          label={t('company.repairReports.statsTotal') || 'Total'}
          value={summary.total}
          icon={Warehouse}
          color="bg-slate-500"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BreakdownCard
          title={t('company.repairReports.byCategory')}
          icon={Tag}
          items={categoryBreakdown}
          emptyLabel={t('common.noResults')}
        />
        <BreakdownCard
          title={t('company.repairReports.byProduct')}
          icon={Package}
          items={productBreakdown}
          emptyLabel={t('common.noResults')}
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('company.repairReports.searchPlaceholder')}
              className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={range}
              onChange={(e) => setRange(e.target.value as DateRange)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="today">{t('company.repairReports.filterToday')}</option>
              <option value="week">{t('company.repairReports.filterWeek')}</option>
              <option value="month">{t('company.repairReports.filterMonth')}</option>
              <option value="all">{t('company.repairReports.filterAll')}</option>
            </select>
            <select
              value={depotFilter}
              onChange={(e) => setDepotFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="">{t('company.repairReports.allDepots')}</option>
              {depots.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {t('common.date')}
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {t('company.repairReports.depot')}
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {t('company.repairReports.worker') || 'Punetori'}
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {t('company.repairReports.entries')}
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {t('common.quantity')}
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {t('common.status')}
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                    <FileText className="w-10 h-10 mx-auto mb-2 text-gray-200" />
                    {t('company.repairReports.empty')}
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-900">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        {new Date(r.report_date).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {r.depot?.name ?? '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <div className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-gray-400" />
                        {r.worker?.full_name ?? getWorkerNames(r)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">
                      {r.entry_count}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-bold text-teal-700">
                      {r.total_quantity}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-700">
                        <CheckCircle2 className="w-3 h-3" />
                        {t('company.repairReports.inStock') || 'Ne stok'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setDetailOpen(r)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-700 bg-teal-50 rounded-lg hover:bg-teal-100 transition-colors"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                        {t('company.repairReports.viewDetails')}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {detailOpen && (
        <ReportDetailModal
          report={detailOpen}
          onClose={() => setDetailOpen(null)}
        />
      )}
    </div>
  );
}

function getWorkerNames(r: WorkerReport): string {
  if (r.details?.workers && r.details.workers.length > 0) {
    return r.details.workers.map((w) => w.worker_name).join(', ');
  }
  return '-';
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: typeof Package;
  color: string;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-[10px] lg:text-xs font-medium text-gray-500 uppercase tracking-wide">
            {label}
          </p>
          <p className="text-2xl lg:text-3xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
        <div className={`${color} p-2 rounded-xl flex-shrink-0`}>
          <Icon className="w-4 h-4 lg:w-5 lg:h-5 text-white" />
        </div>
      </div>
    </div>
  );
}

function BreakdownCard({
  title,
  icon: Icon,
  items,
  emptyLabel,
}: {
  title: string;
  icon: typeof Package;
  items: Array<[string, number]>;
  emptyLabel: string;
}) {
  const max = items.reduce((m, [, v]) => Math.max(m, v), 0) || 1;
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
        <Icon className="w-4 h-4 text-teal-600" />
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      </div>
      <div className="p-5">
        {items.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">{emptyLabel}</p>
        ) : (
          <div className="space-y-2.5">
            {items.map(([name, qty]) => (
              <div key={name}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-gray-700 font-medium truncate pr-2">{name}</span>
                  <span className="font-bold text-teal-700 flex-shrink-0">{qty}</span>
                </div>
                <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-teal-400 to-emerald-500 rounded-full transition-all"
                    style={{ width: `${(qty / max) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ReportDetailModal({
  report,
  onClose,
}: {
  report: WorkerReport;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [expandedWorker, setExpandedWorker] = useState<string | null>(null);

  const workers = report.details?.workers ?? [];
  const entries = report.details?.entries ?? [];
  const byCategory = report.details?.by_category ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-xl">
        <div className="flex items-start justify-between p-5 border-b border-gray-100">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-teal-100">
              <Wrench className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                {t('company.repairReports.detailsTitle')}
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {new Date(report.report_date).toLocaleDateString()} &middot;{' '}
                {report.depot?.name ?? '-'}
                {report.worker?.full_name ? ` · ${report.worker.full_name}` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-teal-50 rounded-lg p-3">
              <p className="text-[10px] uppercase tracking-wide text-teal-700 font-semibold">
                {t('common.quantity')}
              </p>
              <p className="text-2xl font-bold text-teal-800 mt-1">{report.total_quantity}</p>
            </div>
            <div className="bg-emerald-50 rounded-lg p-3">
              <p className="text-[10px] uppercase tracking-wide text-emerald-700 font-semibold">
                {t('company.repairReports.entries')}
              </p>
              <p className="text-2xl font-bold text-emerald-800 mt-1">{report.entry_count}</p>
            </div>
            <div className="bg-cyan-50 rounded-lg p-3">
              <p className="text-[10px] uppercase tracking-wide text-cyan-700 font-semibold">
                {t('common.status')}
              </p>
              <p className="text-sm font-bold text-cyan-800 mt-2">
                <span className="inline-flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  {t('company.repairReports.inStock') || 'Ne stok'}
                </span>
              </p>
            </div>
          </div>

          {byCategory.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {byCategory.map((c) => (
                <span
                  key={c.name}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-gray-50 border border-gray-200"
                >
                  <span className="text-gray-700">{c.name}</span>
                  <span className="font-semibold text-teal-700">{c.quantity}</span>
                </span>
              ))}
            </div>
          )}

          {workers.length > 0 && (
            <div className="space-y-3">
              {workers.map((w) => {
                const open = expandedWorker === w.worker_id;
                const pct = report.total_quantity > 0 ? (w.total_quantity / report.total_quantity) * 100 : 0;
                return (
                  <div
                    key={w.worker_id}
                    className="bg-white rounded-xl border border-gray-100 overflow-hidden"
                  >
                    <button
                      onClick={() => setExpandedWorker(open ? null : w.worker_id)}
                      className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors text-left"
                    >
                      <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0">
                        <Wrench className="w-5 h-5 text-teal-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-gray-900 truncate">{w.worker_name}</p>
                          <span className="text-[10px] font-semibold text-teal-700">{pct.toFixed(0)}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden mt-1.5">
                          <div
                            className="h-full bg-gradient-to-r from-teal-400 to-emerald-500 rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-lg font-bold text-teal-700">{w.total_quantity}</span>
                      {open ? (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                    {open && (
                      <WorkerEntriesTable entries={w.entries ?? []} t={t} />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {workers.length === 0 && entries.length > 0 && (
            <WorkerEntriesTable entries={entries} t={t} />
          )}
        </div>

        <div className="border-t border-gray-100 p-4 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}

function WorkerEntriesTable({ entries, t }: { entries: ReportEntry[]; t: (k: string) => string }) {
  if (entries.length === 0) return null;
  return (
    <div className="border-t border-gray-100 bg-gray-50 p-4">
      <div className="overflow-x-auto bg-white rounded-lg border border-gray-100">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase">
                {t('common.time')}
              </th>
              <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase">
                {t('depot.stock.category')}
              </th>
              <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase">
                {t('depot.repairWorkers.product')}
              </th>
              <th className="text-right px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase">
                {t('common.quantity')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {entries.map((e, i) => (
              <tr key={i}>
                <td className="px-3 py-2 text-xs text-gray-500">
                  {e.logged_at
                    ? new Date(e.logged_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '-'}
                </td>
                <td className="px-3 py-2 text-xs text-gray-700">
                  {e.category_name ?? '-'}
                </td>
                <td className="px-3 py-2 text-xs text-gray-700">
                  {e.product_name || '-'}
                </td>
                <td className="px-3 py-2 text-xs text-right font-semibold text-gray-900">
                  {e.quantity ?? 0}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
