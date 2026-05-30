import { useState, useEffect, useMemo } from 'react';
import {
  Layers,
  Loader2,
  ChevronDown,
  ChevronRight,
  Package,
  Wrench,
  Calendar,
  Users,
  Filter,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { logger } from '../../utils/logger';

interface SortingItem {
  category_product_id: string | null;
  quantity: number;
  condition: string;
}

interface BatchRow {
  id: string;
  category_id: string;
  category_name: string;
  total_received: number;
  completed_at: string;
  reference_number_snapshot: string | null;
  report_sent_at: string | null;
  partner_name: string | null;
  worker_name: string | null;
  items: SortingItem[];
}

interface ProductName {
  id: string;
  name: string;
}

const CONDITION_LABELS: Record<string, string> = {
  good: 'I mire',
  damaged: 'Defekt',
  ready_a: 'A Klasse',
  ready_b: 'B Klasse',
  ready_c: 'C Klasse',
  sorting: 'Per sortim',
  repaired: 'I riparuar',
};

const CONDITION_TONE: Record<string, string> = {
  good: 'bg-emerald-50 text-emerald-700',
  damaged: 'bg-red-50 text-red-700',
  ready_a: 'bg-blue-50 text-blue-700',
  ready_b: 'bg-sky-50 text-sky-700',
  ready_c: 'bg-amber-50 text-amber-700',
  sorting: 'bg-teal-50 text-teal-700',
  repaired: 'bg-green-50 text-green-700',
};

export default function SortingReports() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [productNames, setProductNames] = useState<ProductName[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [partnerFilter, setPartnerFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    if (profile?.company_id) fetchData();
  }, [profile?.company_id]);

  async function fetchData() {
    try {
      setLoading(true);
      const companyId = profile!.company_id!;

      const [batchRes, prodRes] = await Promise.all([
        supabase
          .from('pallet_sorting_batches')
          .select(`
            id, category_id, total_received, completed_at, reference_number_snapshot, report_sent_at,
            created_by, completed_by,
            category:product_categories!inner(name),
            creator:profiles!pallet_sorting_batches_created_by_fkey(full_name, role),
            completer:profiles!pallet_sorting_batches_completed_by_fkey(full_name, role),
            items:pallet_sorting_items(category_product_id, quantity, condition),
            delivery_note:delivery_notes!pallet_sorting_batches_source_delivery_note_id_fkey(
              counterparty_name, partner_name
            )
          `)
          .eq('company_id', companyId)
          .eq('status', 'completed')
          .order('completed_at', { ascending: false })
          .limit(100),
        supabase
          .from('category_products')
          .select('id, name')
          .eq('company_id', companyId),
      ]);

      if (batchRes.error) throw batchRes.error;

      const rows: BatchRow[] = ((batchRes.data as any[]) ?? []).map((b) => ({
        id: b.id,
        category_id: b.category_id,
        category_name: (b.category as any)?.name || '-',
        total_received: b.total_received,
        completed_at: b.completed_at,
        reference_number_snapshot: b.reference_number_snapshot,
        report_sent_at: b.report_sent_at,
        partner_name: (b.delivery_note as any)?.counterparty_name || (b.delivery_note as any)?.partner_name || null,
        worker_name: ((b.completer as any)?.role !== 'driver' ? (b.completer as any)?.full_name : null)
          || ((b.creator as any)?.role !== 'driver' ? (b.creator as any)?.full_name : null)
          || null,
        items: (b.items as SortingItem[]) ?? [],
      }));

      setBatches(rows);
      setProductNames((prodRes.data ?? []) as ProductName[]);
    } catch (err) {
      logger.error('Failed to load sorting reports', err);
    } finally {
      setLoading(false);
    }
  }

  const productMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of productNames) m.set(p.id, p.name);
    return m;
  }, [productNames]);

  const partners = useMemo(() => {
    const set = new Set<string>();
    for (const b of batches) {
      if (b.partner_name) set.add(b.partner_name);
    }
    return Array.from(set).sort();
  }, [batches]);

  const filtered = useMemo(() => {
    let result = batches;
    if (partnerFilter) {
      result = result.filter((b) => b.partner_name === partnerFilter);
    }
    if (dateFrom) {
      result = result.filter((b) => b.completed_at >= dateFrom);
    }
    if (dateTo) {
      const end = dateTo + 'T23:59:59';
      result = result.filter((b) => b.completed_at <= end);
    }
    return result;
  }, [batches, partnerFilter, dateFrom, dateTo]);

  const totals = useMemo(() => {
    let totalReceived = 0;
    const byCondition: Record<string, number> = {};
    for (const b of filtered) {
      totalReceived += b.total_received;
      for (const item of b.items) {
        if (item.quantity > 0) {
          byCondition[item.condition] = (byCondition[item.condition] || 0) + item.quantity;
        }
      }
    }
    return { totalReceived, byCondition };
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
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Layers className="w-6 h-6 text-teal-600" />
          Raportet e Sortimit
        </h1>
        <p className="text-gray-500 mt-1 text-sm">
          Shiko rezultatet e klasifikimit per cdo ngarkes nga furnitoret
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-100 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-gray-500" />
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Filtro</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              <Users className="w-3 h-3 inline mr-1" />Partneri / Furnitori
            </label>
            <select
              value={partnerFilter}
              onChange={(e) => setPartnerFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="">Te gjithe</option>
              {partners.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              <Calendar className="w-3 h-3 inline mr-1" />Nga data
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              <Calendar className="w-3 h-3 inline mr-1" />Deri me
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Ngarkesa</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{filtered.length}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Total marre</p>
          <p className="text-2xl font-bold text-teal-700 mt-1">{totals.totalReceived}</p>
        </div>
        {Object.entries(totals.byCondition)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 2)
          .map(([cond, qty]) => (
            <div key={cond} className="bg-white border border-gray-100 rounded-xl p-4">
              <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">
                {CONDITION_LABELS[cond] || cond}
              </p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{qty}</p>
            </div>
          ))}
      </div>

      {/* Batches list */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-xl p-12 text-center">
          <Layers className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Asnje raport sortimi per keto filtra</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((b) => {
            const expanded = expandedId === b.id;
            const sortedTotal = b.items.reduce((s, i) => s + i.quantity, 0);
            return (
              <div key={b.id} className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : b.id)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="w-9 h-9 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center flex-shrink-0">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900 truncate">{b.category_name}</p>
                      {b.reference_number_snapshot && (
                        <span className="text-[11px] px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full font-medium">
                          {b.reference_number_snapshot}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      {b.partner_name && (
                        <span className="text-xs text-gray-500">{b.partner_name}</span>
                      )}
                      {b.worker_name && (
                        <span className="text-xs text-gray-500">Punetori: {b.worker_name}</span>
                      )}
                      <span className="text-xs text-gray-400">
                        {new Date(b.completed_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="text-right mr-2">
                    <p className="text-lg font-bold text-teal-700">{sortedTotal}</p>
                    <p className="text-[11px] text-gray-400">/ {b.total_received}</p>
                  </div>
                  {expanded ? (
                    <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  )}
                </button>

                {expanded && (
                  <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/50">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                          <th className="text-left pb-2">Produkti</th>
                          <th className="text-right pb-2 w-20">Sasia</th>
                          <th className="text-right pb-2 w-28">Klasa</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {b.items
                          .filter((i) => i.quantity > 0)
                          .sort((a, c) => {
                            const na = a.category_product_id
                              ? productMap.get(a.category_product_id) || ''
                              : 'Defekt';
                            const nc = c.category_product_id
                              ? productMap.get(c.category_product_id) || ''
                              : 'Defekt';
                            return na.localeCompare(nc);
                          })
                          .map((item, idx) => (
                            <tr key={idx} className="hover:bg-white">
                              <td className="py-2 flex items-center gap-2">
                                {item.condition === 'damaged' ? (
                                  <Wrench className="w-3.5 h-3.5 text-red-500" />
                                ) : (
                                  <Package className="w-3.5 h-3.5 text-teal-500" />
                                )}
                                <span className="font-medium text-gray-900">
                                  {item.category_product_id
                                    ? productMap.get(item.category_product_id) || '-'
                                    : 'Defekt'}
                                </span>
                              </td>
                              <td className="py-2 text-right font-bold text-gray-900">
                                {item.quantity}
                              </td>
                              <td className="py-2 text-right">
                                <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${CONDITION_TONE[item.condition] || 'bg-gray-100 text-gray-600'}`}>
                                  {CONDITION_LABELS[item.condition] || item.condition}
                                </span>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                    {b.items.filter((i) => i.quantity > 0).length === 0 && (
                      <p className="text-center text-gray-400 text-sm py-4">Asnje artikull i regjistruar</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
