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
  Layers,
  ChevronDown,
  ChevronRight,
  Warehouse,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import type { Stock as StockType, StockMovement, Depot, ProductCategory } from '../../types';
import { compareCategoriesByPriority, compareProducts, epalClassRank } from '../../utils/productSort';

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
  const [reassignCategoryId, setReassignCategoryId] = useState<string | null>(null);

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

  type CategoryGroup = {
    categoryId: string;
    categoryName: string;
    total: number;
    unassignedTotal: number;
    products: Array<{ productId: string; name: string; total: number; isActive: boolean }>;
  };

  const categoryGroups = useMemo<CategoryGroup[]>(() => {
    const groups = new Map<string, CategoryGroup>();
    const ensure = (catId: string): CategoryGroup => {
      let g = groups.get(catId);
      if (!g) {
        const cat = categoryById.get(catId);
        g = {
          categoryId: catId,
          categoryName: cat?.name ?? '-',
          total: 0,
          unassignedTotal: 0,
          products: [],
        };
        groups.set(catId, g);
      }
      return g;
    };

    products.forEach((p) => {
      const g = ensure(p.category_id);
      g.products.push({ productId: p.id, name: p.name, total: 0, isActive: p.is_active });
    });

    stocks.forEach((s) => {
      if (s.condition === 'damaged') return;
      const g = ensure(s.category_id);
      g.total += s.quantity;
      if (s.category_product_id) {
        const prod = g.products.find((p) => p.productId === s.category_product_id);
        if (prod) prod.total += s.quantity;
        else g.unassignedTotal += s.quantity;
      } else {
        g.unassignedTotal += s.quantity;
      }
    });

    const list = Array.from(groups.values());
    list.forEach((g) => {
      g.products.sort((a, b) => {
        const ra = epalClassRank(a.name);
        const rb = epalClassRank(b.name);
        if (ra !== rb) return ra - rb;
        return a.name.localeCompare(b.name);
      });
    });
    list.sort((a, b) => compareCategoriesByPriority(a.categoryName, b.categoryName));
    return list;
  }, [products, stocks, categoryById]);

  const totalActive = useMemo(
    () => categoryGroups.reduce((s, g) => s + g.total, 0),
    [categoryGroups],
  );
  const totalDefective = useMemo(
    () => stocks.filter((s) => s.condition === 'damaged').reduce((sum, s) => sum + s.quantity, 0),
    [stocks],
  );

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

      {tab === 'active' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <SummaryStat
              label={t('company.stock.tabActive')}
              value={totalActive}
              icon={<Boxes className="w-5 h-5 text-teal-600" />}
              tone="bg-teal-50"
            />
            <SummaryStat
              label={t('nav.depots') ?? 'Depo'}
              value={depots.length}
              icon={<Warehouse className="w-5 h-5 text-sky-600" />}
              tone="bg-sky-50"
            />
            <SummaryStat
              label={t('company.stock.tabDefective')}
              value={totalDefective}
              icon={<ShieldAlert className="w-5 h-5 text-amber-600" />}
              tone="bg-amber-50"
            />
          </div>

          {categoryGroups.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
              <Package className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400">{t('company.stock.noStock')}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {categoryGroups.map((g) => (
                <CategoryGroupCard
                  key={g.categoryId}
                  group={g}
                  onReassign={() => setReassignCategoryId(g.categoryId)}
                />
              ))}
            </div>
          )}
        </>
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

      {tab === 'defective' && (
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
      )}

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

      {reassignCategoryId && (
        <ReassignModal
          categoryId={reassignCategoryId}
          companyId={profile!.company_id!}
          performedBy={profile!.id}
          stocks={stocks}
          depots={depots}
          products={products.filter((p) => p.category_id === reassignCategoryId)}
          categoryName={categoryById.get(reassignCategoryId)?.name ?? '-'}
          onClose={() => setReassignCategoryId(null)}
          onDone={async () => {
            setReassignCategoryId(null);
            await fetchAll();
          }}
        />
      )}
    </div>
  );
}

function SummaryStat({
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
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex items-center justify-between">
      <div>
        <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold">{label}</p>
        <p className="text-3xl font-bold text-gray-900 mt-1 tabular-nums">{value}</p>
      </div>
      <div className={`p-3 rounded-xl ${tone}`}>{icon}</div>
    </div>
  );
}

function CategoryGroupCard({ group, onReassign }: {
  group: {
    categoryId: string;
    categoryName: string;
    total: number;
    unassignedTotal: number;
    products: Array<{ productId: string; name: string; total: number; isActive: boolean }>;
  };
  onReassign: () => void;
}) {
  const [open, setOpen] = useState(true);
  const visibleProducts = group.products.filter((p) => p.isActive || p.total > 0);
  const hasBreakdown = visibleProducts.length > 0;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="w-11 h-11 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center flex-shrink-0">
          <Layers className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-semibold text-gray-900 truncate">{group.categoryName}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {visibleProducts.length} {visibleProducts.length === 1 ? 'produkt' : 'produkte'}
            {group.unassignedTotal > 0 && ` · ${group.unassignedTotal} pa produkt`}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-teal-700 tabular-nums">{group.total}</p>
          <p className="text-[11px] text-gray-400 uppercase tracking-wide">paleta</p>
        </div>
        {hasBreakdown && (
          <div className="text-gray-400 ml-2">
            {open ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
          </div>
        )}
      </button>
      {open && hasBreakdown && (
        <div className="border-t border-gray-100 bg-gray-50/40">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
            {visibleProducts.map((p) => {
              const pct = group.total > 0 ? (p.total / group.total) * 100 : 0;
              return (
                <div
                  key={p.productId}
                  className="bg-white rounded-xl border border-gray-100 p-4 flex items-start gap-3"
                >
                  <div className="w-9 h-9 rounded-lg bg-gray-100 text-gray-500 flex items-center justify-center flex-shrink-0">
                    <Package className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate" title={p.name}>{p.name}</p>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-xl font-bold text-gray-900 tabular-nums">{p.total}</span>
                      <span className="text-[11px] text-gray-400 tabular-nums">{pct.toFixed(0)}%</span>
                    </div>
                    <div className="mt-2 h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-teal-500 rounded-full"
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
            {group.unassignedTotal > 0 && (
              <div className="bg-amber-50 rounded-xl border border-amber-200 p-4 flex items-start gap-3 sm:col-span-2 lg:col-span-3">
                <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
                  <Package className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-amber-900">Pa produkt te caktuar</p>
                  <p className="text-[11px] text-amber-700 mt-0.5">
                    Hyrje pa specifikim produkti — caktoja produkteve specifike (A/B/C Klasse).
                  </p>
                  <p className="text-2xl font-bold text-amber-700 tabular-nums mt-1">{group.unassignedTotal}</p>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onReassign();
                  }}
                  className="self-start inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors"
                >
                  Cakto Produktin
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ReassignModal({
  categoryId,
  companyId,
  performedBy,
  stocks,
  depots,
  products,
  categoryName,
  onClose,
  onDone,
}: {
  categoryId: string;
  companyId: string;
  performedBy: string;
  stocks: StockType[];
  depots: Depot[];
  products: CategoryProduct[];
  categoryName: string;
  onClose: () => void;
  onDone: () => void | Promise<void>;
}) {
  const sortedProducts = useMemo(
    () => [...products].sort((a, b) => epalClassRank(a.name) - epalClassRank(b.name) || a.name.localeCompare(b.name)),
    [products]
  );

  const unassignedRows = useMemo(() => {
    return stocks.filter(
      (s) => s.category_id === categoryId && !s.category_product_id && (s.quantity ?? 0) > 0
    );
  }, [stocks, categoryId]);

  const [depotId, setDepotId] = useState<string>(unassignedRows[0]?.depot_id ?? '');
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const sourceRow = useMemo(
    () => unassignedRows.find((r) => r.depot_id === depotId) ?? null,
    [unassignedRows, depotId]
  );
  const available = sourceRow?.quantity ?? 0;
  const allocated = useMemo(
    () => Object.values(allocations).reduce((sum, v) => sum + (parseInt(v || '0', 10) || 0), 0),
    [allocations]
  );
  const remaining = available - allocated;

  async function handleSubmit() {
    if (!sourceRow || !depotId) {
      setErr('Zgjedh nje depo me stok te pacaktuar.');
      return;
    }
    if (allocated <= 0) {
      setErr('Cakto te pakten nje sasi per nje produkt.');
      return;
    }
    if (allocated > available) {
      setErr('Sasia e caktuar tejkalon stokun e pacaktuar.');
      return;
    }
    try {
      setSaving(true);
      setErr(null);

      for (const [productId, qtyStr] of Object.entries(allocations)) {
        const qty = parseInt(qtyStr || '0', 10) || 0;
        if (qty <= 0) continue;

        const existing = stocks.find(
          (s) =>
            s.depot_id === depotId &&
            s.category_id === categoryId &&
            s.category_product_id === productId &&
            s.condition === sourceRow.condition
        );

        if (existing) {
          const { error: updErr } = await supabase
            .from('stock')
            .update({ quantity: (existing.quantity ?? 0) + qty })
            .eq('id', existing.id);
          if (updErr) throw updErr;
        } else {
          const { error: insErr } = await supabase.from('stock').insert({
            company_id: companyId,
            depot_id: depotId,
            category_id: categoryId,
            category_product_id: productId,
            condition: sourceRow.condition,
            quantity: qty,
          });
          if (insErr) throw insErr;
        }

        await supabase.from('stock_movements').insert({
          company_id: companyId,
          depot_id: depotId,
          category_id: categoryId,
          category_product_id: productId,
          movement_type: 'entry',
          quantity: qty,
          condition: sourceRow.condition,
          performed_by: performedBy,
          notes: `Reassign nga ${categoryName} pa produkt`,
        });
      }

      const newQty = available - allocated;
      if (newQty <= 0) {
        const { error: delErr } = await supabase.from('stock').delete().eq('id', sourceRow.id);
        if (delErr) throw delErr;
      } else {
        const { error: updErr } = await supabase
          .from('stock')
          .update({ quantity: newQty })
          .eq('id', sourceRow.id);
        if (updErr) throw updErr;
      }

      await supabase.from('stock_movements').insert({
        company_id: companyId,
        depot_id: depotId,
        category_id: categoryId,
        category_product_id: null,
        movement_type: 'exit',
        quantity: allocated,
        condition: sourceRow.condition,
        performed_by: performedBy,
        notes: `Reassign drejt produkteve specifike (${categoryName})`,
      });

      await onDone();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Gabim ne ruajtje.';
      setErr(msg);
    } finally {
      setSaving(false);
    }
  }

  const depotsWithUnassigned = depots.filter((d) => unassignedRows.some((r) => r.depot_id === d.id));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Cakto produktin</h3>
            <p className="text-xs text-gray-500 mt-0.5">{categoryName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {depotsWithUnassigned.length === 0 ? (
            <p className="text-sm text-gray-500">Nuk ka stok te pacaktuar per kete kategori.</p>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Depo</label>
                <select
                  value={depotId}
                  onChange={(e) => {
                    setDepotId(e.target.value);
                    setAllocations({});
                  }}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  {depotsWithUnassigned.map((d) => {
                    const row = unassignedRows.find((r) => r.depot_id === d.id);
                    return (
                      <option key={d.id} value={d.id}>
                        {d.name} ({row?.quantity ?? 0} pa produkt)
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Stok i pacaktuar</span>
                  <span className="font-semibold text-gray-900 tabular-nums">{available}</span>
                </div>
                <div className="flex items-center justify-between text-sm mt-1">
                  <span className="text-gray-600">Te caktuara</span>
                  <span className="font-semibold text-teal-700 tabular-nums">{allocated}</span>
                </div>
                <div className="flex items-center justify-between text-sm mt-1">
                  <span className="text-gray-600">Te mbetura</span>
                  <span
                    className={`font-semibold tabular-nums ${
                      remaining < 0 ? 'text-red-600' : 'text-gray-900'
                    }`}
                  >
                    {remaining}
                  </span>
                </div>
              </div>

              {sortedProducts.length === 0 ? (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  Nuk ka produkte te regjistruara per kete kategori. Krijoji ne menyne e Kategorive.
                </p>
              ) : (
                <div className="space-y-2">
                  {sortedProducts.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 px-3 py-2 bg-white border border-gray-100 rounded-lg"
                    >
                      <Package className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span className="flex-1 text-sm font-medium text-gray-800 truncate">{p.name}</span>
                      <input
                        type="number"
                        min="0"
                        max={available}
                        value={allocations[p.id] ?? ''}
                        onChange={(e) =>
                          setAllocations((prev) => ({ ...prev, [p.id]: e.target.value }))
                        }
                        placeholder="0"
                        className="w-20 px-2 py-1.5 text-sm text-right border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500 tabular-nums"
                      />
                    </div>
                  ))}
                </div>
              )}

              {err && (
                <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                  {err}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100 bg-gray-50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Anulo
          </button>
          <button
            type="button"
            disabled={saving || allocated <= 0 || allocated > available}
            onClick={handleSubmit}
            className="px-4 py-2 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Ruaj
          </button>
        </div>
      </div>
    </div>
  );
}
