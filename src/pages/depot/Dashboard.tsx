import { useState, useEffect, useMemo } from 'react';
import {
  Package,
  ArrowUpCircle,
  ArrowDownCircle,
  Wrench,
  AlertTriangle,
  X,
  ArrowRight,
  TrendingDown,
  MessageSquare,
  Layers,
  BarChart3,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { PageSkeleton } from '../../components/ui/Skeleton';
import { useTranslation } from '../../i18n';
import DeliveryReviewPanel from '../../components/delivery/DeliveryReviewPanel';
import ReparatureDashboard from './ReparatureDashboard';
import WorkerTimeReport from '../../components/depot/WorkerTimeReport';
import { isDamageLike } from '../../utils/epalClassification';
import type { StockCondition } from '../../types';

interface StockValueRow {
  category_id: string;
  category_name: string | null;
  category_product_id: string | null;
  product_name: string | null;
  condition: string;
  quantity: number;
}

interface FlowRow {
  flow_date: string;
  movement_type: string;
  quantity: number;
}

interface RecentMovement {
  id: string;
  movement_type: string;
  quantity: number;
  created_at: string;
  category: { name: string } | null;
  product: { name: string } | null;
  performer: { full_name: string } | null;
}

interface PendingSortingBatch {
  id: string;
  category_id: string;
  total_received: number;
  created_at: string;
  reference_number_snapshot: string;
  category: { name: string } | null;
}

function isoDaysBack(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().substring(0, 10);
}

function DepoistDashboard() {
  const { profile, refreshProfile } = useAuth();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stockRows, setStockRows] = useState<StockValueRow[]>([]);
  const [flowRows, setFlowRows] = useState<FlowRow[]>([]);
  const [recent, setRecent] = useState<RecentMovement[]>([]);
  const [pendingSorting, setPendingSorting] = useState<PendingSortingBatch[]>([]);

  useEffect(() => {
    if (profile?.depot_id && profile?.company_id) {
      void fetchData();
    } else if (profile && !profile.depot_id) {
      refreshProfile().then(() => {
        if (!profile.depot_id) {
          setLoading(false);
          setError(t('depot.dashboard.noDepotAssigned') || 'Nuk jeni caktuar ne asnje depo. Kontaktoni administratorin e kompanise.');
        }
      });
    }
  }, [profile?.depot_id, profile?.company_id]);

  async function fetchData() {
    try {
      setLoading(true);
      setError(null);
      const depotId = profile!.depot_id!;
      const companyId = profile!.company_id!;
      const since = isoDaysBack(6);

      const [stockRes, flowRes, recentRes, sortingRes] = await Promise.all([
        supabase
          .from('v_depot_stock_value')
          .select('category_id, category_name, category_product_id, product_name, condition, quantity')
          .eq('depot_id', depotId)
          .eq('company_id', companyId)
          .gt('quantity', 0),
        supabase
          .from('v_depot_daily_flow')
          .select('flow_date, movement_type, quantity')
          .eq('depot_id', depotId)
          .eq('company_id', companyId)
          .gte('flow_date', since),
        supabase
          .from('stock_movements')
          .select('id, movement_type, quantity, created_at, category:product_categories(name), product:category_products(name), performer:profiles!stock_movements_performed_by_fkey(full_name)')
          .eq('depot_id', depotId)
          .eq('company_id', companyId)
          .order('created_at', { ascending: false })
          .limit(8),
        supabase
          .from('pallet_sorting_batches')
          .select('id, category_id, total_received, created_at, reference_number_snapshot, category:product_categories(name)')
          .eq('depot_id', depotId)
          .eq('company_id', companyId)
          .eq('status', 'in_progress')
          .order('created_at', { ascending: false }),
      ]);

      if (stockRes.error) throw stockRes.error;
      if (flowRes.error) throw flowRes.error;
      if (recentRes.error) throw recentRes.error;

      setStockRows((stockRes.data ?? []) as StockValueRow[]);
      setFlowRows((flowRes.data ?? []) as FlowRow[]);
      setRecent((recentRes.data ?? []) as unknown as RecentMovement[]);
      setPendingSorting((sortingRes.data ?? []) as unknown as PendingSortingBatch[]);
    } catch (err) {
      setError((err as Error).message || t('common.errorLoading'));
    } finally {
      setLoading(false);
    }
  }

  const totals = useMemo(() => {
    let total = 0;
    let good = 0;
    let damaged = 0;
    let repaired = 0;
    let sorting = 0;
    for (const r of stockRows) {
      total += r.quantity;
      // "Te mira" covers every condition that is NOT damaged or repaired —
      // good stock, post-sort buckets (ready_a/b/c), and the sorting work
      // queue. Otherwise rows in ready_a/b/c/sorting would silently vanish
      // from both the Te mira and the Defekt cards and the operator would
      // see Te mira + Defekt < Stoku total.
      if (isDamageLike(r.condition as StockCondition)) {
        damaged += r.quantity;
      } else if (r.condition === 'repaired') {
        repaired += r.quantity;
      } else {
        good += r.quantity;
        if (r.condition === 'sorting' || r.condition === 'sorting_pending') {
          sorting += r.quantity;
        }
      }
    }
    return { total, good, damaged, repaired, sorting };
  }, [stockRows]);

  const todayFlow = useMemo(() => {
    const today = new Date().toISOString().substring(0, 10);
    let entry = 0;
    let exit = 0;
    for (const r of flowRows) {
      if (r.flow_date.substring(0, 10) !== today) continue;
      if (r.movement_type === 'entry') entry += r.quantity;
      else if (r.movement_type === 'exit') exit += r.quantity;
    }
    return { entry, exit };
  }, [flowRows]);

  const dailyChart = useMemo(() => {
    const map = new Map<string, { entry: number; exit: number }>();
    for (let i = 6; i >= 0; i--) {
      map.set(isoDaysBack(i), { entry: 0, exit: 0 });
    }
    for (const r of flowRows) {
      const b = map.get(r.flow_date.substring(0, 10));
      if (!b) continue;
      if (r.movement_type === 'entry') b.entry += r.quantity;
      else if (r.movement_type === 'exit') b.exit += r.quantity;
    }
    return Array.from(map.entries()).map(([date, v]) => ({ date, ...v }));
  }, [flowRows]);

  const maxBar = Math.max(1, ...dailyChart.map((d) => Math.max(d.entry, d.exit)));

  const topCategories = useMemo(() => {
    const map = new Map<string, { name: string; quantity: number }>();
    for (const r of stockRows) {
      if (r.condition === 'damaged' || r.condition === 'sorting' || r.condition === 'sorting_pending') continue;
      const key = r.category_id ?? 'unknown';
      const cur = map.get(key) ?? { name: r.category_name ?? 'Pa kategori', quantity: 0 };
      cur.quantity += r.quantity;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.quantity - a.quantity).slice(0, 5);
  }, [stockRows]);

  const movementConfig: Record<string, { label: string; className: string; icon: typeof ArrowUpCircle }> = {
    entry: { label: t('depot.stock.entry'), className: 'bg-emerald-100 text-emerald-700', icon: ArrowUpCircle },
    exit: { label: t('depot.stock.exit'), className: 'bg-rose-100 text-rose-700', icon: ArrowDownCircle },
    repair: { label: t('depot.stock.repair'), className: 'bg-amber-100 text-amber-700', icon: Wrench },
    scrap: { label: 'Scrap', className: 'bg-slate-100 text-slate-700', icon: Package },
    sort_in: { label: 'Sortim', className: 'bg-teal-100 text-teal-700', icon: Layers },
  };

  if (loading) {
    return <PageSkeleton rows={6} cols={4} />;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold text-gray-900">{t('depot.dashboard.title')}</h1>
        <p className="text-gray-500 text-sm mt-0.5">{t('depot.dashboard.subtitle')}</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <p className="text-red-700 text-sm flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <DeliveryReviewPanel role="depot_worker" />

      {pendingSorting.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-amber-600" />
            <h3 className="font-semibold text-amber-900 text-sm">Sortim ne pritje ({pendingSorting.length})</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {pendingSorting.map((b) => (
              <Link
                key={b.id}
                to={`/depot/sorting?batch=${b.id}`}
                className="flex items-center gap-3 p-3 bg-white rounded-lg border border-amber-100 hover:border-teal-300 hover:shadow-sm transition-all"
              >
                <div className="p-2 bg-teal-100 rounded-lg flex-shrink-0">
                  <Layers className="w-4 h-4 text-teal-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{(b.category as any)?.name ?? 'Sortim'}</p>
                  <p className="text-xs text-gray-500">
                    {b.total_received} cope
                    {b.reference_number_snapshot ? ` · ${b.reference_number_snapshot}` : ''}
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 lg:hidden">
        <Link to="/depot/sorting" className="relative flex flex-col items-center gap-1.5 p-3 rounded-xl bg-gradient-to-br from-teal-600 to-emerald-600 shadow-md ring-2 ring-teal-300 active:opacity-90">
          {pendingSorting.length > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-amber-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">{pendingSorting.length}</span>
          )}
          <div className="p-2 bg-white/20 rounded-lg">
            <Layers className="w-5 h-5 text-white" />
          </div>
          <span className="text-[10px] font-bold text-white text-center leading-tight">Sortire</span>
        </Link>
        <Link to="/depot/receiving" className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-teal-50 active:bg-teal-100">
          <div className="p-2 bg-teal-500 rounded-lg">
            <ArrowUpCircle className="w-5 h-5 text-white" />
          </div>
          <span className="text-[10px] font-medium text-teal-700 text-center leading-tight">{t('depot.dashboard.registerReceiving')}</span>
        </Link>
        <Link to="/depot/outgoing" className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-rose-50 active:bg-rose-100">
          <div className="p-2 bg-rose-500 rounded-lg">
            <ArrowDownCircle className="w-5 h-5 text-white" />
          </div>
          <span className="text-[10px] font-medium text-rose-700 text-center leading-tight">{t('depot.dashboard.registerOutgoing') || 'Dalje'}</span>
        </Link>
        <Link to="/depot/repair-workers" className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-amber-50 active:bg-amber-100">
          <div className="p-2 bg-amber-500 rounded-lg">
            <Wrench className="w-5 h-5 text-white" />
          </div>
          <span className="text-[10px] font-medium text-amber-700 text-center leading-tight">{t('nav.repairWorkers')}</span>
        </Link>
        <Link to="/depot/stock" className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-emerald-50 active:bg-emerald-100">
          <div className="p-2 bg-emerald-500 rounded-lg">
            <Package className="w-5 h-5 text-white" />
          </div>
          <span className="text-[10px] font-medium text-emerald-700 text-center leading-tight">{t('nav.stock')}</span>
        </Link>
        <Link to="/depot/reports" className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-cyan-50 active:bg-cyan-100">
          <div className="p-2 bg-cyan-500 rounded-lg">
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          <span className="text-[10px] font-medium text-cyan-700 text-center leading-tight">Raporte</span>
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard label="Stoku total" value={totals.total} icon={Package} color="bg-teal-500" />
        <StatCard label="Te mira" value={totals.good} icon={Package} color="bg-emerald-500" />
        <StatCard label="Defekt" value={totals.damaged} icon={Wrench} color="bg-rose-500" />
        <StatCard label="Hyrje sot" value={todayFlow.entry} icon={ArrowUpCircle} color="bg-cyan-500" />
        <StatCard label="Dalje sot" value={todayFlow.exit} icon={ArrowDownCircle} color="bg-slate-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900 text-sm">{t('common.hyrjeVsDaljeDite')}</h2>
            <Link to="/depot/reports" className="text-xs text-teal-700 hover:text-teal-900 inline-flex items-center gap-1">
              Raporte <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="flex items-end gap-2 h-36">
            {dailyChart.map((d) => (
              <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                <div className="flex items-end gap-0.5 h-28 w-full justify-center">
                  <div className="w-3 bg-emerald-500 rounded-t transition-all" style={{ height: `${(d.entry / maxBar) * 100}%` }} title={`Hyrje: ${d.entry}`} />
                  <div className="w-3 bg-rose-500 rounded-t transition-all" style={{ height: `${(d.exit / maxBar) * 100}%` }} title={`Dalje: ${d.exit}`} />
                </div>
                <span className="text-[10px] text-slate-500">{d.date.substring(5)}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 mt-2 text-[11px] text-slate-600">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />{t('common.hyrje')}</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-rose-500" />{t('common.dalje')}</span>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900 text-sm">{t('common.kategoriteKryesore')}</h2>
            <Link to="/depot/stock" className="text-xs text-teal-700 hover:text-teal-900 inline-flex items-center gap-1">{t('common.stoku')}<ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          {topCategories.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">{t('common.asnjeStokIRegjistruar')}</div>
          ) : (
            <ul className="space-y-2">
              {topCategories.map((c) => (
                <li key={c.name} className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{c.name}</p>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-teal-100 text-teal-700">
                    {c.quantity.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <WorkerTimeReport companyId={profile?.company_id ?? null} depotId={profile?.depot_id ?? null} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="px-4 py-3.5 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 text-sm">{t('depot.dashboard.recentMovements')}</h2>
            <Link to="/depot/reports" className="text-xs text-teal-700 hover:text-teal-900">{t('common.all')}</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {recent.length === 0 ? (
              <div className="p-10 text-center">
                <Package className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                <p className="text-gray-400 text-xs">{t('depot.dashboard.noMovements')}</p>
              </div>
            ) : (
              recent.map((m) => {
                const cfg = movementConfig[m.movement_type] ?? { label: m.movement_type, className: 'bg-gray-100 text-gray-700', icon: Package };
                const Icon = cfg.icon;
                return (
                  <div key={m.id} className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className={`p-1.5 rounded-lg ${cfg.className}`}>
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${cfg.className}`}>
                              {cfg.label}
                            </span>
                            <span className="text-sm font-medium text-gray-900">{m.quantity} {t('common.pieces')}</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5 truncate">
                            {m.product?.name ? `${m.product.name}${m.category?.name ? ` (${m.category.name})` : ''}` : m.category?.name ?? '-'} · {m.performer?.full_name ?? '-'}
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] text-gray-400 flex-shrink-0 ml-2">
                        {new Date(m.created_at).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' })}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="space-y-5">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingDown className="w-4 h-4 text-rose-500" />
              <h2 className="font-semibold text-gray-900 text-sm">Ne proces</h2>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center">
              <MiniStat label="Defekt" value={totals.damaged} tone="rose" />
              <MiniStat label="Sortim" value={totals.sorting} tone="teal" />
            </div>
          </div>

          <div className="hidden lg:block bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="px-4 py-3.5 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900 text-sm">{t('depot.dashboard.quickActions')}</h2>
            </div>
            <div className="p-4 space-y-2">
              <Link to="/depot/sorting" className="flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 shadow-md ring-2 ring-teal-200 transition-all group">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-lg"><Layers className="w-4 h-4 text-white" /></div>
                  <span className="text-sm font-bold text-white">Sortire (Selektimi)</span>
                </div>
                <ArrowRight className="w-4 h-4 text-white/80 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link to="/depot/outgoing" className="flex items-center justify-between p-3 bg-rose-50 rounded-xl hover:bg-rose-100 transition-colors group">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-rose-500 rounded-lg"><ArrowDownCircle className="w-4 h-4 text-white" /></div>
                  <span className="text-sm font-medium text-rose-900">{t('depot.dashboard.registerOutgoing') || 'Regjistro dalje'}</span>
                </div>
                <ArrowRight className="w-4 h-4 text-rose-400 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link to="/depot/repair-workers" className="flex items-center justify-between p-3 bg-amber-50 rounded-xl hover:bg-amber-100 transition-colors group">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-500 rounded-lg"><Wrench className="w-4 h-4 text-white" /></div>
                  <span className="text-sm font-medium text-amber-900">{t('nav.repairWorkers')}</span>
                </div>
                <ArrowRight className="w-4 h-4 text-amber-400 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link to="/depot/reports" className="flex items-center justify-between p-3 bg-cyan-50 rounded-xl hover:bg-cyan-100 transition-colors group">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-cyan-500 rounded-lg"><BarChart3 className="w-4 h-4 text-white" /></div>
                  <span className="text-sm font-medium text-cyan-900">Raporte</span>
                </div>
                <ArrowRight className="w-4 h-4 text-cyan-400 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link to="/depot/chat" className="flex items-center justify-between p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors group">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-slate-500 rounded-lg"><MessageSquare className="w-4 h-4 text-white" /></div>
                  <span className="text-sm font-medium text-slate-900">{t('nav.chat')}</span>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DepotDashboard() {
  const { profile } = useAuth();
  // Reparature workers see a focused "my work" dashboard — they aren't
  // operators of the depot, they're recipients of work attribution.
  if (profile?.role === 'depot_worker' && profile.worker_category === 'reparature') {
    return <ReparatureDashboard />;
  }
  return <DepoistDashboard />;
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  isText,
}: {
  label: string;
  value: number | string;
  icon: typeof Package;
  color: string;
  isText?: boolean;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3.5 lg:p-4">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-[10px] lg:text-xs font-medium text-gray-500 uppercase tracking-wide truncate">{label}</p>
          <p className={`${isText ? 'text-lg lg:text-xl' : 'text-xl lg:text-2xl'} font-bold text-gray-900 mt-1 truncate`}>
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
        </div>
        <div className={`${color} p-2 rounded-lg flex-shrink-0`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone: 'rose' | 'teal' | 'amber' }) {
  const toneMap: Record<string, string> = {
    rose: 'bg-rose-50 text-rose-700',
    teal: 'bg-teal-50 text-teal-700',
    amber: 'bg-amber-50 text-amber-700',
  };
  return (
    <div className={`rounded-lg p-2 ${toneMap[tone]}`}>
      <div className="text-[10px] uppercase tracking-wide opacity-75">{label}</div>
      <div className="text-lg font-bold">{value.toLocaleString()}</div>
    </div>
  );
}
