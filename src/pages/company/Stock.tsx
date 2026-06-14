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
  Search,
  ChevronDown,
  ChevronUp,
  Truck,
  Hammer,
  Hand,
  Tag,
  Building2,
  Layers,
  ArrowRightCircle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import type { Stock as StockType, StockMovement, Depot, ProductCategory, StockCondition } from '../../types';
import { compareCategoriesByPriority, compareProducts, epalClassRank } from '../../utils/productSort';
import InProcessPanel from '../../components/stock/InProcessPanel';
import { isDamageLike } from '../../utils/epalClassification';

interface CategoryProduct {
  id: string;
  company_id: string;
  category_id: string;
  name: string;
  is_active: boolean;
}

type Tab = 'active' | 'defective' | 'movements';
type Source = 'repair' | 'delivery' | 'manual';

interface ProductCard {
  key: string;
  productId: string | null;
  categoryId: string;
  productName: string;
  categoryName: string;
  total: number;
  damaged: number;
  repairedCondition: number;
  byDepot: { depotId: string; depotName: string; quantity: number; condition: string; stockId: string; isLegacy: boolean }[];
  sources: Record<Source, number>;
  isLegacy: boolean;
}

function classifyMovement(m: StockMovement): Source {
  if (m.movement_type === 'repair') return 'repair';
  const note = (m.notes || '').toLowerCase();
  if (note.includes('riparim') || note.includes('repair') || note.includes('reparat')) return 'repair';
  if (
    note.includes('dergese') ||
    note.includes('delivery') ||
    note.includes('lieferung') ||
    note.includes('pickup') ||
    note.includes('pranim') ||
    note.includes('furnizim') ||
    note.includes('blerje') ||
    note.includes('purchase')
  ) {
    return 'delivery';
  }
  return 'manual';
}

export default function CompanyStock() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [stocks, setStocks] = useState<StockType[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [allMovements, setAllMovements] = useState<StockMovement[]>([]);
  const [depots, setDepots] = useState<Depot[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [products, setProducts] = useState<CategoryProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterDepot, setFilterDepot] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('active');
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [reassignTarget, setReassignTarget] = useState<{ stockId: string; categoryId: string; depotName: string; quantity: number; condition: string } | null>(null);
  const [reassignProductId, setReassignProductId] = useState('');
  const [reassignSaving, setReassignSaving] = useState(false);
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
    entry: { label: t('depot.stock.entry'), className: 'bg-emerald-100 text-emerald-700', icon: ArrowUpCircle },
    exit: { label: t('depot.stock.exit'), className: 'bg-rose-100 text-rose-700', icon: ArrowDownCircle },
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

      const [stockRes, movementRes, allMovementRes, depotRes, catRes, productRes] = await Promise.all([
        supabase
          .from('stock')
          .select('*, category:product_categories(id, name), depot:depots(id, name), product:category_products(id, name)')
          .eq('company_id', companyId)
          .gt('quantity', 0)
          .order('updated_at', { ascending: false }),
        supabase
          .from('stock_movements')
          .select('*, category:product_categories(id, name), depot:depots(id, name), product:category_products(id, name), performer:profiles!stock_movements_performed_by_fkey(full_name)')
          .eq('company_id', companyId)
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('stock_movements')
          .select('id, category_id, category_product_id, movement_type, quantity, notes, created_at')
          .eq('company_id', companyId)
          .order('created_at', { ascending: false })
          .limit(2000),
        supabase.from('depots').select('*').eq('company_id', companyId).eq('is_active', true),
        supabase.from('product_categories').select('*').eq('company_id', companyId),
        supabase.from('category_products').select('id, company_id, category_id, name, is_active').eq('company_id', companyId),
      ]);

      if (stockRes.error) throw stockRes.error;
      if (movementRes.error) throw movementRes.error;
      if (allMovementRes.error) throw allMovementRes.error;
      if (depotRes.error) throw depotRes.error;
      if (catRes.error) throw catRes.error;
      if (productRes.error) throw productRes.error;

      setStocks(stockRes.data ?? []);
      setMovements(movementRes.data ?? []);
      setAllMovements((allMovementRes.data ?? []) as StockMovement[]);
      setDepots(depotRes.data ?? []);
      setCategories(catRes.data ?? []);
      setProducts(productRes.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const categoryById = useMemo(() => {
    const m = new Map<string, ProductCategory>();
    categories.forEach((c) => m.set(c.id, c));
    return m;
  }, [categories]);

  const depotById = useMemo(() => {
    const m = new Map<string, Depot>();
    depots.forEach((d) => m.set(d.id, d));
    return m;
  }, [depots]);

  const sourcesByKey = useMemo(() => {
    const map = new Map<string, Record<Source, number>>();
    allMovements.forEach((m) => {
      if (m.movement_type === 'exit') return;
      const key = m.category_product_id ?? `cat:${m.category_id}`;
      const src = classifyMovement(m);
      if (!map.has(key)) map.set(key, { repair: 0, delivery: 0, manual: 0 });
      map.get(key)![src] += m.quantity;
    });
    return map;
  }, [allMovements]);

  const productCards = useMemo<ProductCard[]>(() => {
    const tally = new Map<string, ProductCard>();

    products.forEach((p) => {
      const cat = categoryById.get(p.category_id);
      tally.set(p.id, {
        key: p.id,
        productId: p.id,
        categoryId: p.category_id,
        productName: p.name,
        categoryName: cat?.name ?? '-',
        total: 0,
        damaged: 0,
        repairedCondition: 0,
        byDepot: [],
        sources: { repair: 0, delivery: 0, manual: 0 },
        isLegacy: false,
      });
    });

    stocks.forEach((s) => {
      const depotName = depotById.get(s.depot_id)?.name ?? '-';
      let card: ProductCard | undefined;
      let isLegacy = false;
      if (s.category_product_id && tally.has(s.category_product_id)) {
        card = tally.get(s.category_product_id)!;
      } else {
        const catKey = `cat:${s.category_id}`;
        const cat = categoryById.get(s.category_id);
        if (!tally.has(catKey)) {
          tally.set(catKey, {
            key: catKey,
            productId: null,
            categoryId: s.category_id,
            productName: cat?.name ?? '-',
            categoryName: cat?.name ?? '-',
            total: 0,
            damaged: 0,
            repairedCondition: 0,
            byDepot: [],
            sources: { repair: 0, delivery: 0, manual: 0 },
            isLegacy: true,
          });
        }
        card = tally.get(catKey)!;
        isLegacy = true;
      }

      if (s.condition === 'damaged') {
        card.damaged += s.quantity;
      } else {
        card.total += s.quantity;
      }
      if (s.quantity > 0 || s.condition === 'damaged') {
        card.byDepot.push({
          depotId: s.depot_id,
          depotName,
          quantity: s.quantity,
          condition: s.condition,
          stockId: s.id,
          isLegacy,
        });
      }
    });

    sourcesByKey.forEach((src, key) => {
      const card = tally.get(key);
      if (card) {
        card.sources = src;
      } else if (key.startsWith('cat:')) {
        const categoryId = key.slice(4);
        const cat = categoryById.get(categoryId);
        tally.set(key, {
          key,
          productId: null,
          categoryId,
          productName: cat?.name ?? '-',
          categoryName: cat?.name ?? '-',
          total: 0,
          damaged: 0,
          repairedCondition: 0,
          byDepot: [],
          sources: src,
          isLegacy: true,
        });
      }
    });

    return Array.from(tally.values())
      .filter((c) => c.total > 0 || c.damaged > 0 || c.productId !== null)
      .sort((a, b) => {
        const cmp = compareProducts(
          a,
          b,
          (c) => c.categoryName,
          (c) => c.productName,
        );
        if (cmp !== 0) return cmp;
        return epalClassRank(a.productName) - epalClassRank(b.productName);
      });
  }, [products, stocks, categoryById, depotById, sourcesByKey]);

  const filteredCards = useMemo(() => {
    const q = search.trim().toLowerCase();
    return productCards.filter((c) => {
      if (filterCategory && c.categoryId !== filterCategory) return false;
      if (filterDepot && !c.byDepot.some((d) => d.depotId === filterDepot)) return false;
      if (q && !c.productName.toLowerCase().includes(q) && !c.categoryName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [productCards, search, filterCategory, filterDepot]);

  const groupedByCategory = useMemo(() => {
    const groups = new Map<string, { categoryId: string; categoryName: string; cards: ProductCard[]; total: number; damaged: number }>();
    filteredCards.forEach((c) => {
      const key = c.categoryId || `name:${c.categoryName}`;
      if (!groups.has(key)) {
        groups.set(key, { categoryId: c.categoryId, categoryName: c.categoryName, cards: [], total: 0, damaged: 0 });
      }
      const g = groups.get(key)!;
      g.cards.push(c);
      g.total += c.total;
      g.damaged += c.damaged;
    });
    groups.forEach((g) => {
      g.cards.sort((a, b) => epalClassRank(a.productName) - epalClassRank(b.productName) || a.productName.localeCompare(b.productName));
    });
    return Array.from(groups.values()).sort((a, b) => compareCategoriesByPriority(a.categoryName, b.categoryName));
  }, [filteredCards]);

  const stats = useMemo(() => {
    const totalActive = productCards.reduce((sum, c) => sum + c.total, 0);
    const totalDamaged = productCards.reduce((sum, c) => sum + c.damaged, 0);
    const productsTracked = productCards.filter((c) => c.productId !== null && (c.total > 0 || c.damaged > 0)).length;
    const monthAgo = new Date();
    monthAgo.setDate(monthAgo.getDate() - 30);
    const repairedThisMonth = allMovements
      .filter((m) => m.movement_type === 'repair' && new Date(m.created_at) >= monthAgo)
      .reduce((sum, m) => sum + m.quantity, 0);
    const stockedDepots = new Set(productCards.flatMap((c) => c.byDepot.filter((d) => d.condition !== 'damaged' && d.quantity > 0).map((d) => d.depotId))).size;
    return { totalActive, totalDamaged, productsTracked, repairedThisMonth, stockedDepots };
  }, [productCards, allMovements]);

  const damagedRows = useMemo(() => {
    return productCards
      .filter((c) => c.damaged > 0)
      .filter((c) => {
        const q = search.trim().toLowerCase();
        if (filterCategory && c.categoryId !== filterCategory) return false;
        if (filterDepot && !c.byDepot.some((d) => d.depotId === filterDepot && d.condition === 'damaged')) return false;
        if (q && !c.productName.toLowerCase().includes(q) && !c.categoryName.toLowerCase().includes(q)) return false;
        return true;
      });
  }, [productCards, search, filterCategory, filterDepot]);

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
    const src = classifyMovement(m);
    if (src === 'repair') return t('company.stock.sourceRepair');
    if (src === 'delivery') return t('company.stock.sourceDelivery');
    return t('company.stock.sourceManual');
  }

  const productsForCategory = (catId: string) => products.filter((p) => p.category_id === catId && p.is_active);
  const sortedCategoriesForSelect = categories.slice().sort((a, b) => compareCategoriesByPriority(a.name, b.name));
  const sortedProductsForSelect = regForm.category_id
    ? productsForCategory(regForm.category_id).slice().sort((a, b) => epalClassRank(a.name) - epalClassRank(b.name) || a.name.localeCompare(b.name))
    : [];

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
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleReassign() {
    if (!reassignTarget || !reassignProductId) return;
    try {
      setReassignSaving(true);
      setError(null);

      const { data: existing } = await supabase
        .from('stock')
        .select('id, depot_id, quantity')
        .eq('id', reassignTarget.stockId)
        .maybeSingle();
      if (!existing) {
        setError(t('company.stock.rowNotFound') || 'Stock row not found');
        return;
      }

      const { data: target } = await supabase
        .from('stock')
        .select('id, quantity')
        .eq('company_id', profile!.company_id!)
        .eq('depot_id', existing.depot_id)
        .eq('category_id', reassignTarget.categoryId)
        .eq('category_product_id', reassignProductId)
        .eq('condition', reassignTarget.condition)
        .maybeSingle();

      if (target) {
        await supabase
          .from('stock')
          .update({ quantity: target.quantity + existing.quantity, updated_at: new Date().toISOString() })
          .eq('id', target.id);
        await supabase.from('stock').delete().eq('id', existing.id);
      } else {
        await supabase
          .from('stock')
          .update({ category_product_id: reassignProductId, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
      }

      setReassignTarget(null);
      setReassignProductId('');
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setReassignSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('company.stock.title')}</h1>
          <p className="text-gray-500 mt-1">{t('company.stock.subtitle')}</p>
        </div>
        <button
          onClick={() => setShowRegisterModal(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium shadow-sm"
        >
          <Plus className="w-4 h-4" />
          {t('companyAdmin.stock.registerStock')}
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile
          icon={Boxes}
          label={t('company.stock.totalStock')}
          value={stats.totalActive}
          accent="teal"
          subtitle={`${stats.productsTracked} ${t('company.stock.product').toLowerCase()}`}
        />
        <KpiTile
          icon={Hammer}
          label={t('company.stock.sourceRepair')}
          value={stats.repairedThisMonth}
          accent="amber"
          subtitle="30d"
        />
        <KpiTile
          icon={Building2}
          label={t('company.deliveryNotes.depot')}
          value={stats.stockedDepots}
          accent="blue"
          subtitle={`${depots.length}`}
        />
        <KpiTile
          icon={ShieldAlert}
          label={t('company.stock.damagedCondition')}
          value={stats.totalDamaged}
          accent="rose"
          subtitle=""
        />
      </div>

      {profile?.company_id && (
        <InProcessPanel
          companyId={profile.company_id}
          sortingPath="/company/sorting"
          repairPath="/company/repair-reports"
        />
      )}

      <div className="inline-flex bg-gray-100 rounded-xl p-1">
        <TabButton active={tab === 'active'} onClick={() => setTab('active')} icon={Boxes} accent="teal">
          {t('company.stock.tabActive')}
        </TabButton>
        <TabButton active={tab === 'defective'} onClick={() => setTab('defective')} icon={ShieldAlert} accent="rose">
          {t('company.stock.tabDefective')}
        </TabButton>
        <TabButton active={tab === 'movements'} onClick={() => setTab('movements')} icon={BarChart3} accent="slate">
          {t('depot.stock.movementHistory')}
        </TabButton>
      </div>

      {(tab === 'active' || tab === 'defective') && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="flex items-center gap-2 flex-1">
              <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`${t('common.search')}...`}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
              />
            </div>
            <div className="flex items-center gap-2 flex-1">
              <Filter className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <select
                value={filterDepot}
                onChange={(e) => setFilterDepot(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
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
              className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
            >
              <option value="">{t('common.all')} {t('nav.categories').toLowerCase()}</option>
              {sortedCategoriesForSelect.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {tab === 'active' && (
        <div className="space-y-6">
          {filteredCards.length === 0 ? (
            <EmptyState icon={Package} text={t('company.stock.noStock')} />
          ) : (
            groupedByCategory.map((group) => (
              <section key={group.categoryId || group.categoryName} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <header className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-teal-50 via-emerald-50 to-white flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2.5 rounded-xl bg-teal-600 shadow-sm shadow-teal-600/20">
                      <Tag className="w-4 h-4 text-white" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-base font-bold text-gray-900 truncate">{group.categoryName}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {group.cards.length} {group.cards.length === 1 ? 'produkt' : 'produkte'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-2xl font-bold text-gray-900 tabular-nums leading-none">{group.total}</p>
                    <p className="text-[10px] uppercase tracking-wide text-gray-500 mt-1">{t('common.pieces')}</p>
                  </div>
                </header>
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {group.cards.map((c) => {
                const expanded = expandedCard === c.key;
                const sourceTotal = c.sources.repair + c.sources.delivery + c.sources.manual;
                const activeDepots = c.byDepot.filter((d) => d.condition !== 'damaged' && d.quantity > 0);
                return (
                  <div
                    key={c.key}
                    className={`bg-white rounded-xl shadow-sm border ${c.isLegacy ? 'border-amber-200' : 'border-gray-100'} overflow-hidden hover:shadow-md transition-shadow`}
                  >
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <h3 className="text-base font-bold text-gray-900 truncate" title={c.productName}>
                            {c.productName}
                          </h3>
                          {c.isLegacy && (
                            <span className="inline-block mt-1 text-[10px] font-semibold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">{t('common.paProdukt')}</span>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-2xl font-bold text-gray-900 tabular-nums leading-none">{c.total}</p>
                          <p className="text-[10px] uppercase tracking-wide text-gray-400 mt-1">{t('common.pieces')}</p>
                        </div>
                      </div>

                      {sourceTotal > 0 && (
                        <div className="mt-4 grid grid-cols-3 gap-1.5">
                          <SourcePill icon={Hammer} label={t('company.stock.sourceRepair')} value={c.sources.repair} accent="amber" />
                          <SourcePill icon={Truck} label={t('company.stock.sourceDelivery')} value={c.sources.delivery} accent="blue" />
                          <SourcePill icon={Hand} label={t('company.stock.sourceManual')} value={c.sources.manual} accent="slate" />
                        </div>
                      )}

                      {c.damaged > 0 && (
                        <div className="mt-3 flex items-center gap-3 text-xs">
                          <span className="inline-flex items-center gap-1 text-rose-600">
                            <ShieldAlert className="w-3 h-3" />
                            {c.damaged} {t('company.stock.damaged').toLowerCase()}
                          </span>
                        </div>
                      )}
                    </div>

                    {activeDepots.length > 0 && (
                      <div className="border-t border-gray-50 bg-gray-50/40">
                        <button
                          onClick={() => setExpandedCard(expanded ? null : c.key)}
                          className="w-full px-5 py-2.5 flex items-center justify-between text-xs font-medium text-gray-600 hover:text-gray-900 transition-colors"
                        >
                          <span className="inline-flex items-center gap-1.5">
                            <Layers className="w-3.5 h-3.5" />
                            {activeDepots.length} {t('company.deliveryNotes.depot').toLowerCase()}
                          </span>
                          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                        {expanded && (
                          <div className="px-5 pb-4 space-y-1.5">
                            {activeDepots.map((d) => (
                              <div key={d.stockId} className="flex items-center justify-between text-sm bg-white rounded-lg px-3 py-2 border border-gray-100">
                                <span className="text-gray-700 inline-flex items-center gap-2">
                                  <Building2 className="w-3.5 h-3.5 text-gray-400" />
                                  {d.depotName}
                                  {d.condition === 'damaged' && (
                                    <span className="text-[10px] uppercase font-semibold text-rose-700 bg-rose-100 rounded px-1">D</span>
                                  )}
                                </span>
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-gray-900 tabular-nums">{d.quantity}</span>
                                  {d.isLegacy && (
                                    <button
                                      onClick={() => {
                                        setReassignTarget({ stockId: d.stockId, categoryId: c.categoryId, depotName: d.depotName, quantity: d.quantity, condition: d.condition });
                                        setReassignProductId('');
                                      }}
                                      className="text-[10px] font-semibold uppercase tracking-wide text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded px-2 py-0.5 inline-flex items-center gap-1"
                                    >
                                      <ArrowRightCircle className="w-3 h-3" />
                                      {t('common.assign')}
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
                </div>
              </section>
            ))
          )}
        </div>
      )}

      {tab === 'defective' && (
        <div className="space-y-3">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-900 text-sm">{t('company.stock.defectiveTitle')}</p>
              <p className="text-amber-800 text-xs mt-0.5">{t('company.stock.defectiveSubtitle')}</p>
            </div>
          </div>
          {damagedRows.length === 0 ? (
            <EmptyState icon={ShieldAlert} text={t('company.stock.noDefective')} />
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="divide-y divide-gray-50">
                {damagedRows.map((c) => (
                  <div key={c.key} className="p-4 flex items-center justify-between gap-4 hover:bg-gray-50/50 transition-colors">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{c.categoryName}</span>
                      </div>
                      <p className="text-sm font-semibold text-gray-900 mt-0.5">{c.productName}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {c.byDepot.filter((d) => isDamageLike(d.condition as StockCondition)).map((d) => `${d.depotName}: ${d.quantity}`).join(' · ')}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-2xl font-bold text-rose-600 tabular-nums">{c.damaged}</p>
                      <p className="text-[10px] uppercase tracking-wide text-rose-400">{t('company.stock.damaged').toLowerCase()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'movements' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-4 border-b border-gray-100 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-teal-600" />
            <h2 className="text-base font-semibold text-gray-900">{t('depot.stock.movementHistory')}</h2>
          </div>
          {movementsByDate.length === 0 ? (
            <EmptyState icon={Package} text={t('common.noData')} />
          ) : (
            <div>
              {movementsByDate.map(([date, group]) => (
                <div key={date} className="border-b border-gray-50 last:border-b-0">
                  <div className="px-5 py-2 bg-gray-50/60 text-xs font-semibold text-gray-600 uppercase tracking-wide flex items-center justify-between">
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
              ))}
            </div>
          )}
        </div>
      )}

      {showRegisterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowRegisterModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-100 sticky top-0 bg-white z-10">
              <h2 className="text-lg font-semibold text-gray-900">{t('companyAdmin.stock.registerStock')}</h2>
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
            <div className="flex items-center justify-end gap-3 p-4 sm:p-6 border-t border-gray-100 sticky bottom-0 bg-white pb-[max(1rem,env(safe-area-inset-bottom))]">
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

      {reassignTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setReassignTarget(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">{t('common.assignProduct')}</h2>
              <button onClick={() => setReassignTarget(null)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-gray-50 rounded-lg p-3 text-sm">
                <p className="text-gray-600">
                  <span className="font-medium text-gray-900">{reassignTarget.depotName}</span>
                  {' · '}
                  <span className="font-semibold tabular-nums">{reassignTarget.quantity}</span>
                  {' '}{t('common.pieces')}
                  {' · '}
                  <span className="text-gray-500">{categoryById.get(reassignTarget.categoryId)?.name ?? ''}</span>
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('company.stock.product')}</label>
                <select
                  value={reassignProductId}
                  onChange={(e) => setReassignProductId(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                >
                  <option value="">-</option>
                  {productsForCategory(reassignTarget.categoryId)
                    .slice()
                    .sort((a, b) => epalClassRank(a.name) - epalClassRank(b.name) || a.name.localeCompare(b.name))
                    .map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                {productsForCategory(reassignTarget.categoryId).length === 0 && (
                  <p className="text-xs text-amber-700 mt-1.5">{t('common.nukKaProdukteNeKeteKategori')}</p>
                )}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 p-5 border-t border-gray-100">
              <button
                onClick={() => setReassignTarget(null)}
                className="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleReassign}
                disabled={!reassignProductId || reassignSaving}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50"
              >
                {reassignSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiTile({
  icon: Icon,
  label,
  value,
  accent,
  subtitle,
}: {
  icon: typeof Boxes;
  label: string;
  value: number;
  accent: 'teal' | 'amber' | 'blue' | 'rose';
  subtitle: string;
}) {
  const palette: Record<string, string> = {
    teal: 'bg-teal-50 text-teal-700',
    amber: 'bg-amber-50 text-amber-700',
    blue: 'bg-blue-50 text-blue-700',
    rose: 'bg-rose-50 text-rose-700',
  };
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-500 truncate">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">{value.toLocaleString()}</p>
          {subtitle && <p className="text-[11px] text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        <div className={`p-2 rounded-lg ${palette[accent]}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  accent,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Boxes;
  accent: 'teal' | 'rose' | 'slate';
  children: React.ReactNode;
}) {
  const activeText: Record<string, string> = {
    teal: 'text-teal-700',
    rose: 'text-rose-700',
    slate: 'text-slate-700',
  };
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        active ? `bg-white shadow-sm ${activeText[accent]}` : 'text-gray-600 hover:text-gray-900'
      }`}
    >
      <Icon className="w-4 h-4" />
      {children}
    </button>
  );
}

function SourcePill({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Boxes;
  label: string;
  value: number;
  accent: 'amber' | 'blue' | 'slate';
}) {
  const palette: Record<string, string> = {
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    slate: 'bg-slate-50 text-slate-700 border-slate-100',
  };
  const dim = value === 0 ? 'opacity-50' : '';
  return (
    <div className={`rounded-lg border px-2 py-1.5 ${palette[accent]} ${dim}`}>
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider">
        <Icon className="w-3 h-3" />
        <span className="truncate">{label}</span>
      </div>
      <p className="text-sm font-bold tabular-nums mt-0.5">{value.toLocaleString()}</p>
    </div>
  );
}

function EmptyState({ icon: Icon, text }: { icon: typeof Package; text: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center text-gray-400">
      <Icon className="w-10 h-10 mx-auto mb-3 text-gray-300" />
      <p>{text}</p>
    </div>
  );
}
