import { useState, useEffect, useMemo } from 'react';
import {
  Package,
  AlertTriangle,
  X,
  Filter,
  ArrowUpCircle,
  ArrowDownCircle,
  Wrench,
  BarChart3,
  Plus,
  Loader2,
  Boxes,
  ShieldAlert,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import type { Stock as StockType, StockMovement, Depot, ProductCategory } from '../../types';
import { compareCategoriesByPriority, compareProducts } from '../../utils/productSort';

interface CategoryProduct {
  id: string;
  company_id: string;
  category_id: string;
  name: string;
  is_active: boolean;
}

type Tab = 'active' | 'defective';

export default function CompanyStock() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [stocks, setStocks] = useState<StockType[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [depots, setDepots] = useState<Depot[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [products, setProducts] = useState<CategoryProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterDepot, setFilterDepot] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [tab, setTab] = useState<Tab>('active');
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [regForm, setRegForm] = useState({
    depot_id: '',
    category_id: '',
    category_product_id: '',
    movement_type: 'entry' as 'entry' | 'exit' | 'repair',
    quantity: '',
    condition: 'good',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  const movementConfig: Record<string, { label: string; className: string; icon: typeof ArrowUpCircle }> = {
    entry: { label: t('depot.stock.entry'), className: 'bg-green-100 text-green-700', icon: ArrowUpCircle },
    exit: { label: t('depot.stock.exit'), className: 'bg-red-100 text-red-700', icon: ArrowDownCircle },
    repair: { label: t('depot.stock.repair'), className: 'bg-amber-100 text-amber-700', icon: Wrench },
  };

  useEffect(() => {
    if (profile?.company_id) fetchAll();
  }, [profile?.company_id]);

  async function fetchAll() {
    try {
      setLoading(true);
      setError(null);
      const companyId = profile!.company_id!;

      const [stockRes, movementRes, depotRes, catRes, productRes] = await Promise.all([
        supabase
          .from('stock')
          .select('*, category:product_categories(id, name), depot:depots(id, name), product:category_products(id, name)')
          .eq('company_id', companyId)
          .order('updated_at', { ascending: false }),
        supabase
          .from('stock_movements')
          .select('*, category:product_categories(id, name), depot:depots(id, name), product:category_products(id, name), performer:profiles!stock_movements_performed_by_fkey(full_name)')
          .eq('company_id', companyId)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase.from('depots').select('*').eq('company_id', companyId).eq('is_active', true),
        supabase.from('product_categories').select('*').eq('company_id', companyId),
        supabase.from('category_products').select('id, company_id, category_id, name, is_active').eq('company_id', companyId).eq('is_active', true),
      ]);

      if (stockRes.error) throw stockRes.error;
      if (movementRes.error) throw movementRes.error;
      if (depotRes.error) throw depotRes.error;
      if (catRes.error) throw catRes.error;
      if (productRes.error) throw productRes.error;

      setStocks(stockRes.data ?? []);
      setMovements(movementRes.data ?? []);
      setDepots(depotRes.data ?? []);
      setCategories(catRes.data ?? []);
      setProducts(productRes.data ?? []);
    } catch (err: any) {
      setError(err.message || t('common.errorLoading'));
    } finally {
      setLoading(false);
    }
  }

  async function handleRegisterStock() {
    const qty = parseInt(regForm.quantity, 10);
    if (!regForm.depot_id || !regForm.category_id || !qty || qty <= 0) {
      setError(t('companyAdmin.stock.errFillFields'));
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const companyId = profile!.company_id!;
      const productId = regForm.category_product_id || null;

      let existingQuery = supabase
        .from('stock')
        .select('id, quantity')
        .eq('company_id', companyId)
        .eq('depot_id', regForm.depot_id)
        .eq('category_id', regForm.category_id)
        .eq('condition', regForm.condition);
      existingQuery = productId
        ? existingQuery.eq('category_product_id', productId)
        : existingQuery.is('category_product_id', null);
      const { data: existing } = await existingQuery.maybeSingle();

      if (regForm.movement_type === 'exit') {
        if (!existing || existing.quantity < qty) {
          setError(t('companyAdmin.stock.errInsufficientStock'));
          setSaving(false);
          return;
        }
      }

      if (existing) {
        const newQty = regForm.movement_type === 'exit'
          ? Math.max(0, existing.quantity - qty)
          : existing.quantity + qty;
        await supabase
          .from('stock')
          .update({ quantity: newQty, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
      } else if (regForm.movement_type !== 'exit') {
        await supabase.from('stock').insert({
          company_id: companyId,
          depot_id: regForm.depot_id,
          category_id: regForm.category_id,
          category_product_id: productId,
          quantity: qty,
          condition: regForm.condition,
        });
      }

      const { error: mvErr } = await supabase.from('stock_movements').insert({
        company_id: companyId,
        depot_id: regForm.depot_id,
        category_id: regForm.category_id,
        category_product_id: productId,
        movement_type: regForm.movement_type,
        quantity: qty,
        condition_before: regForm.condition,
        condition_after: regForm.condition,
        notes: regForm.notes || 'Regjistrim nga admin i kompanise',
        performed_by: profile!.id,
      });
      if (mvErr) throw mvErr;

      setShowRegisterModal(false);
      setRegForm({ depot_id: '', category_id: '', category_product_id: '', movement_type: 'entry', quantity: '', condition: 'good', notes: '' });
      await fetchAll();
    } catch (err: any) {
      setError(err.message || t('common.errorSaving'));
    } finally {
      setSaving(false);
    }
  }

  const categoryById = useMemo(() => {
    const m = new Map<string, ProductCategory>();
    categories.forEach((c) => m.set(c.id, c));
    return m;
  }, [categories]);

  const productTotals = useMemo(() => {
    const tally = new Map<string, { name: string; categoryName: string; total: number; productId: string | null; categoryId: string }>();
    products.forEach((p) => {
      const cat = categoryById.get(p.category_id);
      tally.set(p.id, { name: p.name, categoryName: cat?.name ?? '-', total: 0, productId: p.id, categoryId: p.category_id });
    });
    stocks.forEach((s) => {
      if (s.condition === 'damaged') return;
      if (s.category_product_id && tally.has(s.category_product_id)) {
        const row = tally.get(s.category_product_id)!;
        row.total += s.quantity;
      } else {
        const catKey = `cat:${s.category_id}`;
        const cat = categoryById.get(s.category_id);
        const existing = tally.get(catKey);
        if (existing) {
          existing.total += s.quantity;
        } else {
          tally.set(catKey, {
            name: cat?.name ?? '-',
            categoryName: cat?.name ?? '-',
            total: s.quantity,
            productId: null,
            categoryId: s.category_id,
          });
        }
      }
    });
    return Array.from(tally.values())
      .filter((r) => r.total > 0 || r.productId !== null)
      .sort((a, b) => compareProducts(a, b, (r) => r.categoryName, (r) => r.name));
  }, [products, stocks, categoryById]);

  const visibleStocks = stocks
    .slice()
    .filter((s) => (tab === 'defective' ? s.condition === 'damaged' : s.condition !== 'damaged'))
    .filter((s) => {
      if (filterDepot && s.depot_id !== filterDepot) return false;
      if (filterCategory && s.category_id !== filterCategory) return false;
      return true;
    })
    .sort((a, b) =>
      compareProducts(
        a,
        b,
        (s) => (s as unknown as { category?: { name?: string } }).category?.name ?? null,
        (s) => (s as unknown as { product?: { name?: string }; category?: { name?: string } }).product?.name ?? (s as unknown as { category?: { name?: string } }).category?.name ?? '',
      ),
    );

  const productsForCategory = (catId: string) => products.filter((p) => p.category_id === catId);

  const movementsByDate = useMemo(() => {
    const groups = new Map<string, StockMovement[]>();
    movements.forEach((m) => {
      const key = new Date(m.created_at).toISOString().slice(0, 10);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(m);
    });
    return Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [movements]);

  function movementSourceLabel(m: StockMovement): string {
    if (m.movement_type === 'repair') return t('company.stock.sourceRepair');
    const note = (m.notes || '').toLowerCase();
    if (note.includes('riparim') || note.includes('repair') || note.includes('reparat')) return t('company.stock.sourceRepair');
    if (note.includes('dergese') || note.includes('delivery') || note.includes('lieferung') || note.includes('pickup') || note.includes('pranim')) return t('company.stock.sourceDelivery');
    return t('company.stock.sourceManual');
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600" />
      </div>
    );
  }

  const sortedCategoriesForSelect = categories.slice().sort((a, b) => compareCategoriesByPriority(a.name, b.name));
  const sortedProductsForSelect = regForm.category_id
    ? productsForCategory(regForm.category_id).slice().sort((a, b) => a.name.localeCompare(b.name))
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('company.stock.title')}</h1>
          <p className="text-gray-500 mt-1">{t('company.stock.subtitle')}</p>
        </div>
        <button
          onClick={() => setShowRegisterModal(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium"
        >
          <Plus className="w-4 h-4" />
          {t('companyAdmin.stock.registerStock') || 'Regjistro Stok'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-red-700 text-sm">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="inline-flex bg-gray-100 rounded-xl p-1">
        <button
          onClick={() => setTab('active')}
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'active' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Boxes className="w-4 h-4" />
          {t('company.stock.tabActive')}
        </button>
        <button
          onClick={() => setTab('defective')}
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'defective' ? 'bg-white text-red-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          {t('company.stock.tabDefective')}
        </button>
      </div>

      {tab === 'active' && productTotals.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {productTotals.map((p) => (
            <div key={`${p.productId ?? 'cat'}-${p.categoryId}`} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <p className="text-xs text-gray-500 truncate" title={p.name}>{p.name}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">{p.total}</p>
              {p.productId && <p className="text-[10px] text-gray-400 mt-0.5 truncate">{p.categoryName}</p>}
            </div>
          ))}
        </div>
      )}

      {tab === 'defective' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-900 text-sm">{t('company.stock.defectiveTitle')}</p>
            <p className="text-amber-800 text-xs mt-0.5">{t('company.stock.defectiveSubtitle')}</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-4 border-b border-gray-100">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex items-center gap-2 flex-1">
              <Filter className="w-4 h-4 text-gray-400" />
              <select
                value={filterDepot}
                onChange={(e) => setFilterDepot(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
              >
                <option value="">{t('common.all')} {t('nav.depots').toLowerCase()}</option>
                {depots.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
            >
              <option value="">{t('common.all')} {t('nav.categories').toLowerCase()}</option>
              {sortedCategoriesForSelect.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('company.deliveryNotes.depot')}</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('company.stock.product')}</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('common.quantity')}</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">{t('common.date')}</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('company.stock.category')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {visibleStocks.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                    <Package className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                    {tab === 'defective' ? t('company.stock.noDefective') : t('company.stock.noStock')}
                  </td>
                </tr>
              ) : (
                visibleStocks.map((stock) => (
                  <tr key={stock.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {(stock.depot as any)?.name ?? '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 font-medium">
                      {stock.product?.name ?? (stock.category as any)?.name ?? '-'}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-semibold text-gray-900 tabular-nums">{stock.quantity}</span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 hidden md:table-cell">
                      {new Date(stock.updated_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {(stock.category as any)?.name ?? '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-teal-600" />
            <h2 className="text-lg font-semibold text-gray-900">{t('depot.stock.movementHistory')}</h2>
          </div>
        </div>
        <div>
          {movementsByDate.length === 0 ? (
            <div className="p-12 text-center">
              <Package className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400">{t('common.noData')}</p>
            </div>
          ) : (
            movementsByDate.map(([date, group]) => (
              <div key={date} className="border-b border-gray-50 last:border-b-0">
                <div className="px-6 py-2.5 bg-gray-50/60 text-xs font-semibold text-gray-600 uppercase tracking-wide flex items-center justify-between">
                  <span>{new Date(date).toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</span>
                  <span className="text-gray-400 font-medium normal-case tracking-normal">{group.length}</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {group.map((m) => {
                    const cfg = movementConfig[m.movement_type];
                    const Icon = cfg?.icon ?? Package;
                    return (
                      <div key={m.id} className="p-4 hover:bg-gray-50 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${cfg?.className ?? 'bg-gray-100'}`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg?.className ?? 'bg-gray-100 text-gray-700'}`}>
                                {cfg?.label ?? m.movement_type}
                              </span>
                              <span className="text-[10px] font-medium uppercase tracking-wide text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">
                                {movementSourceLabel(m)}
                              </span>
                              <span className="text-sm font-semibold text-gray-900 tabular-nums">
                                {m.quantity} {t('common.pieces')}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-1 truncate">
                              {m.product?.name ?? (m.category as any)?.name ?? '-'} &middot; {(m.depot as any)?.name ?? '-'} &middot; {(m.performer as any)?.full_name ?? '-'}
                            </p>
                          </div>
                          <span className="text-xs text-gray-400 flex-shrink-0 tabular-nums">
                            {new Date(m.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {showRegisterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowRegisterModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-100 sticky top-0 bg-white">
              <h2 className="text-lg font-semibold text-gray-900">{t('companyAdmin.stock.registerStock') || 'Regjistro Stok'}</h2>
              <button
                onClick={() => setShowRegisterModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('company.deliveryNotes.depot')}</label>
                <select
                  value={regForm.depot_id}
                  onChange={(e) => setRegForm({ ...regForm, depot_id: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                >
                  <option value="">{t('depot.stock.selectCategory')}</option>
                  {depots.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('company.stock.category')}</label>
                <select
                  value={regForm.category_id}
                  onChange={(e) => setRegForm({ ...regForm, category_id: e.target.value, category_product_id: '' })}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                >
                  <option value="">{t('depot.stock.selectCategory')}</option>
                  {sortedCategoriesForSelect.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('company.stock.product')}</label>
                <select
                  value={regForm.category_product_id}
                  onChange={(e) => setRegForm({ ...regForm, category_product_id: e.target.value })}
                  disabled={!regForm.category_id || sortedProductsForSelect.length === 0}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm disabled:bg-gray-50 disabled:text-gray-400"
                >
                  <option value="">-</option>
                  {sortedProductsForSelect.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('depot.stock.movementType')}</label>
                  <select
                    value={regForm.movement_type}
                    onChange={(e) => setRegForm({ ...regForm, movement_type: e.target.value as any })}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                  >
                    <option value="entry">{t('depot.stock.entry')}</option>
                    <option value="exit">{t('depot.stock.exit')}</option>
                    <option value="repair">{t('depot.stock.repair')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('company.stock.condition')}</label>
                  <select
                    value={regForm.condition}
                    onChange={(e) => setRegForm({ ...regForm, condition: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                  >
                    <option value="good">{t('company.stock.good')}</option>
                    <option value="damaged">{t('company.stock.damaged')}</option>
                    <option value="repaired">{t('company.stock.repaired')}</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.quantity')}</label>
                <input
                  type="number"
                  min={1}
                  value={regForm.quantity}
                  onChange={(e) => setRegForm({ ...regForm, quantity: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.notes')}</label>
                <textarea
                  value={regForm.notes}
                  onChange={(e) => setRegForm({ ...regForm, notes: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm resize-none"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-100 sticky bottom-0 bg-white">
              <button
                onClick={() => setShowRegisterModal(false)}
                className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleRegisterStock}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
