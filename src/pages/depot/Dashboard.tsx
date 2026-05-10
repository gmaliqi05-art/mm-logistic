import { useState, useEffect } from 'react';
import {
  Package,
  ArrowUpCircle,
  ArrowDownCircle,
  Wrench,
  AlertTriangle,
  X,
  ArrowRight,
  Loader2,
  TrendingDown,
  MessageSquare,
  Layers,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import DeliveryReviewPanel from '../../components/delivery/DeliveryReviewPanel';
import type { StockMovement } from '../../types';

interface DashboardStats {
  totalStock: number;
  entryToday: number;
  exitToday: number;
  pendingRepairs: number;
}

interface LowStockItem {
  id: string;
  categoryName: string;
  quantity: number;
  condition: string;
}

export default function DepotDashboard() {
  const { profile, refreshProfile } = useAuth();
  const { t } = useTranslation();
  const [stats, setStats] = useState<DashboardStats>({ totalStock: 0, entryToday: 0, exitToday: 0, pendingRepairs: 0 });
  const [recentMovements, setRecentMovements] = useState<StockMovement[]>([]);
  const [lowStockItems, setLowStockItems] = useState<LowStockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const movementConfig: Record<string, { label: string; className: string; icon: typeof ArrowUpCircle }> = {
    entry: { label: t('depot.stock.entry'), className: 'bg-green-100 text-green-700', icon: ArrowUpCircle },
    exit: { label: t('depot.stock.exit'), className: 'bg-red-100 text-red-700', icon: ArrowDownCircle },
    repair: { label: t('depot.stock.repair'), className: 'bg-amber-100 text-amber-700', icon: Wrench },
  };

  useEffect(() => {
    if (profile?.depot_id && profile?.company_id) {
      fetchData();
    } else if (profile && !profile.depot_id) {
      refreshProfile().then(() => {
        if (!profile.depot_id) {
          setLoading(false);
          setError('Nuk jeni caktuar ne asnje depo. Kontaktoni administratorin e kompanise.');
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

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const [stockRes, entryRes, exitRes, repairRes, movementsRes, lowStockRes] = await Promise.all([
        supabase
          .from('stock')
          .select('quantity')
          .eq('depot_id', depotId)
          .eq('company_id', companyId),
        supabase
          .from('stock_movements')
          .select('quantity')
          .eq('depot_id', depotId)
          .eq('company_id', companyId)
          .eq('movement_type', 'entry')
          .gte('created_at', todayStart.toISOString()),
        supabase
          .from('stock_movements')
          .select('quantity')
          .eq('depot_id', depotId)
          .eq('company_id', companyId)
          .eq('movement_type', 'exit')
          .gte('created_at', todayStart.toISOString()),
        supabase
          .from('stock')
          .select('quantity')
          .eq('depot_id', depotId)
          .eq('company_id', companyId)
          .eq('condition', 'damaged'),
        supabase
          .from('stock_movements')
          .select('*, category:product_categories(id, name), performer:profiles!stock_movements_performed_by_fkey(full_name)')
          .eq('depot_id', depotId)
          .eq('company_id', companyId)
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from('stock')
          .select('id, quantity, condition, category:product_categories(id, name)')
          .eq('depot_id', depotId)
          .eq('company_id', companyId)
          .lt('quantity', 10)
          .order('quantity', { ascending: true })
          .limit(5),
      ]);

      if (stockRes.error) throw stockRes.error;
      if (entryRes.error) throw entryRes.error;
      if (exitRes.error) throw exitRes.error;
      if (repairRes.error) throw repairRes.error;
      if (movementsRes.error) throw movementsRes.error;
      if (lowStockRes.error) throw lowStockRes.error;

      const totalStock = (stockRes.data ?? []).reduce((sum, s) => sum + (s.quantity || 0), 0);
      const entryToday = (entryRes.data ?? []).reduce((sum, s) => sum + (s.quantity || 0), 0);
      const exitToday = (exitRes.data ?? []).reduce((sum, s) => sum + (s.quantity || 0), 0);
      const pendingRepairs = (repairRes.data ?? []).reduce((sum, s) => sum + (s.quantity || 0), 0);

      setStats({ totalStock, entryToday, exitToday, pendingRepairs });
      setRecentMovements(movementsRes.data ?? []);
      setLowStockItems(
        (lowStockRes.data ?? []).map((s: any) => ({
          id: s.id,
          categoryName: s.category?.name ?? '-',
          quantity: s.quantity,
          condition: s.condition,
        }))
      );
    } catch (err: any) {
      setError(err.message || t('common.errorLoading'));
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-10 h-10 animate-spin text-teal-600" />
      </div>
    );
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

      {/* Quick Actions - Mobile */}
      <div className="grid grid-cols-5 gap-2 lg:hidden">
        <Link
          to="/depot/sorting"
          className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-gradient-to-br from-teal-600 to-emerald-600 shadow-md ring-2 ring-teal-300 active:opacity-90 transition-opacity"
        >
          <div className="p-2 bg-white/20 rounded-lg">
            <Layers className="w-5 h-5 text-white" />
          </div>
          <span className="text-[10px] font-bold text-white text-center leading-tight">Sortire</span>
        </Link>
        <Link
          to="/depot/repair-workers"
          className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-amber-50 active:bg-amber-100 transition-colors"
        >
          <div className="p-2 bg-amber-500 rounded-lg">
            <Wrench className="w-5 h-5 text-white" />
          </div>
          <span className="text-[10px] font-medium text-amber-700 text-center leading-tight">{t('nav.repairWorkers')}</span>
        </Link>
        <Link
          to="/depot/receiving"
          className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-teal-50 active:bg-teal-100 transition-colors"
        >
          <div className="p-2 bg-teal-500 rounded-lg">
            <ArrowUpCircle className="w-5 h-5 text-white" />
          </div>
          <span className="text-[10px] font-medium text-teal-700 text-center leading-tight">{t('depot.dashboard.registerReceiving')}</span>
        </Link>
        <Link
          to="/depot/stock"
          className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-emerald-50 active:bg-emerald-100 transition-colors"
        >
          <div className="p-2 bg-emerald-500 rounded-lg">
            <Package className="w-5 h-5 text-white" />
          </div>
          <span className="text-[10px] font-medium text-emerald-700 text-center leading-tight">{t('nav.stock')}</span>
        </Link>
        <Link
          to="/depot/chat"
          className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-cyan-50 active:bg-cyan-100 transition-colors"
        >
          <div className="p-2 bg-cyan-500 rounded-lg">
            <MessageSquare className="w-5 h-5 text-white" />
          </div>
          <span className="text-[10px] font-medium text-cyan-700 text-center leading-tight">{t('nav.chat')}</span>
        </Link>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label={t('depot.dashboard.totalStock')} value={stats.totalStock} icon={Package} color="bg-teal-500" />
        <StatCard label={t('depot.dashboard.entryToday')} value={stats.entryToday} icon={ArrowUpCircle} color="bg-emerald-500" />
        <StatCard label={t('depot.dashboard.exitToday')} value={stats.exitToday} icon={ArrowDownCircle} color="bg-cyan-500" />
        <Link to="/depot/repairs" className="block">
          <StatCard label={t('depot.dashboard.pendingRepairs')} value={stats.pendingRepairs} icon={Wrench} color="bg-amber-500" />
        </Link>
      </div>

      {/* Low Stock Alert Banner */}
      {lowStockItems.length > 0 && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-3.5 lg:hidden">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-4 h-4 text-red-500" />
            <span className="text-xs font-semibold text-red-700">{t('depot.dashboard.lowStock')}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {lowStockItems.map((item) => (
              <span key={item.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white text-xs font-medium text-red-700 border border-red-200">
                {item.categoryName}
                <span className="font-bold">{item.quantity}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Recent Movements */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="px-4 py-3.5 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900 text-sm">{t('depot.dashboard.recentMovements')}</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {recentMovements.length === 0 ? (
              <div className="p-10 text-center">
                <Package className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                <p className="text-gray-400 text-xs">{t('depot.dashboard.noMovements')}</p>
              </div>
            ) : (
              recentMovements.map((m) => {
                const cfg = movementConfig[m.movement_type];
                const Icon = cfg?.icon ?? Package;
                return (
                  <div key={m.id} className="px-4 py-3 hover:bg-gray-50 active:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className={`p-1.5 rounded-lg ${cfg?.className ?? 'bg-gray-100'}`}>
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${cfg?.className ?? 'bg-gray-100 text-gray-700'}`}>
                              {cfg?.label ?? m.movement_type}
                            </span>
                            <span className="text-sm font-medium text-gray-900">{m.quantity} {t('common.pieces')}</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5 truncate">
                            {(m.category as any)?.name ?? '-'} &middot; {(m.performer as any)?.full_name ?? '-'}
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

        {/* Sidebar */}
        <div className="space-y-5">
          {/* Low Stock - Desktop */}
          <div className="hidden lg:block bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="px-4 py-3.5 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-red-500" />
                <h2 className="font-semibold text-gray-900 text-sm">{t('depot.dashboard.lowStock')}</h2>
              </div>
            </div>
            <div className="divide-y divide-gray-50">
              {lowStockItems.length === 0 ? (
                <div className="p-8 text-center">
                  <Package className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                  <p className="text-xs text-gray-400">{t('depot.dashboard.noLowStock')}</p>
                </div>
              ) : (
                lowStockItems.map((item) => (
                  <div key={item.id} className="px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{item.categoryName}</p>
                      <p className="text-xs text-gray-500 capitalize">{item.condition}</p>
                    </div>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">
                      {item.quantity}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Quick Actions - Desktop */}
          <div className="hidden lg:block bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="px-4 py-3.5 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900 text-sm">{t('depot.dashboard.quickActions')}</h2>
            </div>
            <div className="p-4 space-y-2">
              <Link
                to="/depot/sorting"
                className="flex items-center justify-between p-3.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 shadow-md ring-2 ring-teal-200 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-lg">
                    <Layers className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-sm font-bold text-white">Sortire (Selektimi)</span>
                </div>
                <ArrowRight className="w-4 h-4 text-white/80 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                to="/depot/repair-workers"
                className="flex items-center justify-between p-3.5 bg-amber-50 rounded-xl hover:bg-amber-100 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-500 rounded-lg">
                    <Wrench className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-sm font-medium text-amber-900">{t('nav.repairWorkers')}</span>
                </div>
                <ArrowRight className="w-4 h-4 text-amber-400 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                to="/depot/receiving"
                className="flex items-center justify-between p-3.5 bg-teal-50 rounded-xl hover:bg-teal-100 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-teal-500 rounded-lg">
                    <ArrowUpCircle className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-sm font-medium text-teal-900">{t('depot.dashboard.registerReceiving')}</span>
                </div>
                <ArrowRight className="w-4 h-4 text-teal-400 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                to="/depot/receiving"
                className="flex items-center justify-between p-3.5 bg-emerald-50 rounded-xl hover:bg-emerald-100 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-500 rounded-lg">
                    <ArrowDownCircle className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-sm font-medium text-emerald-900">{t('depot.dashboard.registerShipping')}</span>
                </div>
                <ArrowRight className="w-4 h-4 text-emerald-400 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                to="/depot/chat"
                className="flex items-center justify-between p-3.5 bg-cyan-50 rounded-xl hover:bg-cyan-100 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-cyan-500 rounded-lg">
                    <MessageSquare className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-sm font-medium text-cyan-900">{t('nav.chat')}</span>
                </div>
                <ArrowRight className="w-4 h-4 text-cyan-400 group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: number; icon: typeof Package; color: string;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3.5 lg:p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] lg:text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
          <p className="text-xl lg:text-3xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
        <div className={`${color} p-2 lg:p-2.5 rounded-xl`}>
          <Icon className="w-4 h-4 lg:w-5 lg:h-5 text-white" />
        </div>
      </div>
    </div>
  );
}
