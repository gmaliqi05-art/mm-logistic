import { useState, useEffect, useMemo } from 'react';
import {
  Warehouse,
  Truck,
  Package,
  FileText,
  AlertTriangle,
  ArrowRight,
  ScanLine,
  CheckCircle2,
  Send,
  MapPin,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Wrench,
  BarChart3,
  Users,
  Plus,
  MessageCircle,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import DocumentTypeChooser, { type ScanDocKind } from '../../components/scanner/DocumentTypeChooser';
import ScanDocumentModal from '../../components/accounting/ScanDocumentModal';
import QuickNoteModal from '../../components/delivery/QuickNoteModal';
import { usePendingReviewCounts } from '../../hooks/usePendingReviewCounts';
import { ClipboardList } from 'lucide-react';
import type { DeliveryNote } from '../../types';

interface DriverRow {
  id: string;
  name: string;
  assigned: number;
  inTransit: number;
  deliveredToday: number;
  confirmed: number;
  nextScheduled?: string;
}

interface DayBucket {
  date: string;
  label: string;
  delivered: number;
  inTransit: number;
  total: number;
}

interface Stats {
  depots: number;
  drivers: number;
  stock: number;
  activeDeliveries: number;
  deliveredToday: number;
  pendingPickups: number;
  stockGood: number;
  stockDamaged: number;
  stockRepaired: number;
  statusCounts: Record<string, number>;
  stockByDepot: { name: string; total: number; depotId: string }[];
  driverStats: DriverRow[];
  recentMovements: { type: string; quantity: number; depot: string; category: string; product: string; created_at: string }[];
  dayBuckets: DayBucket[];
}

const emptyStats: Stats = {
  depots: 0, drivers: 0, stock: 0, activeDeliveries: 0, deliveredToday: 0, pendingPickups: 0,
  stockGood: 0, stockDamaged: 0, stockRepaired: 0,
  statusCounts: {}, stockByDepot: [], driverStats: [], recentMovements: [], dayBuckets: [],
};

type RangeKey = '7d' | '30d' | '90d';

export default function CompanyDashboard() {
  const { profile } = useAuth();
  const [liveDriverCount, setLiveDriverCount] = useState(0);
  const { t } = useTranslation();
  const reviewCounts = usePendingReviewCounts(profile?.company_id);
  const [stats, setStats] = useState<Stats>(emptyStats);
  const [recentNotes, setRecentNotes] = useState<DeliveryNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showChooser, setShowChooser] = useState(false);
  const [scanKind, setScanKind] = useState<ScanDocKind | null>(null);
  const [range, setRange] = useState<RangeKey>('7d');
  const [quickNoteId, setQuickNoteId] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const dayAfterStart = new Date(todayStart);
    dayAfterStart.setDate(dayAfterStart.getDate() + 2);

    const getDate = (n: any) => {
      const ts = n.type === 'pickup' ? n.scheduled_pickup_at : n.scheduled_delivery_at;
      if (!ts) return null;
      const d = new Date(ts);
      d.setHours(0, 0, 0, 0);
      return d;
    };

    const buckets = {
      todayDeliveries: [] as DeliveryNote[],
      todayPickups: [] as DeliveryNote[],
      tomorrowDeliveries: [] as DeliveryNote[],
      tomorrowPickups: [] as DeliveryNote[],
      otherActive: [] as DeliveryNote[],
    };

    for (const n of recentNotes) {
      const d = getDate(n as any);
      const isPickup = (n as any).type === 'pickup';
      if (d && d.getTime() === todayStart.getTime()) {
        if (isPickup) buckets.todayPickups.push(n);
        else buckets.todayDeliveries.push(n);
      } else if (d && d.getTime() === tomorrowStart.getTime()) {
        if (isPickup) buckets.tomorrowPickups.push(n);
        else buckets.tomorrowDeliveries.push(n);
      } else if (d && d.getTime() >= dayAfterStart.getTime()) {
        buckets.otherActive.push(n);
      }
    }
    return buckets;
  }, [recentNotes]);

  const statusConfig: Record<string, { label: string; className: string; barColor: string; icon: typeof CheckCircle2 }> = {
    draft: { label: t('company.deliveryNotes.draft'), className: 'bg-gray-100 text-gray-700', barColor: 'bg-gray-400', icon: FileText },
    sent: { label: t('company.deliveryNotes.sent'), className: 'bg-blue-100 text-blue-700', barColor: 'bg-blue-500', icon: Send },
    in_transit: { label: t('company.deliveryNotes.inTransit'), className: 'bg-amber-100 text-amber-700', barColor: 'bg-amber-500', icon: Truck },
    delivered: { label: t('company.deliveryNotes.delivered'), className: 'bg-green-100 text-green-700', barColor: 'bg-green-500', icon: CheckCircle2 },
    confirmed: { label: t('company.deliveryNotes.confirmed'), className: 'bg-teal-100 text-teal-700', barColor: 'bg-teal-500', icon: CheckCircle2 },
  };

  useEffect(() => {
    if (profile?.company_id) fetchData();
  }, [profile?.company_id, range]);

  useEffect(() => {
    if (!profile?.company_id) return;
    let cancelled = false;
    async function pollLiveDrivers() {
      const since = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('driver_locations')
        .select('driver_id')
        .eq('company_id', profile!.company_id!)
        .gte('recorded_at', since);
      if (cancelled) return;
      const unique = new Set((data ?? []).map((r: { driver_id: string }) => r.driver_id));
      setLiveDriverCount(unique.size);
    }
    void pollLiveDrivers();
    const iv = window.setInterval(pollLiveDrivers, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(iv);
    };
  }, [profile?.company_id]);

  useEffect(() => {
    if (!profile?.company_id || !profile?.id) return;
    const ch = supabase
      .channel(`company-dashboard-${profile.company_id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'delivery_notes', filter: `company_id=eq.${profile.company_id}` },
        () => fetchData(),
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` },
        () => fetchData(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [profile?.company_id, profile?.id]);

  async function fetchData() {
    try {
      setLoading(true);
      setError(null);
      const companyId = profile!.company_id!;
      const now = new Date();
      const todayIso = now.toISOString().split('T')[0];
      const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
      const fromDate = new Date(now);
      fromDate.setDate(fromDate.getDate() - (days - 1));
      fromDate.setHours(0, 0, 0, 0);
      const fromIso = fromDate.toISOString();

      const [
        depotsRes, driversRes, stockRes, activeRes,
        recentRes, deliveredTodayRes, pendingPickupsRes,
        depotListRes, notesForDrivers, movementsRes,
        rangeNotesRes,
      ] = await Promise.all([
        supabase.from('depots').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('is_active', true),
        supabase.from('profiles').select('id, full_name').eq('company_id', companyId).eq('role', 'driver').eq('is_active', true),
        supabase.from('stock').select('quantity, condition, depot_id').eq('company_id', companyId),
        supabase.from('delivery_notes').select('id', { count: 'exact', head: true }).eq('company_id', companyId).in('status', ['sent', 'in_transit']),
        supabase.from('delivery_notes')
          .select('*, driver:profiles!delivery_notes_assigned_driver_id_fkey(full_name), depot:depots!delivery_notes_assigned_depot_id_fkey(name)')
          .eq('company_id', companyId)
          .in('status', ['sent', 'in_transit'])
          .order('created_at', { ascending: false }).limit(50),
        supabase.from('delivery_notes').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'delivered').gte('delivered_at', todayIso),
        supabase.from('delivery_notes').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('type', 'pickup').in('status', ['draft', 'sent', 'in_transit']),
        supabase.from('depots').select('id, name').eq('company_id', companyId).eq('is_active', true),
        supabase.from('delivery_notes').select('assigned_driver_id, status, delivered_at, scheduled_delivery_at, scheduled_pickup_at').eq('company_id', companyId),
        supabase.from('stock_movements')
          .select('movement_type, quantity, depot:depots(name), category:product_categories(name), product:category_products(name), created_at')
          .eq('company_id', companyId).order('created_at', { ascending: false }).limit(5),
        supabase.from('delivery_notes').select('status, created_at, delivered_at').eq('company_id', companyId).neq('status', 'draft').gte('created_at', fromIso),
      ]);

      const stocks = stockRes.data ?? [];
      const totalStock = stocks.reduce((s, i) => s + (i.quantity || 0), 0);
      const stockGood = stocks.filter(s => s.condition === 'good').reduce((s, i) => s + i.quantity, 0);
      const stockDamaged = stocks.filter(s => s.condition === 'damaged').reduce((s, i) => s + i.quantity, 0);
      const stockRepaired = stocks.filter(s => s.condition === 'repaired').reduce((s, i) => s + i.quantity, 0);

      const depotsList = depotListRes.data ?? [];
      const depotStockMap: Record<string, number> = {};
      stocks.forEach(s => { depotStockMap[s.depot_id] = (depotStockMap[s.depot_id] || 0) + s.quantity; });
      const stockByDepot = depotsList.map(d => ({ name: d.name, total: depotStockMap[d.id] || 0, depotId: d.id })).sort((a, b) => b.total - a.total);

      const allNotes = notesForDrivers.data ?? [];
      const drivers = driversRes.data ?? [];
      const statusCounts: Record<string, number> = {};
      allNotes.forEach(n => { statusCounts[n.status] = (statusCounts[n.status] || 0) + 1; });

      const todayDateStr = todayIso;
      const driverMap: Record<string, DriverRow> = {};
      allNotes.forEach((n: any) => {
        if (!n.assigned_driver_id) return;
        if (!driverMap[n.assigned_driver_id]) {
          driverMap[n.assigned_driver_id] = { id: n.assigned_driver_id, name: '', assigned: 0, inTransit: 0, deliveredToday: 0, confirmed: 0 };
        }
        const d = driverMap[n.assigned_driver_id];
        if (['sent', 'in_transit'].includes(n.status)) d.assigned++;
        if (n.status === 'in_transit') d.inTransit++;
        if (n.status === 'delivered' && n.delivered_at && String(n.delivered_at).startsWith(todayDateStr)) d.deliveredToday++;
        if (n.status === 'confirmed') d.confirmed++;
        const nextTs = n.scheduled_delivery_at || n.scheduled_pickup_at;
        if (nextTs && (!d.nextScheduled || new Date(nextTs) < new Date(d.nextScheduled))) {
          if (new Date(nextTs) >= new Date(todayDateStr)) d.nextScheduled = nextTs;
        }
      });
      const driverStats: DriverRow[] = drivers.map(d => {
        const row = driverMap[d.id] || { id: d.id, name: '', assigned: 0, inTransit: 0, deliveredToday: 0, confirmed: 0 };
        return { ...row, id: d.id, name: d.full_name };
      }).sort((a, b) => (b.assigned + b.inTransit) - (a.assigned + a.inTransit));

      const bucketMap: Record<string, DayBucket> = {};
      for (let i = 0; i < days; i++) {
        const d = new Date(fromDate);
        d.setDate(d.getDate() + i);
        const iso = d.toISOString().split('T')[0];
        const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        bucketMap[iso] = { date: iso, label, delivered: 0, inTransit: 0, total: 0 };
      }
      (rangeNotesRes.data ?? []).forEach((n: any) => {
        const key = String(n.created_at).slice(0, 10);
        const b = bucketMap[key];
        if (!b) return;
        b.total++;
        if (['delivered', 'confirmed'].includes(n.status)) b.delivered++;
        if (['sent', 'in_transit'].includes(n.status)) b.inTransit++;
      });
      const dayBuckets = Object.values(bucketMap);

      const recentMovements = (movementsRes.data ?? []).map((m: any) => ({
        type: m.movement_type,
        quantity: m.quantity,
        depot: m.depot?.name || '-',
        category: m.category?.name || '-',
        product: m.product?.name || '',
        created_at: m.created_at,
      }));

      setStats({
        depots: depotsRes.count ?? 0,
        drivers: drivers.length,
        stock: totalStock,
        activeDeliveries: activeRes.count ?? 0,
        deliveredToday: deliveredTodayRes.count ?? 0,
        pendingPickups: pendingPickupsRes.count ?? 0,
        stockGood, stockDamaged, stockRepaired,
        statusCounts, stockByDepot, driverStats, recentMovements, dayBuckets,
      });
      setRecentNotes(recentRes.data ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.errorLoading'));
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-3" />
        <p className="text-red-700 font-medium">{error}</p>
        <button onClick={fetchData} className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
          {t('common.tryAgain')}
        </button>
      </div>
    );
  }

  const totalStatusNotes = Object.values(stats.statusCounts).reduce((s, v) => s + v, 0);
  const maxStockDepot = Math.max(...stats.stockByDepot.map(d => d.total), 1);
  const maxDayTotal = Math.max(...stats.dayBuckets.map(b => b.total), 1);

  return (
    <div className="space-y-5">
      {/* Greeting + Scan */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-gray-900">
            {t('company.dashboard.title')}
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">{t('company.dashboard.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {profile?.company_id && (
            <Link
              to="/company/live-map"
              title="Ndiq shoferet ne kohe reale"
              aria-label="Ndiq shoferet ne kohe reale"
              className="relative p-2.5 bg-teal-50 text-teal-700 rounded-xl hover:bg-teal-100 active:bg-teal-200 transition-colors border border-teal-100"
            >
              <MapPin className="w-5 h-5" />
              {liveDriverCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white">
                  {liveDriverCount}
                </span>
              )}
            </Link>
          )}
          <button
            onClick={() => setShowChooser(true)}
            className="p-2.5 bg-teal-600 text-white rounded-xl hover:bg-teal-700 active:bg-teal-800 transition-colors shadow-sm lg:px-4 lg:py-2.5 lg:gap-2 lg:inline-flex lg:items-center"
          >
            <ScanLine className="w-5 h-5" />
            <span className="hidden lg:inline text-sm font-medium">{t('scanner.scanDocument')}</span>
          </button>
        </div>
      </div>

      {/* Quick Actions - Mobile prominent */}
      <div className="grid grid-cols-4 gap-2 lg:hidden">
        <QuickActionTile to="/company/delivery-notes" icon={Plus} label={t('company.deliveryNotes.createNote')} color="teal" />
        <QuickActionTile to="/company/stock" icon={Package} label={t('nav.stock')} color="emerald" />
        <QuickActionTile to="/company/chat" icon={MessageCircle} label={t('nav.chat')} color="cyan" />
        <QuickActionTile to="/company/reports" icon={BarChart3} label={t('nav.reports')} color="gray" />
      </div>

      <ReviewCTA counts={reviewCounts} t={t} />

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label={t('company.dashboard.totalDepots')} value={stats.depots} icon={Warehouse} color="bg-teal-500" />
        <StatCard label={t('company.dashboard.totalDrivers')} value={stats.drivers} icon={Users} color="bg-emerald-500" />
        <StatCard label={t('company.dashboard.totalStock')} value={stats.stock.toLocaleString()} icon={Package} color="bg-cyan-500" suffix={t('common.pieces')} />
        <StatCard
          label={t('company.dashboard.totalDeliveries')}
          value={stats.activeDeliveries}
          icon={Truck}
          color="bg-amber-500"
          badge={stats.deliveredToday > 0 ? `+${stats.deliveredToday} ${t('common.today').toLowerCase()}` : undefined}
        />
      </div>


      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-5">
          {/* Today / Tomorrow Active Orders */}
          <ScheduleSection
            title={t('company.dashboard.today')}
            highlight
            deliveries={grouped.todayDeliveries}
            pickups={grouped.todayPickups}
            statusConfig={statusConfig}
            t={t}
            onSelect={setQuickNoteId}
          />
          <ScheduleSection
            title={t('company.dashboard.tomorrow')}
            deliveries={grouped.tomorrowDeliveries}
            pickups={grouped.tomorrowPickups}
            statusConfig={statusConfig}
            t={t}
            onSelect={setQuickNoteId}
          />
          {grouped.otherActive.length > 0 && (
            <ScheduleSection
              title={t('company.dashboard.otherActive')}
              deliveries={grouped.otherActive.filter((n: any) => n.type !== 'pickup')}
              pickups={grouped.otherActive.filter((n: any) => n.type === 'pickup')}
              statusConfig={statusConfig}
              t={t}
              onSelect={setQuickNoteId}
            />
          )}

          {/* Day Range Chart */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="px-4 py-3.5 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-teal-600" />
                <h2 className="font-semibold text-gray-900 text-sm">{t('companyAdmin.dashboard.deliveryNotesByDays')}</h2>
              </div>
              <div className="flex items-center gap-1 bg-gray-50 rounded-lg p-0.5">
                {(['7d', '30d', '90d'] as RangeKey[]).map(k => (
                  <button
                    key={k}
                    onClick={() => setRange(k)}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${range === k ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    {k === '7d' ? t('companyAdmin.dashboard.range7d') : k === '30d' ? t('companyAdmin.dashboard.range30d') : t('companyAdmin.dashboard.range90d')}
                  </button>
                ))}
              </div>
            </div>
            <div className="p-4">
              {stats.dayBuckets.every(b => b.total === 0) ? (
                <div className="text-center py-6">
                  <FileText className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                  <p className="text-gray-400 text-xs">{t('common.noData')}</p>
                </div>
              ) : (
                <div className="flex items-end gap-0.5 h-36">
                  {stats.dayBuckets.map((b) => {
                    const deliveredPct = (b.delivered / maxDayTotal) * 100;
                    const transitPct = (b.inTransit / maxDayTotal) * 100;
                    const showLabel = stats.dayBuckets.length <= 14 || stats.dayBuckets.indexOf(b) % Math.ceil(stats.dayBuckets.length / 10) === 0;
                    return (
                      <div key={b.date} className="flex-1 flex flex-col items-center gap-1 group min-w-0">
                        <span className="text-[9px] font-semibold text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity">{b.total}</span>
                        <div className="w-full relative rounded-t overflow-hidden bg-gray-50" style={{ height: '100px' }}>
                          <div className="absolute bottom-0 left-0 right-0 bg-amber-400 transition-all" style={{ height: `${Math.max(transitPct, b.inTransit > 0 ? 4 : 0)}%` }} />
                          <div className="absolute bottom-0 left-0 right-0 bg-teal-500 transition-all" style={{ height: `${Math.max(deliveredPct, b.delivered > 0 ? 4 : 0)}%` }} />
                        </div>
                        {showLabel && (
                          <span className="text-[8px] text-gray-500 truncate max-w-full">{b.label}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="flex items-center justify-center gap-4 mt-3 text-[10px]">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-teal-500" />{t('companyAdmin.dashboard.delivered')}</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-amber-400" />{t('companyAdmin.dashboard.inTransit')}</span>
              </div>
            </div>
          </div>

          {/* Driver Deliveries Table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="px-4 py-3.5 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-teal-600" />
                <h2 className="font-semibold text-gray-900 text-sm">{t('companyAdmin.dashboard.driverDeliveriesTitle')}</h2>
              </div>
              <Link to="/company/drivers" className="text-xs text-teal-600 hover:text-teal-700 font-medium">{t('companyAdmin.dashboard.manage')}</Link>
            </div>
            {stats.driverStats.length === 0 ? (
              <div className="p-8 text-center">
                <Truck className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                <p className="text-gray-400 text-xs">{t('company.drivers.noDrivers')}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                      <th className="text-left px-4 py-2 font-medium">{t('companyAdmin.dashboard.colDriver')}</th>
                      <th className="text-center px-2 py-2 font-medium">{t('companyAdmin.dashboard.colActive')}</th>
                      <th className="text-center px-2 py-2 font-medium">{t('companyAdmin.dashboard.colTransit')}</th>
                      <th className="text-center px-2 py-2 font-medium">{t('companyAdmin.dashboard.colDeliveredToday')}</th>
                      <th className="text-center px-2 py-2 font-medium hidden sm:table-cell">{t('companyAdmin.dashboard.colConfirmed')}</th>
                      <th className="text-right px-4 py-2 font-medium hidden md:table-cell">{t('companyAdmin.dashboard.colSuccessor')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {stats.driverStats.slice(0, 6).map((d) => (
                      <tr key={d.id} className="hover:bg-gray-50/50">
                        <td className="px-4 py-2.5 flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-teal-100 flex items-center justify-center text-[10px] font-bold text-teal-700">
                            {d.name.charAt(0) || '?'}
                          </div>
                          <span className="font-medium text-gray-800 truncate">{d.name}</span>
                        </td>
                        <td className="px-2 py-2.5 text-center text-amber-700 font-semibold">{d.assigned}</td>
                        <td className="px-2 py-2.5 text-center text-blue-700 font-semibold">{d.inTransit}</td>
                        <td className="px-2 py-2.5 text-center text-teal-700 font-semibold">{d.deliveredToday}</td>
                        <td className="px-2 py-2.5 text-center text-gray-600 hidden sm:table-cell">{d.confirmed}</td>
                        <td className="px-4 py-2.5 text-right text-xs text-gray-500 hidden md:table-cell">
                          {d.nextScheduled ? new Date(d.nextScheduled).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Status Chart */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="px-4 py-3.5 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4.5 h-4.5 text-teal-600" />
                <h2 className="font-semibold text-gray-900 text-sm">{t('company.reports.notesByStatus')}</h2>
              </div>
              <span className="text-xs text-gray-400">{totalStatusNotes} {t('common.total').toLowerCase()}</span>
            </div>
            <div className="p-4">
              {totalStatusNotes === 0 ? (
                <div className="text-center py-6">
                  <FileText className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                  <p className="text-gray-400 text-xs">{t('common.noData')}</p>
                </div>
              ) : (
                <div className="flex items-end gap-2 h-32 lg:h-40">
                  {Object.entries(statusConfig).map(([key, cfg]) => {
                    const count = stats.statusCounts[key] || 0;
                    const pct = totalStatusNotes > 0 ? (count / totalStatusNotes) * 100 : 0;
                    return (
                      <div key={key} className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-[10px] font-bold text-gray-700">{count}</span>
                        <div className="w-full relative rounded-t-lg overflow-hidden bg-gray-50" style={{ height: '100px' }}>
                          <div
                            className={`absolute bottom-0 left-0 right-0 rounded-t-lg transition-all duration-700 ${cfg.barColor}`}
                            style={{ height: `${Math.max(pct, 4)}%` }}
                          />
                        </div>
                        <span className="text-[9px] lg:text-[10px] text-gray-500 text-center leading-tight">{cfg.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Right column */}
        <div className="space-y-5">
          {/* Stock by Depot */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Package className="w-4 h-4 text-teal-600" />
              <h3 className="font-semibold text-gray-900 text-sm">{t('company.reports.stockByDepot')}</h3>
            </div>
            {stats.stockByDepot.length === 0 ? (
              <div className="text-center py-4">
                <Warehouse className="w-7 h-7 text-gray-200 mx-auto mb-1" />
                <p className="text-xs text-gray-400">{t('common.noData')}</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {stats.stockByDepot.slice(0, 5).map(depot => {
                  const pct = (depot.total / maxStockDepot) * 100;
                  return (
                    <div key={depot.depotId}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs font-medium text-gray-600 truncate">{depot.name}</span>
                        <span className="text-xs font-bold text-gray-900">{depot.total.toLocaleString()}</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div className="bg-teal-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Stock Condition */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <h3 className="font-semibold text-gray-900 text-sm mb-3">{t('company.dashboard.totalStock')}</h3>
            <div className="space-y-2.5">
              <ConditionRow label={t('company.stock.good')} value={stats.stockGood} total={stats.stock} color="bg-green-500" icon={CheckCircle2} />
              <ConditionRow label={t('company.stock.damaged')} value={stats.stockDamaged} total={stats.stock} color="bg-red-500" icon={AlertTriangle} />
              <ConditionRow label={t('company.stock.repaired')} value={stats.stockRepaired} total={stats.stock} color="bg-amber-500" icon={Wrench} />
            </div>
          </div>

          {/* Driver Activity */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-teal-600" />
                <h3 className="font-semibold text-gray-900 text-sm">{t('company.reports.driverActivity')}</h3>
              </div>
              <Link to="/company/drivers" className="text-[10px] text-teal-600 hover:text-teal-700 font-medium">{t('company.dashboard.manageDrivers')}</Link>
            </div>
            {stats.driverStats.length === 0 ? (
              <div className="text-center py-3">
                <Truck className="w-7 h-7 text-gray-200 mx-auto mb-1" />
                <p className="text-xs text-gray-400">{t('company.drivers.noDrivers')}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {stats.driverStats.slice(0, 5).map((driver, idx) => (
                  <div key={driver.name} className="flex items-center gap-2.5">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${idx === 0 ? 'bg-teal-500' : idx === 1 ? 'bg-emerald-500' : 'bg-gray-400'}`}>
                      {driver.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-900 truncate">{driver.name}</p>
                      <div className="flex items-center gap-2 text-[10px]">
                        {driver.assigned > 0 && <span className="text-amber-600">{driver.assigned} aktive</span>}
                        <span className="text-green-600">{driver.deliveredToday} ok</span>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-gray-700">{driver.assigned + driver.deliveredToday + driver.confirmed}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Desktop Quick Actions */}
          <div className="hidden lg:block bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <h3 className="font-semibold text-gray-900 text-sm mb-3">{t('company.dashboard.quickActions')}</h3>
            <div className="space-y-1.5">
              <QuickAction to="/company/delivery-notes" icon={FileText} label={t('company.deliveryNotes.createNote')} color="teal" />
              <QuickAction to="/company/depots" icon={Warehouse} label={t('company.depots.addDepot')} color="emerald" />
              <QuickAction to="/company/drivers" icon={Truck} label={t('company.drivers.addDriver')} color="cyan" />
              <QuickAction to="/company/reports" icon={BarChart3} label={t('company.dashboard.viewReports')} color="gray" />
            </div>
          </div>
        </div>
      </div>

      {/* Recent Movements */}
      {stats.recentMovements.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="px-4 py-3.5 border-b border-gray-100 flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-teal-600" />
            <h2 className="font-semibold text-gray-900 text-sm">{t('depot.dashboard.recentMovements')}</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {stats.recentMovements.map((m, i) => (
              <div key={i} className="px-4 py-3 flex items-center gap-3">
                <div className={`p-1.5 rounded-lg ${m.type === 'entry' ? 'bg-green-100' : m.type === 'exit' ? 'bg-red-100' : 'bg-amber-100'}`}>
                  {m.type === 'entry' ? <ArrowDownRight className="w-3.5 h-3.5 text-green-600" /> : m.type === 'exit' ? <ArrowUpRight className="w-3.5 h-3.5 text-red-600" /> : <Wrench className="w-3.5 h-3.5 text-amber-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{m.product || m.category}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {m.product ? `${m.category} · ` : ''}{m.depot}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-gray-900">{m.quantity}</p>
                  <p className="text-[10px] text-gray-400">{new Date(m.created_at).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showChooser && (
        <DocumentTypeChooser
          onClose={() => setShowChooser(false)}
          onChoose={(kind) => {
            setShowChooser(false);
            setScanKind(kind);
          }}
        />
      )}
      {scanKind && (
        <ScanDocumentModal
          initialKind={scanKind}
          onClose={() => setScanKind(null)}
          onSaved={() => {
            setScanKind(null);
            fetchData();
          }}
        />
      )}
      {quickNoteId && (
        <QuickNoteModal
          noteId={quickNoteId}
          onClose={() => setQuickNoteId(null)}
          onSaved={() => fetchData()}
        />
      )}
    </div>
  );
}

function ScheduleSection({
  title, highlight, deliveries, pickups, statusConfig, t, onSelect,
}: {
  title: string;
  highlight?: boolean;
  deliveries: DeliveryNote[];
  pickups: DeliveryNote[];
  statusConfig: Record<string, { label: string; className: string; barColor: string; icon: typeof CheckCircle2 }>;
  t: (k: string) => string;
  onSelect: (id: string) => void;
}) {
  const total = deliveries.length + pickups.length;
  return (
    <div className={`bg-white rounded-xl shadow-sm border ${highlight ? 'border-teal-200 ring-1 ring-teal-100' : 'border-gray-100'} overflow-hidden`}>
      <div className={`px-4 py-3 flex items-center justify-between ${highlight ? 'bg-teal-50' : 'bg-gray-50'}`}>
        <div className="flex items-center gap-2">
          <h2 className={`font-semibold text-sm ${highlight ? 'text-teal-900' : 'text-gray-900'}`}>{title}</h2>
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${highlight ? 'bg-teal-600 text-white' : 'bg-gray-200 text-gray-700'}`}>
            {total}
          </span>
        </div>
      </div>
      {total === 0 ? (
        <div className="p-6 text-center">
          <FileText className="w-7 h-7 text-gray-200 mx-auto mb-1.5" />
          <p className="text-gray-400 text-xs">{t('company.dashboard.noScheduled')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-100">
          <ScheduleColumn
            label={t('review.tabs.deliveries')}
            icon={Truck}
            tone="sky"
            notes={deliveries}
            statusConfig={statusConfig}
            t={t}
            onSelect={onSelect}
          />
          <ScheduleColumn
            label={t('review.tabs.pickups')}
            icon={Package}
            tone="orange"
            notes={pickups}
            statusConfig={statusConfig}
            t={t}
            onSelect={onSelect}
          />
        </div>
      )}
    </div>
  );
}

function ScheduleColumn({
  label, icon: Icon, tone, notes, statusConfig, t, onSelect,
}: {
  label: string;
  icon: typeof Truck;
  tone: 'sky' | 'orange';
  notes: DeliveryNote[];
  statusConfig: Record<string, { label: string; className: string; barColor: string; icon: typeof CheckCircle2 }>;
  t: (k: string) => string;
  onSelect: (id: string) => void;
}) {
  const toneClasses = tone === 'sky'
    ? { dot: 'bg-sky-500', text: 'text-sky-700', bg: 'bg-sky-50', icon: 'text-sky-600' }
    : { dot: 'bg-orange-500', text: 'text-orange-700', bg: 'bg-orange-50', icon: 'text-orange-600' };
  return (
    <div>
      <div className="px-4 py-2 flex items-center gap-2 border-b border-gray-50">
        <span className={`w-1.5 h-1.5 rounded-full ${toneClasses.dot}`} />
        <span className={`text-xs font-semibold uppercase tracking-wide ${toneClasses.text}`}>{label}</span>
        <span className="ml-auto text-[11px] text-gray-400">{notes.length}</span>
      </div>
      {notes.length === 0 ? (
        <div className="px-4 py-5 text-center text-[11px] text-gray-400">{t('company.dashboard.noScheduled')}</div>
      ) : (
        <div className="divide-y divide-gray-50">
          {notes.slice(0, 6).map((note: any) => {
            const cfg = statusConfig[note.status];
            const ts = note.type === 'pickup' ? note.scheduled_pickup_at : note.scheduled_delivery_at;
            return (
              <button
                key={note.id}
                type="button"
                onClick={() => onSelect(note.id)}
                className="w-full text-left block px-4 py-2.5 hover:bg-gray-50/70 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <div className={`p-1.5 rounded-lg flex-shrink-0 ${toneClasses.bg}`}>
                    <Icon className={`w-3.5 h-3.5 ${toneClasses.icon}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-900 truncate">{note.note_number}</span>
                      {cfg && (
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${cfg.className}`}>
                          {cfg.label}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-gray-500 mt-0.5">
                      {note.partner_name && <span className="truncate">{note.partner_name}</span>}
                      {(note.driver as any)?.full_name && (
                        <span className="flex items-center gap-1 truncate">
                          <Truck className="w-2.5 h-2.5" />
                          {(note.driver as any).full_name}
                        </span>
                      )}
                    </div>
                  </div>
                  {ts && (
                    <span className="text-[10px] text-gray-400 flex-shrink-0 tabular-nums">
                      {new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
          {notes.length > 6 && (
            <Link to="/company/delivery-notes" className="block px-4 py-2 text-center text-[11px] font-semibold text-teal-600 hover:bg-gray-50">
              +{notes.length - 6} {t('common.total').toLowerCase()}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function ReviewCTA({ counts, t }: { counts: ReturnType<typeof usePendingReviewCounts>; t: (k: string) => string }) {
  if (counts.loading) return null;
  if (counts.total === 0) {
    return (
      <Link
        to="/company/review"
        className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-100 rounded-xl hover:bg-emerald-100/70 transition-colors"
      >
        <div className="p-2 rounded-lg bg-emerald-500/10">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-emerald-900">{t('review.cta.allClearTitle')}</p>
          <p className="text-xs text-emerald-700">{t('review.cta.allClearSubtitle')}</p>
        </div>
        <ArrowRight className="w-4 h-4 text-emerald-600" />
      </Link>
    );
  }

  const parts: string[] = [];
  if (counts.deliveries > 0) parts.push(`${counts.deliveries} ${t('review.tabs.deliveries').toLowerCase()}`);
  if (counts.pickups > 0) parts.push(`${counts.pickups} ${t('review.tabs.pickups').toLowerCase()}`);
  if (counts.repairs > 0) parts.push(`${counts.repairs} ${t('review.tabs.repairs').toLowerCase()}`);

  return (
    <Link
      to="/company/review"
      className="group relative flex items-center gap-4 p-4 lg:p-5 bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-600 rounded-2xl text-white shadow-lg hover:shadow-xl active:scale-[0.99] transition-all overflow-hidden"
    >
      <span className="absolute top-3 right-4 flex items-center justify-center">
        <span className="absolute w-3 h-3 bg-white/40 rounded-full animate-ping" />
        <span className="relative w-2 h-2 bg-white rounded-full" />
      </span>
      <div className="p-2.5 rounded-xl bg-white/20 backdrop-blur-sm flex-shrink-0">
        <ClipboardList className="w-6 h-6 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold uppercase tracking-wide">{t('review.cta.title')}</p>
        <p className="text-xs lg:text-sm text-white/90 mt-0.5 truncate">{parts.join(' - ')}</p>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className="text-2xl lg:text-3xl font-bold tabular-nums">{counts.total}</span>
        <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
      </div>
    </Link>
  );
}

function StatCard({ label, value, icon: Icon, color, suffix, badge }: {
  label: string; value: string | number; icon: typeof Warehouse; color: string; suffix?: string; badge?: string;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3.5 lg:p-5">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-[10px] lg:text-xs font-medium text-gray-500 uppercase tracking-wide truncate">{label}</p>
          <div className="flex items-baseline gap-1 mt-1 lg:mt-2">
            <p className="text-xl lg:text-2xl font-bold text-gray-900">{value}</p>
            {suffix && <span className="text-[10px] text-gray-400 hidden lg:inline">{suffix}</span>}
          </div>
          {badge && <span className="inline-block mt-1 text-[9px] font-medium text-green-600 bg-green-50 px-1.5 py-0.5 rounded">{badge}</span>}
        </div>
        <div className={`${color} p-2 lg:p-2.5 rounded-xl flex-shrink-0`}>
          <Icon className="w-4 h-4 lg:w-5 lg:h-5 text-white" />
        </div>
      </div>
    </div>
  );
}

function ConditionRow({ label, value, total, color, icon: Icon }: {
  label: string; value: number; total: number; color: string; icon: typeof CheckCircle2;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2.5">
      <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${color.replace('bg-', 'text-')}`} />
      <div className="flex-1">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-xs text-gray-600">{label}</span>
          <span className="text-xs font-bold text-gray-900">{value.toLocaleString()} ({pct.toFixed(0)}%)</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-1.5">
          <div className={`${color} h-1.5 rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}

function QuickAction({ to, icon: Icon, label, color }: {
  to: string; icon: typeof FileText; label: string; color: string;
}) {
  const colorMap: Record<string, string> = {
    teal: 'bg-teal-50 hover:bg-teal-100 text-teal-700',
    emerald: 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700',
    cyan: 'bg-cyan-50 hover:bg-cyan-100 text-cyan-700',
    gray: 'bg-gray-50 hover:bg-gray-100 text-gray-700',
  };
  return (
    <Link to={to} className={`flex items-center gap-3 p-2.5 rounded-lg transition-colors ${colorMap[color] || colorMap.gray}`}>
      <Icon className="w-4 h-4" />
      <span className="text-sm font-medium flex-1">{label}</span>
      <ArrowRight className="w-3.5 h-3.5 opacity-50" />
    </Link>
  );
}

function QuickActionTile({ to, icon: Icon, label, color }: {
  to: string; icon: typeof FileText; label: string; color: string;
}) {
  const colorMap: Record<string, { bg: string; icon: string; text: string }> = {
    teal: { bg: 'bg-teal-50 active:bg-teal-100', icon: 'text-teal-600', text: 'text-teal-700' },
    emerald: { bg: 'bg-emerald-50 active:bg-emerald-100', icon: 'text-emerald-600', text: 'text-emerald-700' },
    cyan: { bg: 'bg-cyan-50 active:bg-cyan-100', icon: 'text-cyan-600', text: 'text-cyan-700' },
    gray: { bg: 'bg-gray-50 active:bg-gray-100', icon: 'text-gray-600', text: 'text-gray-700' },
  };
  const c = colorMap[color] || colorMap.gray;
  return (
    <Link to={to} className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl transition-colors ${c.bg}`}>
      <Icon className={`w-5 h-5 ${c.icon}`} />
      <span className={`text-[10px] font-medium text-center leading-tight ${c.text}`}>{label}</span>
    </Link>
  );
}
