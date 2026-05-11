import { useState, useEffect, useMemo } from 'react';
import {
  Package,
  AlertTriangle,
  X,
  Loader2,
  Plus,
  ArrowUpCircle,
  ArrowDownCircle,
  Wrench,
  Clock,
  ScanLine,
  Tag,
  ChevronDown,
  ChevronRight,
  Search,
  Download,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import type { StockMovement, ProductCategory } from '../../types';
import { compareCategoriesByPriority } from '../../utils/productSort';
import PalletScanner from '../../components/scanner/PalletScanner';

interface StockValueRow {
  company_id: string;
  depot_id: string;
  depot_name: string | null;
  category_id: string;
  category_name: string | null;
  category_product_id: string | null;
  product_name: string | null;
  condition: string;
  quantity: number;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [keys.join(','), ...rows.map((r) => keys.map((k) => escape(r[k])).join(','))].join('\n');
}

function downloadCsv(name: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const CONDITIONS: Array<{ key: string; label: string; className: string }> = [
  { key: 'good', label: 'Te mira', className: 'bg-emerald-100 text-emerald-700' },
  { key: 'damaged', label: 'Te demtuara', className: 'bg-rose-100 text-rose-700' },
  { key: 'repaired', label: 'Te reparuara', className: 'bg-amber-100 text-amber-700' },
  { key: 'sorting', label: 'Ne sortim', className: 'bg-teal-100 text-teal-700' },
  { key: 'sorting_pending', label: 'Pritje sortim', className: 'bg-slate-100 text-slate-700' },
  { key: 'ready_a', label: 'Klasa A', className: 'bg-emerald-100 text-emerald-700' },
  { key: 'ready_b', label: 'Klasa B', className: 'bg-lime-100 text-lime-700' },
  { key: 'ready_c', label: 'Klasa C', className: 'bg-yellow-100 text-yellow-700' },
];

const conditionConfig: Record<string, { label: string; className: string }> = Object.fromEntries(
  CONDITIONS.map((c) => [c.key, { label: c.label, className: c.className }]),
);

export default function DepotStock() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [rows, setRows] = useState<StockValueRow[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [formType, setFormType] = useState<'entry' | 'exit' | 'repair'>('entry');
  const [formCategory, setFormCategory] = useState('');
  const [formQuantity, setFormQuantity] = useState('');
  const [formConditionBefore, setFormConditionBefore] = useState('damaged');
  const [formConditionAfter, setFormConditionAfter] = useState('good');
  const [formNotes, setFormNotes] = useState('');
  const [showScanner, setShowScanner] = useState(false);

  const [filterCondition, setFilterCondition] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (profile?.depot_id && profile?.company_id) void fetchAll();
  }, [profile?.depot_id, profile?.company_id]);

  const movementConfig: Record<string, { label: string; className: string; icon: typeof ArrowUpCircle }> = {
    entry: { label: t('depot.stock.entry'), className: 'bg-emerald-100 text-emerald-700', icon: ArrowUpCircle },
    exit: { label: t('depot.stock.exit'), className: 'bg-rose-100 text-rose-700', icon: ArrowDownCircle },
    repair: { label: t('depot.stock.repair'), className: 'bg-amber-100 text-amber-700', icon: Wrench },
    scrap: { label: 'Scrap', className: 'bg-slate-100 text-slate-700', icon: Package },
    sort_in: { label: 'Sortim', className: 'bg-teal-100 text-teal-700', icon: Package },
  };

  async function fetchAll() {
    try {
      setLoading(true);
      setError(null);
      const depotId = profile!.depot_id!;
      const companyId = profile!.company_id!;

      const [stockRes, movementRes, catRes] = await Promise.all([
        supabase
          .from('v_depot_stock_value')
          .select('company_id, depot_id, depot_name, category_id, category_name, category_product_id, product_name, condition, quantity')
          .eq('depot_id', depotId)
          .eq('company_id', companyId),
        supabase
          .from('stock_movements')
          .select('*, category:product_categories(id, name), product:category_products(id, name), performer:profiles!stock_movements_performed_by_fkey(full_name)')
          .eq('depot_id', depotId)
          .eq('company_id', companyId)
          .order('created_at', { ascending: false })
          .limit(30),
        supabase.from('product_categories').select('*').eq('company_id', companyId),
      ]);

      if (stockRes.error) throw stockRes.error;
      if (movementRes.error) throw movementRes.error;
      if (catRes.error) throw catRes.error;

      setRows(((stockRes.data ?? []) as StockValueRow[]).filter((r) => r.quantity > 0));
      setMovements((movementRes.data ?? []) as unknown as StockMovement[]);
      setCategories((catRes.data ?? []) as ProductCategory[]);
    } catch (err) {
      setError((err as Error).message || t('common.errorLoading'));
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filterCondition && r.condition !== filterCondition) return false;
      if (filterCategory && r.category_id !== filterCategory) return false;
      if (q) {
        const hay = `${r.category_name ?? ''} ${r.product_name ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filterCondition, filterCategory, search]);

  const totals = useMemo(() => {
    let qty = 0;
    const byCond: Record<string, number> = {};
    for (const r of filtered) {
      qty += r.quantity;
      byCond[r.condition] = (byCond[r.condition] ?? 0) + r.quantity;
    }
    return { qty, byCond };
  }, [filtered]);

  const grouped = useMemo(() => {
    const map = new Map<string, {
      categoryId: string;
      categoryName: string;
      totalQty: number;
      products: Map<string, { productId: string; productName: string; rows: StockValueRow[]; qty: number }>;
    }>();
    for (const r of filtered) {
      if (!map.has(r.category_id)) {
        map.set(r.category_id, {
          categoryId: r.category_id,
          categoryName: r.category_name ?? 'Pa kategori',
          totalQty: 0,
          products: new Map(),
        });
      }
      const g = map.get(r.category_id)!;
      g.totalQty += r.quantity;
      const pKey = r.category_product_id ?? '__none__';
      if (!g.products.has(pKey)) {
        g.products.set(pKey, {
          productId: pKey,
          productName: r.product_name ?? '—',
          rows: [],
          qty: 0,
        });
      }
      const p = g.products.get(pKey)!;
      p.rows.push(r);
      p.qty += r.quantity;
    }
    return Array.from(map.values())
      .map((g) => ({ ...g, products: Array.from(g.products.values()).sort((a, b) => a.productName.localeCompare(b.productName)) }))
      .sort((a, b) => compareCategoriesByPriority(a.categoryName, b.categoryName));
  }, [filtered]);

  const sortedCategories = useMemo(
    () => categories.slice().sort((a, b) => compareCategoriesByPriority(a.name, b.name)),
    [categories],
  );

  async function handleSubmitMovement(e: React.FormEvent) {
    e.preventDefault();
    if (!formCategory || !formQuantity || submitting) return;
    try {
      setSubmitting(true);
      setError(null);
      const depotId = profile!.depot_id!;
      const companyId = profile!.company_id!;
      const qty = parseInt(formQuantity, 10);
      if (isNaN(qty) || qty <= 0) {
        setError('Sasia duhet te jete pozitive');
        return;
      }

      const condBefore = formType === 'repair' ? formConditionBefore : formType === 'exit' ? formConditionAfter : 'good';
      const { error: movErr } = await supabase.from('stock_movements').insert({
        company_id: companyId,
        depot_id: depotId,
        category_id: formCategory,
        movement_type: formType,
        quantity: qty,
        condition_before: condBefore,
        condition_after: formConditionAfter,
        notes: formNotes,
        performed_by: profile!.id,
      });
      if (movErr) throw movErr;

      if (formType === 'entry') {
        const existing = await supabase
          .from('stock')
          .select('id, quantity')
          .eq('depot_id', depotId)
          .eq('company_id', companyId)
          .eq('category_id', formCategory)
          .eq('condition', formConditionAfter)
          .maybeSingle();
        if (existing.data) {
          await supabase
            .from('stock')
            .update({ quantity: (existing.data.quantity ?? 0) + qty, updated_at: new Date().toISOString() })
            .eq('id', existing.data.id);
        } else {
          await supabase.from('stock').insert({
            company_id: companyId,
            depot_id: depotId,
            category_id: formCategory,
            quantity: qty,
            condition: formConditionAfter,
          });
        }
      } else if (formType === 'exit') {
        const existing = await supabase
          .from('stock')
          .select('id, quantity')
          .eq('depot_id', depotId)
          .eq('company_id', companyId)
          .eq('category_id', formCategory)
          .eq('condition', formConditionAfter)
          .maybeSingle();
        if (!existing.data || (existing.data.quantity ?? 0) < qty) {
          setError('Stok i pamjaftueshem per kete levizje.');
          return;
        }
        await supabase
          .from('stock')
          .update({ quantity: Math.max(0, (existing.data.quantity ?? 0) - qty), updated_at: new Date().toISOString() })
          .eq('id', existing.data.id);
      } else if (formType === 'repair') {
        const damaged = await supabase
          .from('stock')
          .select('id, quantity')
          .eq('depot_id', depotId)
          .eq('company_id', companyId)
          .eq('category_id', formCategory)
          .eq('condition', formConditionBefore)
          .maybeSingle();
        if (damaged.data) {
          await supabase
            .from('stock')
            .update({ quantity: Math.max(0, (damaged.data.quantity ?? 0) - qty), updated_at: new Date().toISOString() })
            .eq('id', damaged.data.id);
        }
        const repaired = await supabase
          .from('stock')
          .select('id, quantity')
          .eq('depot_id', depotId)
          .eq('company_id', companyId)
          .eq('category_id', formCategory)
          .eq('condition', formConditionAfter)
          .maybeSingle();
        if (repaired.data) {
          await supabase
            .from('stock')
            .update({ quantity: (repaired.data.quantity ?? 0) + qty, updated_at: new Date().toISOString() })
            .eq('id', repaired.data.id);
        } else {
          await supabase.from('stock').insert({
            company_id: companyId,
            depot_id: depotId,
            category_id: formCategory,
            quantity: qty,
            condition: formConditionAfter,
          });
        }
      }

      setFormCategory('');
      setFormQuantity('');
      setFormConditionBefore('damaged');
      setFormConditionAfter('good');
      setFormNotes('');
      setShowForm(false);
      await fetchAll();
    } catch (err) {
      setError((err as Error).message || t('common.errorSaving'));
    } finally {
      setSubmitting(false);
    }
  }

  const handleScan = (code: string) => {
    const match = categories.find(
      (c) =>
        c.name?.toLowerCase() === code.toLowerCase() ||
        (c as unknown as { aliases?: string[] }).aliases?.includes?.(code),
    );
    if (match) {
      setFormCategory(match.id);
      setShowForm(true);
    } else {
      setError(`Kodi "${code}" nuk u perputh me asnje kategori`);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-10 h-10 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-gray-900">{t('depot.stock.title')}</h1>
          <p className="text-gray-500 text-sm mt-0.5">Gjendja fizike sipas kategorise, produktit dhe vleres</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() =>
              downloadCsv(
                'depot-stock.csv',
                toCsv(
                  filtered.map((r) => ({
                    kategoria: r.category_name,
                    produkti: r.product_name,
                    gjendja: r.condition,
                    sasi: r.quantity,
                  })) as unknown as Record<string, unknown>[],
                ),
              )
            }
            className="inline-flex items-center gap-2 px-3 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 text-sm font-medium"
          >
            <Download className="w-4 h-4" /> CSV
          </button>
          <button
            onClick={() => setShowScanner(true)}
            className="inline-flex items-center gap-2 px-3 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 text-sm font-medium"
          >
            <ScanLine className="w-4 h-4" /> Scan
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 px-3 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm font-medium"
          >
            <Plus className="w-4 h-4" /> {t('depot.stock.newMovement')}
          </button>
        </div>
      </div>

      <PalletScanner open={showScanner} onClose={() => setShowScanner(false)} onScan={handleScan} context="stock" title="Scan pallet for stocktake" />

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0" />
          <p className="text-rose-700 text-sm flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-rose-500 hover:text-rose-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Sasia" value={totals.qty.toLocaleString()} icon={Package} color="bg-teal-500" />
        <KpiCard label="Te mira" value={(totals.byCond['good'] ?? 0).toLocaleString()} icon={Package} color="bg-emerald-500" />
        <KpiCard label="Te demtuara" value={(totals.byCond['damaged'] ?? 0).toLocaleString()} icon={AlertTriangle} color="bg-rose-500" />
        <KpiCard label="Te reparuara" value={(totals.byCond['repaired'] ?? 0).toLocaleString()} icon={Wrench} color="bg-amber-500" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-3 flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Kerko produkt ose kategori"
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
        >
          <option value="">Te gjitha kategorite</option>
          {sortedCategories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          value={filterCondition}
          onChange={(e) => setFilterCondition(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
        >
          <option value="">Te gjitha gjendjet</option>
          {CONDITIONS.map((c) => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </select>
      </div>

      {grouped.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
          <Package className="w-10 h-10 mx-auto mb-3 text-slate-300" />
          Asnje stok per filtrat e zgjedhur
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map((g) => {
            const open = expanded[g.categoryId] !== false;
            return (
              <section key={g.categoryId} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <button
                  onClick={() => setExpanded((s) => ({ ...s, [g.categoryId]: !open }))}
                  className="w-full px-4 py-3 bg-gradient-to-r from-teal-50 via-emerald-50 to-white flex items-center justify-between hover:from-teal-100 transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {open ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
                    <div className="p-2 rounded-lg bg-teal-600">
                      <Tag className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div className="text-left min-w-0">
                      <h3 className="text-sm font-bold text-slate-900 truncate">{g.categoryName}</h3>
                      <p className="text-[11px] text-slate-500">{g.products.length} produkte</p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-lg font-bold text-slate-900 tabular-nums leading-none">{g.totalQty.toLocaleString()}</p>
                    <p className="text-[10px] uppercase tracking-wide text-slate-500 mt-0.5">cope</p>
                  </div>
                </button>
                {open && (
                  <div className="divide-y divide-slate-100">
                    {g.products.map((p) => (
                      <div key={p.productId} className="px-4 py-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 truncate">{p.productName}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-slate-900 tabular-nums">{p.qty.toLocaleString()} cope</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {p.rows.map((r, i) => (
                            <span
                              key={`${p.productId}-${r.condition}-${i}`}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${conditionConfig[r.condition]?.className ?? 'bg-slate-100 text-slate-700'}`}
                            >
                              {conditionConfig[r.condition]?.label ?? r.condition}
                              <span className="font-bold">{r.quantity}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200">
        <div className="px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">{t('depot.stock.movementHistory')}</h2>
        </div>
        <div className="divide-y divide-slate-50">
          {movements.length === 0 ? (
            <div className="p-10 text-center">
              <Package className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">{t('common.noData')}</p>
            </div>
          ) : (
            movements.map((m) => {
              const cfg = movementConfig[m.movement_type] ?? { label: m.movement_type, className: 'bg-slate-100 text-slate-700', icon: Package };
              const Icon = cfg.icon;
              return (
                <div key={m.id} className="px-4 py-3 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={`p-1.5 rounded-lg ${cfg.className}`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${cfg.className}`}>
                            {cfg.label}
                          </span>
                          <span className="text-sm font-medium text-slate-900">{m.quantity} {t('common.pieces')}</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 truncate">
                          {(m as any).product?.name
                            ? `${(m as any).product.name}${(m.category as any)?.name ? ` (${(m.category as any).name})` : ''}`
                            : (m.category as any)?.name ?? '-'} &middot; {(m as any).performer?.full_name ?? '-'}
                          {m.notes ? ` · ${m.notes}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-slate-400 flex-shrink-0">
                      <Clock className="w-3 h-3" />
                      {new Date(m.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowForm(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="text-lg font-semibold text-slate-900">{t('depot.stock.newMovement')}</h2>
              <button onClick={() => setShowForm(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmitMovement} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('depot.stock.movementType')}</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['entry', 'exit', 'repair'] as const).map((tp) => (
                    <button
                      key={tp}
                      type="button"
                      onClick={() => setFormType(tp)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                        formType === tp
                          ? tp === 'entry'
                            ? 'bg-emerald-100 text-emerald-700 ring-2 ring-emerald-500'
                            : tp === 'exit'
                            ? 'bg-rose-100 text-rose-700 ring-2 ring-rose-500'
                            : 'bg-amber-100 text-amber-700 ring-2 ring-amber-500'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {movementConfig[tp].label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('depot.stock.category')}</label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                >
                  <option value="">{t('depot.stock.selectCategory')}</option>
                  {sortedCategories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('common.quantity')}</label>
                <input
                  type="number"
                  min="1"
                  value={formQuantity}
                  onChange={(e) => setFormQuantity(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                  placeholder="Vendos sasine"
                />
              </div>

              {formType === 'repair' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('depot.stock.conditionBefore')}</label>
                    <select
                      value={formConditionBefore}
                      onChange={(e) => setFormConditionBefore(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                    >
                      <option value="damaged">Demtuar</option>
                      <option value="good">Te mira</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('depot.stock.conditionAfter')}</label>
                    <select
                      value={formConditionAfter}
                      onChange={(e) => setFormConditionAfter(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                    >
                      <option value="repaired">Reparuar</option>
                      <option value="good">Te mira</option>
                    </select>
                  </div>
                </div>
              )}

              {(formType === 'entry' || formType === 'exit') && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Gjendja</label>
                  <select
                    value={formConditionAfter}
                    onChange={(e) => setFormConditionAfter(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                  >
                    <option value="good">Te mira</option>
                    <option value="damaged">Te demtuara</option>
                    <option value="repaired">Te reparuara</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('common.notes')}</label>
                <textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm resize-none"
                  placeholder="Shenime shtese..."
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: typeof Package; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3.5">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wide truncate">{label}</p>
          <p className="text-lg lg:text-xl font-bold text-slate-900 mt-1 truncate">{value}</p>
        </div>
        <div className={`${color} p-2 rounded-lg flex-shrink-0`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
      </div>
    </div>
  );
}
