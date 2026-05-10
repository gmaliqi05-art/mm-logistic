import { useState, useEffect, useMemo } from 'react';
import {
  Wrench,
  AlertTriangle,
  X,
  Loader2,
  Package,
  Calendar,
  CheckCircle,
  ClipboardList,
  AlertOctagon,
  Search,
  TrendingUp,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import RepairCompletionModal from '../../components/stock/RepairCompletionModal';

interface RepairReportRow {
  id: string;
  report_date: string;
  total_quantity: number;
  details: {
    workers?: Array<{
      worker_id: string;
      worker_name: string;
      total_quantity: number;
      by_product?: Array<{ name: string; quantity: number }>;
    }>;
  };
}

interface OpenRepair {
  product_name: string | null;
  category_id: string | null;
  quantity_repaired: number | null;
  logged_at: string;
  category?: { name: string } | null;
}

interface ProductSummary {
  name: string;
  category: string;
  total: number;
  lastDate: string;
}

interface DamagedStockRow {
  id: string;
  category_id: string;
  quantity: number;
  updated_at: string;
  category?: { name: string } | null;
}

type TabKey = 'reports' | 'damaged' | 'pending';

interface OpenRepairCase {
  id: string;
  category_id: string | null;
  quantity_in: number;
  quantity_repaired: number;
  quantity_scrapped: number;
  created_at: string;
  category?: { name: string } | null;
  depot?: { name: string } | null;
}

export default function DepotRepairs() {
  const { profile } = useAuth();
  const { t } = useTranslation();

  const [tab, setTab] = useState<TabKey>('reports');
  const [reports, setReports] = useState<RepairReportRow[]>([]);
  const [openRepairs, setOpenRepairs] = useState<OpenRepair[]>([]);
  const [damagedStock, setDamagedStock] = useState<DamagedStockRow[]>([]);
  const [openCases, setOpenCases] = useState<OpenRepairCase[]>([]);
  const [activeRepairId, setActiveRepairId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (profile?.company_id) fetchAll();
  }, [profile?.company_id, profile?.depot_id]);

  async function fetchAll() {
    try {
      setLoading(true);
      setError(null);
      const companyId = profile!.company_id!;
      const depotId = profile?.depot_id ?? null;

      let stockQuery = supabase
        .from('stock')
        .select('id, category_id, quantity, updated_at, category:product_categories(name)')
        .eq('company_id', companyId)
        .eq('condition', 'damaged')
        .gt('quantity', 0)
        .order('quantity', { ascending: false });
      if (depotId) stockQuery = stockQuery.eq('depot_id', depotId);

      let casesQuery = supabase
        .from('depot_repairs')
        .select('id, category_id, quantity_in, quantity_repaired, quantity_scrapped, created_at, category:product_categories(name), depot:depots(name)')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (depotId) casesQuery = casesQuery.eq('depot_id', depotId);

      const [reportsRes, openRes, stockRes, casesRes] = await Promise.all([
        supabase
          .from('depot_repair_reports')
          .select('id, report_date, total_quantity, details')
          .eq('company_id', companyId)
          .eq('scope', 'company')
          .order('report_date', { ascending: false })
          .limit(120),
        supabase
          .from('depot_repairs')
          .select('product_name, category_id, quantity_repaired, logged_at, category:product_categories(name)')
          .eq('company_id', companyId)
          .is('reported_at', null),
        stockQuery,
        casesQuery,
      ]);

      if (reportsRes.error) throw reportsRes.error;
      if (openRes.error) throw openRes.error;
      if (stockRes.error) throw stockRes.error;
      if (casesRes.error) throw casesRes.error;

      const casesData = (casesRes.data ?? []) as unknown as OpenRepairCase[];
      setOpenCases(
        casesData
          .map((c) => ({
            ...c,
            category: Array.isArray((c as any).category) ? (c as any).category[0] ?? null : (c as any).category ?? null,
            depot: Array.isArray((c as any).depot) ? (c as any).depot[0] ?? null : (c as any).depot ?? null,
          }))
          .filter((c) => c.quantity_in - c.quantity_repaired - c.quantity_scrapped > 0),
      );

      setReports((reportsRes.data ?? []) as RepairReportRow[]);

      const openRows = (openRes.data ?? []) as unknown as Array<{
        product_name: string | null;
        category_id: string | null;
        quantity_repaired: number | null;
        logged_at: string;
        category?: { name: string } | { name: string }[] | null;
      }>;
      setOpenRepairs(
        openRows.map((r) => ({
          product_name: r.product_name,
          category_id: r.category_id,
          quantity_repaired: r.quantity_repaired,
          logged_at: r.logged_at,
          category: Array.isArray(r.category) ? r.category[0] ?? null : r.category ?? null,
        })),
      );

      const stockRows = (stockRes.data ?? []) as unknown as Array<{
        id: string;
        category_id: string;
        quantity: number;
        updated_at: string;
        category?: { name: string } | { name: string }[] | null;
      }>;
      setDamagedStock(
        stockRows.map((r) => ({
          id: r.id,
          category_id: r.category_id,
          quantity: r.quantity,
          updated_at: r.updated_at,
          category: Array.isArray(r.category) ? r.category[0] ?? null : r.category ?? null,
        })),
      );
    } catch (err) {
      setError((err as Error).message || t('common.errorLoading'));
    } finally {
      setLoading(false);
    }
  }

  const productSummary = useMemo<ProductSummary[]>(() => {
    const map = new Map<string, ProductSummary>();
    for (const r of reports) {
      const date = r.report_date;
      for (const w of r.details?.workers ?? []) {
        for (const p of w.by_product ?? []) {
          const key = (p.name || '').trim();
          if (!key) continue;
          const cur = map.get(key) ?? { name: key, category: '', total: 0, lastDate: date };
          cur.total += p.quantity || 0;
          if (date > cur.lastDate) cur.lastDate = date;
          map.set(key, cur);
        }
      }
    }
    for (const r of openRepairs) {
      const key = (r.product_name || '').trim();
      if (!key) continue;
      const cur = map.get(key) ?? {
        name: key,
        category: r.category?.name ?? '',
        total: 0,
        lastDate: r.logged_at.slice(0, 10),
      };
      cur.total += r.quantity_repaired ?? 0;
      if (!cur.category && r.category?.name) cur.category = r.category.name;
      const day = r.logged_at.slice(0, 10);
      if (day > cur.lastDate) cur.lastDate = day;
      map.set(key, cur);
    }
    const list = Array.from(map.values());
    list.sort((a, b) => b.total - a.total);
    return list;
  }, [reports, openRepairs]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return productSummary;
    return productSummary.filter((p) => p.name.toLowerCase().includes(q));
  }, [productSummary, search]);

  const totalRepaired = useMemo(
    () => productSummary.reduce((s, p) => s + p.total, 0),
    [productSummary],
  );
  const totalDamaged = useMemo(
    () => damagedStock.reduce((s, r) => s + r.quantity, 0),
    [damagedStock],
  );
  const todayRepaired = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    let sum = 0;
    for (const r of reports) {
      if (r.report_date === today) sum += r.total_quantity || 0;
    }
    for (const r of openRepairs) {
      if (r.logged_at.slice(0, 10) === today) sum += r.quantity_repaired ?? 0;
    }
    return sum;
  }, [reports, openRepairs]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-12 h-12 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('depot.repairs.title')}</h1>
        <p className="text-gray-500 mt-1">Raporti i paletave te reparuara dhe stoku per reparim</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-red-700 text-sm flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Total Reparuar"
          value={totalRepaired}
          icon={<Wrench className="w-6 h-6 text-teal-600" />}
          tone="bg-teal-100"
        />
        <StatCard
          label="Reparuar Sot"
          value={todayRepaired}
          icon={<CheckCircle className="w-6 h-6 text-emerald-600" />}
          tone="bg-emerald-100"
        />
        <StatCard
          label="Per Reparim (Stok)"
          value={totalDamaged}
          icon={<AlertOctagon className="w-6 h-6 text-amber-600" />}
          tone="bg-amber-100"
        />
      </div>

      <div className="flex items-center gap-2 border-b border-slate-200">
        <TabButton
          active={tab === 'reports'}
          onClick={() => setTab('reports')}
          icon={<ClipboardList className="w-4 h-4" />}
          label="Raporti i Reparuar"
          count={productSummary.length}
        />
        <TabButton
          active={tab === 'damaged'}
          onClick={() => setTab('damaged')}
          icon={<AlertOctagon className="w-4 h-4" />}
          label="Stoku per Reparim"
          count={damagedStock.length}
        />
        <TabButton
          active={tab === 'pending'}
          onClick={() => setTab('pending')}
          icon={<Wrench className="w-4 h-4" />}
          label="Rastet e hapura"
          count={openCases.length}
        />
      </div>

      {tab === 'reports' ? (
        <ReportsTab
          rows={filteredProducts}
          search={search}
          setSearch={setSearch}
          totalRepaired={totalRepaired}
        />
      ) : tab === 'damaged' ? (
        <DamagedTab rows={damagedStock} />
      ) : (
        <OpenCasesTab rows={openCases} onReport={(id) => setActiveRepairId(id)} />
      )}

      {activeRepairId && (
        <RepairCompletionModal
          repairId={activeRepairId}
          onClose={() => setActiveRepairId(null)}
          onApplied={() => {
            setActiveRepairId(null);
            fetchAll();
          }}
        />
      )}
    </div>
  );
}

function OpenCasesTab({ rows, onReport }: { rows: OpenRepairCase[]; onReport: (id: string) => void }) {
  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
        <CheckCircle className="w-10 h-10 mx-auto mb-3 text-emerald-300" />
        <p className="text-sm text-slate-400">Asnje rast i hapur reparimi.</p>
      </div>
    );
  }
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
          <tr>
            <th className="px-4 py-2 text-left">Data</th>
            <th className="px-4 py-2 text-left">Kategori</th>
            <th className="px-4 py-2 text-left">Depo</th>
            <th className="px-4 py-2 text-right">Hyri</th>
            <th className="px-4 py-2 text-right">Reparuar</th>
            <th className="px-4 py-2 text-right">Scrap</th>
            <th className="px-4 py-2 text-right">Mbetet</th>
            <th className="px-4 py-2 text-right">Veprim</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => {
            const remaining = r.quantity_in - r.quantity_repaired - r.quantity_scrapped;
            return (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-2 text-slate-600 whitespace-nowrap">{new Date(r.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-2 text-slate-800 font-medium">{r.category?.name ?? '-'}</td>
                <td className="px-4 py-2 text-slate-600">{r.depot?.name ?? '-'}</td>
                <td className="px-4 py-2 text-right text-slate-700">{r.quantity_in}</td>
                <td className="px-4 py-2 text-right text-emerald-700">{r.quantity_repaired}</td>
                <td className="px-4 py-2 text-right text-rose-700">{r.quantity_scrapped}</td>
                <td className="px-4 py-2 text-right font-semibold text-amber-700">{remaining}</td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => onReport(r.id)}
                    className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-lg bg-teal-600 text-white hover:bg-teal-700"
                  >
                    <Wrench className="w-3 h-3" /> Raporto
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
        <div className={`p-3 rounded-xl ${tone}`}>{icon}</div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
        active
          ? 'text-teal-700'
          : 'text-slate-500 hover:text-slate-800'
      }`}
    >
      {icon}
      {label}
      <span
        className={`inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full text-[11px] font-semibold ${
          active ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-600'
        }`}
      >
        {count}
      </span>
      {active && (
        <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-teal-600 rounded-full" />
      )}
    </button>
  );
}

function ReportsTab({
  rows,
  search,
  setSearch,
  totalRepaired,
}: {
  rows: ProductSummary[];
  search: string;
  setSearch: (v: string) => void;
  totalRepaired: number;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center gap-3">
        <div className="w-7 h-7 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center">
          <TrendingUp className="w-4 h-4" />
        </div>
        <h3 className="text-sm font-semibold text-slate-900">Paleta te Reparuara sipas Produktit</h3>
        <div className="ml-auto relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Kerko produkt..."
            className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent w-48"
          />
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="p-12 text-center">
          <Package className="w-10 h-10 mx-auto mb-3 text-slate-300" />
          <p className="text-sm text-slate-400">Asnje raport reparimi i regjistruar.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/50">
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Produkti
                </th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">
                  Kategoria
                </th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Sasia (paleta)
                </th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">
                  % e totalit
                </th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Data e fundit
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((p) => {
                const pct = totalRepaired > 0 ? (p.total / totalRepaired) * 100 : 0;
                return (
                  <tr key={p.name} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center flex-shrink-0">
                          <Package className="w-4 h-4" />
                        </div>
                        <p className="text-sm font-semibold text-slate-900">{p.name}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500 hidden md:table-cell">
                      {p.category || '-'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-base font-bold text-teal-700">{p.total}</span>
                    </td>
                    <td className="px-6 py-4 text-right hidden sm:table-cell">
                      <div className="inline-flex items-center gap-2">
                        <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-teal-500 rounded-full"
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-500 font-medium tabular-nums">
                          {pct.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                        <Calendar className="w-3.5 h-3.5" />
                        {new Date(p.lastDate).toLocaleDateString()}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50">
                <td className="px-6 py-3 text-sm font-semibold text-slate-700" colSpan={2}>
                  Totali
                </td>
                <td className="px-6 py-3 text-right">
                  <span className="text-lg font-bold text-teal-700">{totalRepaired}</span>
                </td>
                <td className="px-6 py-3 hidden sm:table-cell" />
                <td className="px-6 py-3" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function DamagedTab({ rows }: { rows: DamagedStockRow[] }) {
  const total = rows.reduce((s, r) => s + r.quantity, 0);
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center gap-3">
        <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
          <AlertOctagon className="w-4 h-4" />
        </div>
        <h3 className="text-sm font-semibold text-slate-900">
          Paleta Defekte qe Presin Reparim
        </h3>
        <span className="ml-auto inline-flex items-center justify-center min-w-[24px] h-6 px-2 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
          {rows.length}
        </span>
      </div>
      {rows.length === 0 ? (
        <div className="p-12 text-center">
          <CheckCircle className="w-10 h-10 mx-auto mb-3 text-emerald-300" />
          <p className="text-sm text-slate-400">Nuk ka paleta defekte ne stok.</p>
        </div>
      ) : (
        <>
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {rows.map((r) => (
              <div
                key={r.id}
                className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 flex items-start gap-3"
              >
                <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
                  <Package className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {r.category?.name ?? '-'}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Defekt · per reparim
                  </p>
                  <p className="text-2xl font-bold text-amber-700 mt-2">{r.quantity}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Perditesuar: {new Date(r.updated_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
            <p className="text-sm text-slate-600">Totali ne pritje per reparim</p>
            <p className="text-lg font-bold text-amber-700">{total} paleta</p>
          </div>
        </>
      )}
    </div>
  );
}
