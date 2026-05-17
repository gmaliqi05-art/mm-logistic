import { useState, useEffect, useMemo } from 'react';
import {
  BarChart3,
  FileText,
  Package,
  Truck,
  Warehouse,
  AlertTriangle,
  TrendingUp,
  Download,
  Crown,
  Layers,
  Wrench,
  ArrowDownCircle,
  ArrowUpCircle,
  RefreshCw,
  Users,
  Sparkles,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { useTranslation } from '../../i18n';

type TabKey = 'summary' | 'stock' | 'movements' | 'sorting_repair' | 'partners' | 'financials';

interface StockRow {
  company_id: string;
  depot_id: string | null;
  depot_name: string | null;
  category_id: string | null;
  category_name: string | null;
  category_product_id: string | null;
  product_name: string | null;
  condition: string;
  quantity: number;
}

interface MovementRow {
  source_id: string;
  source_type: 'stock_movement' | 'sorting' | 'repair';
  movement_type: string;
  company_id: string;
  depot_id: string | null;
  category_id: string | null;
  category_product_id: string | null;
  condition: string | null;
  quantity_delta: number;
  flow_role: string | null;
  delivery_note_id: string | null;
  movement_date: string;
}

interface PartnerRow {
  partner_contact_id: string;
  partner_name: string;
  in_qty: number;
  out_qty: number;
  balance: number;
}

interface ScannedFinancialRow {
  id: string;
  note_number: string;
  partner_name: string | null;
  type: string;
  total: number;
  vat_amount: number;
  currency: string;
  scanned_at: string;
  line_items_count: number;
}

function exportToCsv(headers: string[], rows: string[][], filename: string) {
  const bom = '\uFEFF';
  const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${(c ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const CONDITION_LABELS: Record<string, string> = {
  good: 'E mire',
  damaged: 'Defekt',
  repaired: 'Riparuar',
  ready_a: 'Klasi A',
  ready_b: 'Klasi B',
  ready_c: 'Klasi C',
  sorting: 'Per sortim',
};

function conditionLabel(c: string | null | undefined): string {
  if (!c) return '—';
  return CONDITION_LABELS[c] ?? c;
}

export default function CompanyReports() {
  const { profile } = useAuth();
  const { canAccess } = useSubscription();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabKey>('summary');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [stockRows, setStockRows] = useState<StockRow[]>([]);
  const [movementRows, setMovementRows] = useState<MovementRow[]>([]);
  const [partnerRows, setPartnerRows] = useState<PartnerRow[]>([]);
  const [financialRows, setFinancialRows] = useState<ScannedFinancialRow[]>([]);
  const [depotCount, setDepotCount] = useState(0);
  const [driverCount, setDriverCount] = useState(0);
  const [noteStatusCounts, setNoteStatusCounts] = useState<Record<string, number>>({});
  const [dateFrom, setDateFrom] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [depotFilter, setDepotFilter] = useState<string>('all');
  const [depots, setDepots] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    if (profile?.company_id) fetchAll();
  }, [profile?.company_id, dateFrom, dateTo]);

  async function fetchAll() {
    if (!profile?.company_id) return;
    setLoading(true);
    setError(null);
    const companyId = profile.company_id;
    try {
      const fromIso = new Date(dateFrom + 'T00:00:00').toISOString();
      const toIso = new Date(dateTo + 'T23:59:59').toISOString();

      const [stockRes, movRes, depotsRes, driversRes, notesRes, flowsRes, contactsRes] = await Promise.all([
        supabase
          .from('v_company_stock_breakdown')
          .select('*')
          .eq('company_id', companyId),
        supabase
          .from('v_company_movements')
          .select('*')
          .eq('company_id', companyId)
          .gte('movement_date', fromIso)
          .lte('movement_date', toIso)
          .order('movement_date', { ascending: false })
          .limit(2000),
        supabase.from('depots').select('id, name').eq('company_id', companyId),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('role', 'driver'),
        supabase.from('delivery_notes').select('status').eq('company_id', companyId),
        supabase
          .from('partner_flow_events')
          .select('partner_contact_id, direction, quantity')
          .eq('company_id', companyId)
          .in('direction', ['in', 'out'])
          .gte('event_date', fromIso)
          .lte('event_date', toIso),
        supabase
          .from('acc_contacts')
          .select('id, name')
          .eq('company_id', companyId),
      ]);

      if (stockRes.error) throw stockRes.error;
      if (movRes.error) throw movRes.error;

      setStockRows((stockRes.data ?? []) as StockRow[]);
      setMovementRows((movRes.data ?? []) as MovementRow[]);
      setDepots(depotsRes.data ?? []);
      setDepotCount((depotsRes.data ?? []).length);
      setDriverCount(driversRes.count ?? 0);

      const statusMap: Record<string, number> = {};
      for (const n of (notesRes.data ?? []) as Array<{ status: string }>) {
        statusMap[n.status] = (statusMap[n.status] ?? 0) + 1;
      }
      setNoteStatusCounts(statusMap);

      const contactMap = new Map<string, string>();
      for (const c of (contactsRes.data ?? []) as Array<{ id: string; name: string }>) {
        contactMap.set(c.id, c.name);
      }
      const partnerAgg = new Map<string, PartnerRow>();
      for (const f of (flowsRes.data ?? []) as Array<{ partner_contact_id: string | null; direction: string; quantity: number }>) {
        if (!f.partner_contact_id) continue;
        const cur = partnerAgg.get(f.partner_contact_id) ?? {
          partner_contact_id: f.partner_contact_id,
          partner_name: contactMap.get(f.partner_contact_id) ?? '—',
          in_qty: 0,
          out_qty: 0,
          balance: 0,
        };
        if (f.direction === 'in') cur.in_qty += f.quantity;
        if (f.direction === 'out') cur.out_qty += f.quantity;
        cur.balance = cur.in_qty - cur.out_qty;
        partnerAgg.set(f.partner_contact_id, cur);
      }
      setPartnerRows(Array.from(partnerAgg.values()).sort((a, b) => (b.in_qty + b.out_qty) - (a.in_qty + a.out_qty)));

      const { data: scannedNotes } = await supabase
        .from('delivery_notes')
        .select('id, note_number, partner_name, type, ai_extracted_json, updated_at')
        .eq('company_id', companyId)
        .not('ai_extracted_json', 'is', null)
        .gte('updated_at', fromIso)
        .lte('updated_at', toIso)
        .order('updated_at', { ascending: false })
        .limit(500);
      const finRows: ScannedFinancialRow[] = [];
      for (const n of (scannedNotes ?? []) as Array<any>) {
        const ex = n.ai_extracted_json;
        if (!ex || (ex.total == null && (!ex.line_items || ex.line_items.length === 0))) continue;
        finRows.push({
          id: n.id,
          note_number: n.note_number,
          partner_name: n.partner_name,
          type: n.type,
          total: Number(ex.total) || 0,
          vat_amount: Number(ex.vat_amount) || 0,
          currency: ex.currency || 'EUR',
          scanned_at: n.updated_at,
          line_items_count: ex.line_items?.length || 0,
        });
      }
      setFinancialRows(finRows);
    } catch (err: any) {
      setError(err.message || t('common.errorLoading'));
    } finally {
      setLoading(false);
    }
  }

  const filteredStock = useMemo(() => {
    if (depotFilter === 'all') return stockRows;
    return stockRows.filter(r => r.depot_id === depotFilter);
  }, [stockRows, depotFilter]);

  const filteredMovements = useMemo(() => {
    if (depotFilter === 'all') return movementRows;
    return movementRows.filter(r => r.depot_id === depotFilter);
  }, [movementRows, depotFilter]);

  const totalStock = useMemo(
    () => filteredStock.reduce((s, r) => s + (r.quantity || 0), 0),
    [filteredStock],
  );

  const summary = useMemo(() => {
    let inQty = 0;
    let outQty = 0;
    let sortingQty = 0;
    let repairQty = 0;
    let internalQty = 0;
    for (const m of filteredMovements) {
      if (m.flow_role === 'internal_transfer') {
        internalQty += Math.abs(m.quantity_delta);
        continue;
      }
      if (m.source_type === 'sorting') sortingQty += m.quantity_delta;
      else if (m.source_type === 'repair') repairQty += m.quantity_delta;
      else if (m.movement_type === 'entry') inQty += m.quantity_delta;
      else if (m.movement_type === 'exit') outQty += Math.abs(m.quantity_delta);
    }
    return { inQty, outQty, sortingQty, repairQty, internalQty };
  }, [filteredMovements]);

  const stockByCategory = useMemo(() => {
    const map = new Map<string, { name: string; total: number; byProduct: Map<string, { name: string; byCondition: Record<string, number> }> }>();
    for (const r of filteredStock) {
      const catKey = r.category_id ?? 'none';
      const catName = r.category_name ?? 'Pa kategori';
      if (!map.has(catKey)) map.set(catKey, { name: catName, total: 0, byProduct: new Map() });
      const cat = map.get(catKey)!;
      cat.total += r.quantity;
      const prodKey = r.category_product_id ?? 'none';
      const prodName = r.product_name ?? '—';
      if (!cat.byProduct.has(prodKey)) cat.byProduct.set(prodKey, { name: prodName, byCondition: {} });
      const prod = cat.byProduct.get(prodKey)!;
      prod.byCondition[r.condition] = (prod.byCondition[r.condition] ?? 0) + r.quantity;
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [filteredStock]);

  const stockByDepot = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filteredStock) {
      if (!r.depot_id) continue;
      map.set(r.depot_name ?? r.depot_id, (map.get(r.depot_name ?? r.depot_id) ?? 0) + r.quantity);
    }
    return Array.from(map.entries()).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);
  }, [filteredStock]);

  const maxStockByDepot = Math.max(...stockByDepot.map(d => d.total), 1);

  const tabs: Array<{ key: TabKey; label: string; icon: typeof FileText }> = [
    { key: 'summary', label: 'Permbledhje', icon: BarChart3 },
    { key: 'stock', label: 'Stoku', icon: Package },
    { key: 'movements', label: 'Levizjet', icon: TrendingUp },
    { key: 'sorting_repair', label: 'Sortim & Riparim', icon: Wrench },
    { key: 'partners', label: 'Partneret', icon: Users },
    { key: 'financials', label: 'Financat (AI)', icon: Sparkles },
  ];

  function exportActiveTab() {
    if (activeTab === 'stock') {
      const headers = ['Kategoria', 'Produkti', 'Gjendja', 'Depoja', 'Sasia'];
      const rows = filteredStock.map(r => [
        r.category_name ?? '',
        r.product_name ?? '',
        conditionLabel(r.condition),
        r.depot_name ?? '',
        String(r.quantity),
      ]);
      exportToCsv(headers, rows, 'stoku_kompanise');
    } else if (activeTab === 'movements') {
      const headers = ['Data', 'Burimi', 'Tipi', 'Sasi', 'Gjendja', 'Depoja', 'Flow'];
      const rows = filteredMovements.map(r => [
        new Date(r.movement_date).toLocaleString(),
        r.source_type,
        r.movement_type,
        String(r.quantity_delta),
        conditionLabel(r.condition),
        depots.find(d => d.id === r.depot_id)?.name ?? '',
        r.flow_role ?? '',
      ]);
      exportToCsv(headers, rows, 'levizjet_kompanise');
    } else if (activeTab === 'partners') {
      const headers = ['Partneri', 'Hyrje', 'Dalje', 'Balanca'];
      const rows = partnerRows.map(r => [r.partner_name, String(r.in_qty), String(r.out_qty), String(r.balance)]);
      exportToCsv(headers, rows, 'partneret');
    } else if (activeTab === 'financials') {
      const headers = ['Nr. Dok', 'Partneri', 'Tipi', 'Totali', 'TVSH', 'Monedha', 'Data', 'Artikuj'];
      const rows = financialRows.map(r => [
        r.note_number,
        r.partner_name ?? '',
        r.type === 'pickup' ? 'Marrje' : 'Dergese',
        r.total.toFixed(2),
        r.vat_amount.toFixed(2),
        r.currency,
        new Date(r.scanned_at).toLocaleDateString(),
        String(r.line_items_count),
      ]);
      exportToCsv(headers, rows, 'financat_skanimet');
    }
  }

  if (loading && stockRows.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-3" />
        <p className="text-red-700 font-medium">{error}</p>
        <button onClick={fetchAll} className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">
          {t('common.tryAgain')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Raportet e Kompanise</h1>
          <p className="text-gray-500 mt-1">Stoku, levizjet, sortimi dhe riparimi — vetem per kompanine tuaj.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg"
          />
          <span className="text-gray-400 text-sm">—</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg"
          />
          <select
            value={depotFilter}
            onChange={e => setDepotFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg"
          >
            <option value="all">Te gjitha depot</option>
            {depots.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <button
            onClick={fetchAll}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <RefreshCw className="w-4 h-4" /> Rifresko
          </button>
          {canAccess('advanced_reports') ? (
            <button
              onClick={exportActiveTab}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-teal-700 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100"
            >
              <Download className="w-4 h-4" /> Eksporto CSV
            </button>
          ) : (
            <div className="inline-flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
              <Crown className="w-4 h-4" /> Eksport premium
            </div>
          )}
        </div>
      </div>

      <div className="border-b border-gray-200 flex flex-wrap gap-1">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                active ? 'border-teal-600 text-teal-700' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="w-4 h-4" /> {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'summary' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={Package} color="bg-emerald-500" label="Stoku aktual" value={totalStock} />
            <StatCard icon={ArrowDownCircle} color="bg-teal-500" label="Hyrje (periudha)" value={summary.inQty} />
            <StatCard icon={ArrowUpCircle} color="bg-rose-500" label="Dalje (periudha)" value={summary.outQty} />
            <StatCard icon={Layers} color="bg-cyan-500" label="Transferte interne" value={summary.internalQty} />
            <StatCard icon={RefreshCw} color="bg-blue-500" label="Sortim" value={summary.sortingQty} />
            <StatCard icon={Wrench} color="bg-amber-500" label="Riparim" value={summary.repairQty} />
            <StatCard icon={Warehouse} color="bg-teal-600" label="Depot" value={depotCount} />
            <StatCard icon={Truck} color="bg-slate-600" label="Shofere" value={driverCount} />
          </div>

          <Card title="Stoku sipas depos" icon={Package}>
            {stockByDepot.length === 0 ? (
              <EmptyState icon={Warehouse} label="Pa te dhena stoku." />
            ) : (
              <div className="space-y-3">
                {stockByDepot.map(d => {
                  const pct = (d.total / maxStockByDepot) * 100;
                  return (
                    <div key={d.name}>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm text-gray-700">{d.name}</span>
                        <span className="text-sm font-semibold text-gray-900">{d.total}</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-3">
                        <div className="bg-teal-500 h-3 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card title="Fletedokumente sipas statusit" icon={FileText}>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {Object.entries(noteStatusCounts).map(([status, count]) => (
                <div key={status} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-gray-500">{status}</p>
                  <p className="text-xl font-bold text-gray-900">{count}</p>
                </div>
              ))}
              {Object.keys(noteStatusCounts).length === 0 && (
                <p className="text-sm text-gray-400 col-span-full">Pa fletedokumente.</p>
              )}
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'stock' && (
        <Card title="Stoku i kompanise" icon={Package}>
          {stockByCategory.length === 0 ? (
            <EmptyState icon={Package} label="Nuk ka stok ne kete filter." />
          ) : (
            <div className="space-y-4">
              {stockByCategory.map(cat => (
                <div key={cat.name} className="border border-gray-100 rounded-xl overflow-hidden">
                  <div className="bg-gray-50 px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-gray-500" />
                      <p className="font-semibold text-gray-900">{cat.name}</p>
                    </div>
                    <span className="text-sm font-bold text-teal-700">{cat.total}</span>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {Array.from(cat.byProduct.values()).sort((a, b) => {
                      const ta = Object.values(a.byCondition).reduce((x, y) => x + y, 0);
                      const tb = Object.values(b.byCondition).reduce((x, y) => x + y, 0);
                      return tb - ta;
                    }).map((p, i) => {
                      const total = Object.values(p.byCondition).reduce((x, y) => x + y, 0);
                      return (
                        <div key={i} className="px-4 py-2.5 flex items-center justify-between gap-3">
                          <p className="text-sm text-gray-800 min-w-0 truncate">{p.name}</p>
                          <div className="flex items-center gap-2 flex-wrap justify-end">
                            {Object.entries(p.byCondition).map(([cond, qty]) => (
                              <span key={cond} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-xs text-gray-700">
                                {conditionLabel(cond)}: <span className="font-semibold">{qty}</span>
                              </span>
                            ))}
                            <span className="text-sm font-bold text-gray-900 ml-2">{total}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {activeTab === 'movements' && (
        <Card title="Levizjet e kompanise" icon={TrendingUp}>
          {filteredMovements.length === 0 ? (
            <EmptyState icon={TrendingUp} label="Asnje levizje ne kete periudhe." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 uppercase text-[10px] tracking-wide">
                  <tr>
                    <th className="text-left px-3 py-2">Data</th>
                    <th className="text-left px-3 py-2">Burimi</th>
                    <th className="text-left px-3 py-2">Tipi</th>
                    <th className="text-left px-3 py-2">Gjendja</th>
                    <th className="text-left px-3 py-2">Depoja</th>
                    <th className="text-right px-3 py-2">Sasi</th>
                    <th className="text-left px-3 py-2">Flow</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredMovements.slice(0, 500).map(m => (
                    <tr key={`${m.source_type}-${m.source_id}`} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{new Date(m.movement_date).toLocaleString()}</td>
                      <td className="px-3 py-2">
                        <SourceBadge type={m.source_type} />
                      </td>
                      <td className="px-3 py-2 text-gray-700">{m.movement_type}</td>
                      <td className="px-3 py-2 text-gray-700">{conditionLabel(m.condition)}</td>
                      <td className="px-3 py-2 text-gray-700">{depots.find(d => d.id === m.depot_id)?.name ?? '—'}</td>
                      <td className={`px-3 py-2 text-right font-semibold ${m.quantity_delta < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {m.quantity_delta > 0 ? '+' : ''}{m.quantity_delta}
                      </td>
                      <td className="px-3 py-2">
                        {m.flow_role === 'internal_transfer' ? (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-100 text-cyan-800">Interne</span>
                        ) : (
                          <span className="text-gray-400 text-xs">{m.flow_role ?? '—'}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredMovements.length > 500 && (
                <p className="text-xs text-gray-400 mt-3 text-center">Po shfaqen 500 rreshtat me te fundit. Ngushtoni intervalin per me shume detaje.</p>
              )}
            </div>
          )}
        </Card>
      )}

      {activeTab === 'sorting_repair' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card title="Sortimi" icon={Layers}>
            <SortingOrRepairTable rows={filteredMovements.filter(m => m.source_type === 'sorting')} depots={depots} />
          </Card>
          <Card title="Riparimi" icon={Wrench}>
            <SortingOrRepairTable rows={filteredMovements.filter(m => m.source_type === 'repair')} depots={depots} />
          </Card>
        </div>
      )}

      {activeTab === 'partners' && (
        <Card title="Permbledhje e partnereve" icon={Users} hint="Transfertat interne jane te perjashtuara. Kliko nje partner per kartele te plote.">
          {partnerRows.length === 0 ? (
            <EmptyState icon={Users} label="Pa levizje me partneret ne kete periudhe." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 uppercase text-[10px] tracking-wide">
                  <tr>
                    <th className="text-left px-3 py-2">Partneri</th>
                    <th className="text-right px-3 py-2">Hyrje</th>
                    <th className="text-right px-3 py-2">Dalje</th>
                    <th className="text-right px-3 py-2">Balanca</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {partnerRows.map(p => (
                    <tr key={p.partner_contact_id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-900">{p.partner_name}</td>
                      <td className="px-3 py-2 text-right text-emerald-600">{p.in_qty}</td>
                      <td className="px-3 py-2 text-right text-rose-600">{p.out_qty}</td>
                      <td className={`px-3 py-2 text-right font-bold ${p.balance >= 0 ? 'text-gray-900' : 'text-rose-600'}`}>
                        {p.balance > 0 ? '+' : ''}{p.balance}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {activeTab === 'financials' && (
        <FinancialsTab rows={financialRows} />
      )}
    </div>
  );
}

function FinancialsTab({ rows }: { rows: ScannedFinancialRow[] }) {
  const totalAmount = rows.reduce((s, r) => s + r.total, 0);
  const totalVat = rows.reduce((s, r) => s + r.vat_amount, 0);
  const inRows = rows.filter(r => r.type === 'pickup');
  const outRows = rows.filter(r => r.type !== 'pickup');
  const inTotal = inRows.reduce((s, r) => s + r.total, 0);
  const outTotal = outRows.reduce((s, r) => s + r.total, 0);

  const byPartner = useMemo(() => {
    const map = new Map<string, { name: string; total: number; count: number }>();
    for (const r of rows) {
      const name = r.partner_name || '(Pa partner)';
      const cur = map.get(name) ?? { name, total: 0, count: 0 };
      cur.total += r.total;
      cur.count += 1;
      map.set(name, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [rows]);

  if (rows.length === 0) {
    return (
      <Card title="Financat nga skanimet AI" icon={Sparkles}>
        <EmptyState icon={Sparkles} label="Asnje dokument i skanuar me te dhena financiare ne kete periudhe." />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs text-gray-500">Totali i skanuar</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{totalAmount.toFixed(2)} EUR</p>
          <p className="text-xs text-gray-400 mt-1">{rows.length} dokumente</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs text-gray-500">TVSH totale</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{totalVat.toFixed(2)} EUR</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs text-gray-500">Marrje (hyrje)</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1">{inTotal.toFixed(2)} EUR</p>
          <p className="text-xs text-gray-400 mt-1">{inRows.length} dokumente</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs text-gray-500">Dergese (dalje)</p>
          <p className="text-2xl font-bold text-rose-700 mt-1">{outTotal.toFixed(2)} EUR</p>
          <p className="text-xs text-gray-400 mt-1">{outRows.length} dokumente</p>
        </div>
      </div>

      {byPartner.length > 0 && (
        <Card title="Top partneret sipas vleres" icon={Users}>
          <div className="space-y-2">
            {byPartner.map((p, i) => {
              const pct = totalAmount > 0 ? (p.total / totalAmount) * 100 : 0;
              return (
                <div key={i} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                      <p className="text-sm font-bold text-gray-900 flex-shrink-0 ml-2">{p.total.toFixed(2)} EUR</p>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-teal-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <span className="text-xs text-gray-400 flex-shrink-0">{p.count}x</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card title="Dokumentet e skanuara" icon={FileText} hint="Te dhena te nxjerra automatikisht nga AI">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 uppercase text-[10px] tracking-wide">
              <tr>
                <th className="text-left px-3 py-2">Nr. Dok</th>
                <th className="text-left px-3 py-2">Partneri</th>
                <th className="text-left px-3 py-2">Tipi</th>
                <th className="text-right px-3 py-2">Totali</th>
                <th className="text-right px-3 py-2">TVSH</th>
                <th className="text-right px-3 py-2">Artikuj</th>
                <th className="text-right px-3 py-2">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.slice(0, 100).map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-xs text-gray-800">{r.note_number}</td>
                  <td className="px-3 py-2 text-gray-900 truncate max-w-[160px]">{r.partner_name || '—'}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${r.type === 'pickup' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}`}>
                      {r.type === 'pickup' ? 'Marrje' : 'Dergese'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-gray-900">{r.total.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{r.vat_amount > 0 ? r.vat_amount.toFixed(2) : '—'}</td>
                  <td className="px-3 py-2 text-right text-gray-500">{r.line_items_count}</td>
                  <td className="px-3 py-2 text-right text-gray-500 text-xs">{new Date(r.scanned_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function StatCard({ icon: Icon, color, label, value }: { icon: typeof FileText; color: string; label: string; value: number }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-gray-500 truncate">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value.toLocaleString()}</p>
        </div>
        <div className={`${color} p-2.5 rounded-xl`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
    </div>
  );
}

function Card({ title, icon: Icon, children, hint }: { title: string; icon: typeof FileText; children: React.ReactNode; hint?: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="p-4 md:p-6 border-b border-gray-100 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className="w-5 h-5 text-teal-600" />
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        </div>
        {hint && <p className="text-xs text-gray-400 hidden sm:block">{hint}</p>}
      </div>
      <div className="p-4 md:p-6">{children}</div>
    </div>
  );
}

function EmptyState({ icon: Icon, label }: { icon: typeof FileText; label: string }) {
  return (
    <div className="text-center py-8">
      <Icon className="w-9 h-9 text-gray-300 mx-auto mb-2" />
      <p className="text-sm text-gray-400">{label}</p>
    </div>
  );
}

function SourceBadge({ type }: { type: 'stock_movement' | 'sorting' | 'repair' }) {
  const map = {
    stock_movement: { label: 'Dergese', cls: 'bg-teal-100 text-teal-800' },
    sorting: { label: 'Sortim', cls: 'bg-blue-100 text-blue-800' },
    repair: { label: 'Riparim', cls: 'bg-amber-100 text-amber-800' },
  };
  const cfg = map[type];
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.cls}`}>{cfg.label}</span>;
}

function SortingOrRepairTable({ rows, depots }: { rows: MovementRow[]; depots: Array<{ id: string; name: string }> }) {
  if (rows.length === 0) return <EmptyState icon={Layers} label="Pa te dhena ne kete periudhe." />;
  const total = rows.reduce((s, r) => s + r.quantity_delta, 0);
  return (
    <div>
      <div className="flex items-center justify-between mb-3 p-3 bg-gray-50 rounded-lg">
        <span className="text-sm text-gray-600">Totali</span>
        <span className="text-xl font-bold text-gray-900">{total}</span>
      </div>
      <div className="space-y-1 max-h-72 overflow-y-auto">
        {rows.slice(0, 200).map(r => (
          <div key={r.source_id} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-50 text-xs">
            <div>
              <p className="text-gray-700">{new Date(r.movement_date).toLocaleDateString()}</p>
              <p className="text-gray-400">{depots.find(d => d.id === r.depot_id)?.name ?? '—'}</p>
            </div>
            <span className="font-semibold text-emerald-600">+{r.quantity_delta}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
