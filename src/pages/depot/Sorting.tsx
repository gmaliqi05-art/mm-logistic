import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Layers,
  Plus,
  Loader2,
  AlertTriangle,
  X,
  CheckCircle2,
  Clock,
  Package,
  Trash2,
  ArrowRight,
  ScanLine,
} from 'lucide-react';
import PalletScanner from '../../components/scanner/PalletScanner';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import type { ProductCategory, PalletSortingBatch, PalletSortingItem } from '../../types';
import { epalClassRank } from '../../utils/productSort';

interface CategoryProduct {
  id: string;
  category_id: string;
  name: string;
}

interface BatchWithItems extends PalletSortingBatch {
  items: PalletSortingItem[];
  source_delivery_note_id?: string | null;
  reference_number_snapshot?: string | null;
}

interface ItemInput {
  category_product_id: string;
  product_name: string;
  quantity: string;
  condition: 'good' | 'damaged';
}

function isDefectProduct(name: string) {
  const n = (name || '').toLowerCase();
  return n.includes('defekt') || n.includes('defect') || n.includes('damaged');
}

export default function DepotSorting() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [products, setProducts] = useState<CategoryProduct[]>([]);
  const [batches, setBatches] = useState<BatchWithItems[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [showNewBatch, setShowNewBatch] = useState(false);
  const [showPalletScanner, setShowPalletScanner] = useState(false);
  const [newCategoryId, setNewCategoryId] = useState('');
  const [newTotalReceived, setNewTotalReceived] = useState('');
  const [newNotes, setNewNotes] = useState('');

  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [itemInputs, setItemInputs] = useState<ItemInput[]>([]);
  const [editTotal, setEditTotal] = useState('');

  useEffect(() => {
    if (profile?.depot_id && profile?.company_id) fetchAll();
  }, [profile?.depot_id, profile?.company_id]);

  useEffect(() => {
    const batchId = searchParams.get('batch');
    if (!batchId || batches.length === 0) return;
    const b = batches.find((x) => x.id === batchId);
    if (b && activeBatchId !== b.id) openBatch(b);
  }, [searchParams, batches]);

  async function fetchAll() {
    try {
      setLoading(true);
      setError(null);
      const companyId = profile!.company_id!;
      const depotId = profile!.depot_id!;

      const [catRes, prodRes, batchRes] = await Promise.all([
        supabase
          .from('product_categories')
          .select('*')
          .eq('company_id', companyId)
          .in('sorting_mode', ['class', 'type'])
          .order('name'),
        supabase
          .from('category_products')
          .select('id, category_id, name')
          .eq('company_id', companyId)
          .order('name'),
        supabase
          .from('pallet_sorting_batches')
          .select('*, items:pallet_sorting_items(*)')
          .eq('company_id', companyId)
          .eq('depot_id', depotId)
          .order('created_at', { ascending: false })
          .limit(30),
      ]);

      if (catRes.error) throw catRes.error;
      if (prodRes.error) throw prodRes.error;
      if (batchRes.error) throw batchRes.error;

      setCategories((catRes.data ?? []) as ProductCategory[]);
      setProducts((prodRes.data ?? []) as CategoryProduct[]);
      setBatches((batchRes.data ?? []) as BatchWithItems[]);
    } catch (err: any) {
      setError(err.message || t('common.errorLoading'));
    } finally {
      setLoading(false);
    }
  }

  const productsByCat = useMemo(() => {
    const m = new Map<string, CategoryProduct[]>();
    for (const p of products) {
      if (!m.has(p.category_id)) m.set(p.category_id, []);
      m.get(p.category_id)!.push(p);
    }
    return m;
  }, [products]);

  const openBatch = (batch: BatchWithItems) => {
    const cat = categories.find((c) => c.id === batch.category_id);
    const catProducts = (productsByCat.get(batch.category_id) ?? []).slice();

    catProducts.sort((a, b) => {
      if (cat?.sorting_mode === 'class') {
        return epalClassRank(a.name) - epalClassRank(b.name);
      }
      return a.name.localeCompare(b.name);
    });

    const inputs: ItemInput[] = catProducts.map((p) => {
      const existing = batch.items.find((i) => i.category_product_id === p.id);
      return {
        category_product_id: p.id,
        product_name: p.name,
        quantity: existing ? String(existing.quantity) : '',
        condition: existing
          ? (existing.condition as 'good' | 'damaged')
          : isDefectProduct(p.name) ? 'damaged' : 'good',
      };
    });

    setActiveBatchId(batch.id);
    setItemInputs(inputs);
    setEditTotal(String(batch.total_received));
  };

  const closeBatch = () => {
    setActiveBatchId(null);
    setItemInputs([]);
    setEditTotal('');
  };

  async function handleCreateBatch() {
    if (!newCategoryId) return;
    const total = Math.max(0, parseInt(newTotalReceived || '0', 10) || 0);
    try {
      setSubmitting(true);
      setError(null);
      const companyId = profile!.company_id!;
      const depotId = profile!.depot_id!;

      const { data, error: insErr } = await supabase
        .from('pallet_sorting_batches')
        .insert({
          company_id: companyId,
          depot_id: depotId,
          category_id: newCategoryId,
          total_received: total,
          notes: newNotes,
          created_by: profile!.id,
        })
        .select('*, items:pallet_sorting_items(*)')
        .maybeSingle();

      if (insErr) throw insErr;

      setShowNewBatch(false);
      setNewCategoryId('');
      setNewTotalReceived('');
      setNewNotes('');
      await fetchAll();
      if (data) openBatch(data as BatchWithItems);
    } catch (err: any) {
      setError(err.message || t('common.errorSaving'));
    } finally {
      setSubmitting(false);
    }
  }

  async function persistItems(batchId: string) {
    const rows = itemInputs
      .map((r) => ({
        batch_id: batchId,
        category_product_id: r.category_product_id,
        quantity: Math.max(0, parseInt(r.quantity || '0', 10) || 0),
        condition: r.condition,
      }))
      .filter((r) => r.quantity > 0);

    const { error: delErr } = await supabase
      .from('pallet_sorting_items')
      .delete()
      .eq('batch_id', batchId);
    if (delErr) throw delErr;

    if (rows.length > 0) {
      const { error: insErr } = await supabase.from('pallet_sorting_items').insert(rows);
      if (insErr) throw insErr;
    }

    const total = Math.max(0, parseInt(editTotal || '0', 10) || 0);
    const { error: updErr } = await supabase
      .from('pallet_sorting_batches')
      .update({ total_received: total })
      .eq('id', batchId);
    if (updErr) throw updErr;
  }

  async function handleSaveProgress() {
    if (!activeBatchId) return;
    try {
      setSubmitting(true);
      setError(null);
      await persistItems(activeBatchId);
      setSuccess(t('depot.sorting.progressSaved'));
      setTimeout(() => setSuccess(null), 2500);
      await fetchAll();
    } catch (err: any) {
      setError(err.message || t('common.errorSaving'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleComplete() {
    if (!activeBatchId) return;
    try {
      setSubmitting(true);
      setError(null);
      await persistItems(activeBatchId);
      const { error: updErr } = await supabase
        .from('pallet_sorting_batches')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          completed_by: profile!.id,
        })
        .eq('id', activeBatchId);
      if (updErr) throw updErr;

      setSuccess(t('depot.sorting.committedToStock'));
      setTimeout(() => setSuccess(null), 3000);
      closeBatch();
      await fetchAll();
    } catch (err: any) {
      setError(err.message || t('common.errorSaving'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(batchId: string) {
    if (!window.confirm(t('depot.sorting.confirmCancel'))) return;
    try {
      setSubmitting(true);
      const { error: updErr } = await supabase
        .from('pallet_sorting_batches')
        .update({ status: 'cancelled' })
        .eq('id', batchId);
      if (updErr) throw updErr;
      if (activeBatchId === batchId) closeBatch();
      await fetchAll();
    } catch (err: any) {
      setError(err.message || t('common.error'));
    } finally {
      setSubmitting(false);
    }
  }

  function normalizeMatch(s: string) {
    return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  function handlePalletScan(code: string) {
    const key = normalizeMatch(code);
    if (!key) return;
    const prod = products.find((p) => normalizeMatch(p.name) === key || normalizeMatch(p.name).includes(key));
    const cat = prod
      ? categories.find((c) => c.id === prod.category_id)
      : categories.find((c) => normalizeMatch(c.name) === key || normalizeMatch(c.name).includes(key));
    if (!cat) {
      setError(t('common.error') + ': ' + code);
      return;
    }
    const existing = batches.find((b) => b.status === 'in_progress' && b.category_id === cat.id);
    if (existing) {
      setShowPalletScanner(false);
      openBatch(existing);
    } else {
      setNewCategoryId(cat.id);
      setNewTotalReceived('');
      setNewNotes('');
      setShowPalletScanner(false);
      setShowNewBatch(true);
    }
  }

  const currentBatch = useMemo(
    () => batches.find((b) => b.id === activeBatchId) ?? null,
    [batches, activeBatchId],
  );
  const currentCategory = useMemo(
    () => (currentBatch ? categories.find((c) => c.id === currentBatch.category_id) ?? null : null),
    [currentBatch, categories],
  );
  const sortedTotal = itemInputs.reduce(
    (s, r) => s + (parseInt(r.quantity || '0', 10) || 0),
    0,
  );
  const totalReceivedNum = parseInt(editTotal || '0', 10) || 0;
  const diff = totalReceivedNum - sortedTotal;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-10 h-10 animate-spin text-teal-600" />
      </div>
    );
  }

  const inProgress = batches.filter((b) => b.status === 'in_progress');
  const recent = batches.filter((b) => b.status !== 'in_progress').slice(0, 8);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Layers className="w-6 h-6 text-teal-600" />
            {t('depot.sorting.title')}
          </h1>
          <p className="text-gray-500 mt-1 text-sm">{t('depot.sorting.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPalletScanner(true)}
            disabled={categories.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-teal-600 text-teal-700 rounded-lg hover:bg-teal-50 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ScanLine className="w-4 h-4" />
            {t('scanner.title') || 'Skano'}
          </button>
          <button
            onClick={() => setShowNewBatch(true)}
            disabled={categories.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            {t('depot.sorting.newBatch')}
          </button>
        </div>
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

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
          <p className="text-green-800 text-sm flex-1">{success}</p>
        </div>
      )}

      {categories.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
          {t('depot.sorting.noSortingCategories')}
        </div>
      )}

      <section>
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4 text-amber-600" />
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
            {t('depot.sorting.inProgress')} ({inProgress.length})
          </h2>
        </div>
        {inProgress.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-xl p-8 text-center text-gray-400 text-sm">
            {t('depot.sorting.noActiveBatches')}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {inProgress.map((b) => {
              const cat = categories.find((c) => c.id === b.category_id);
              const sorted = b.items.reduce((s, i) => s + i.quantity, 0);
              const pct = b.total_received > 0 ? Math.min(100, Math.round((sorted / b.total_received) * 100)) : 0;
              return (
                <button
                  key={b.id}
                  onClick={() => openBatch(b)}
                  className="bg-white border border-gray-100 hover:border-teal-300 rounded-xl p-4 text-left transition-colors shadow-sm hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{cat?.name ?? '-'}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {new Date(b.created_at).toLocaleDateString()} {new Date(b.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  </div>
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-2xl font-bold text-teal-700">{sorted}</span>
                    <span className="text-sm text-gray-400">/ {b.total_received}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-teal-500 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {b.notes && (
                    <p className="text-xs text-gray-500 mt-2 line-clamp-1">{b.notes}</p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {recent.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
            {t('depot.sorting.recent')}
          </h2>
          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
            <ul className="divide-y divide-gray-50">
              {recent.map((b) => {
                const cat = categories.find((c) => c.id === b.category_id);
                const sorted = b.items.reduce((s, i) => s + i.quantity, 0);
                return (
                  <li key={b.id} className="flex items-center gap-3 px-4 py-3">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        b.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                      }`}
                    >
                      {b.status === 'completed' ? <CheckCircle2 className="w-4 h-4" /> : <X className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{cat?.name ?? '-'}</p>
                      <p className="text-xs text-gray-500">
                        {sorted} / {b.total_received} &middot;{' '}
                        {new Date(b.completed_at || b.updated_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                        b.status === 'completed'
                          ? 'bg-green-50 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {t(`depot.sorting.status.${b.status}`)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}

      {/* New Batch Modal */}
      {showNewBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowNewBatch(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">{t('depot.sorting.newBatch')}</h2>
              <button
                onClick={() => setShowNewBatch(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t('depot.sorting.category')}
                </label>
                <select
                  value={newCategoryId}
                  onChange={(e) => setNewCategoryId(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                >
                  <option value="">{t('depot.sorting.selectCategory')}</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({t(`depot.sorting.mode.${c.sorting_mode}`)})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t('depot.sorting.totalReceived')}
                </label>
                <input
                  type="number"
                  min="0"
                  value={newTotalReceived}
                  onChange={(e) => setNewTotalReceived(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                  placeholder="e.g. 660"
                />
                <p className="text-xs text-gray-500 mt-1">{t('depot.sorting.totalReceivedHint')}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t('common.notes')}
                </label>
                <textarea
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 p-5 border-t border-gray-100">
              <button
                onClick={() => setShowNewBatch(false)}
                className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleCreateBatch}
                disabled={submitting || !newCategoryId}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('depot.sorting.startSorting')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Batch Modal */}
      {currentBatch && currentCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={closeBatch} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center flex-shrink-0">
                  <Layers className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-gray-900 truncate">
                    {currentCategory.name}
                  </h2>
                  <p className="text-xs text-gray-500">
                    {t(`depot.sorting.mode.${currentCategory.sorting_mode}`)} &middot;{' '}
                    {new Date(currentBatch.created_at).toLocaleString()}
                  </p>
                  {currentBatch.reference_number_snapshot && (
                    <p className="text-xs text-teal-700 mt-0.5 font-medium">
                      {t('depot.sorting.fromNote')}: {currentBatch.reference_number_snapshot}
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={closeBatch}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gray-50 rounded-lg p-3">
                  <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-1">
                    {t('depot.sorting.totalReceived')}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={editTotal}
                    onChange={(e) => setEditTotal(e.target.value)}
                    className="w-full px-2 py-1 border border-gray-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 text-base font-semibold"
                  />
                </div>
                <div className="bg-teal-50 rounded-lg p-3">
                  <p className="text-[11px] font-medium text-teal-700 uppercase tracking-wide mb-1">
                    {t('depot.sorting.sorted')}
                  </p>
                  <p className="text-xl font-bold text-teal-800">{sortedTotal}</p>
                </div>
                <div
                  className={`rounded-lg p-3 ${
                    diff === 0 ? 'bg-green-50' : diff > 0 ? 'bg-amber-50' : 'bg-red-50'
                  }`}
                >
                  <p
                    className={`text-[11px] font-medium uppercase tracking-wide mb-1 ${
                      diff === 0 ? 'text-green-700' : diff > 0 ? 'text-amber-700' : 'text-red-700'
                    }`}
                  >
                    {t('depot.sorting.remaining')}
                  </p>
                  <p
                    className={`text-xl font-bold ${
                      diff === 0 ? 'text-green-800' : diff > 0 ? 'text-amber-800' : 'text-red-800'
                    }`}
                  >
                    {diff}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {itemInputs.length === 0 ? (
                  <div className="text-center py-6 text-gray-400 text-sm">
                    <Package className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    {t('depot.sorting.noProductsForCategory')}
                  </div>
                ) : (
                  itemInputs.map((row, idx) => {
                    const isDefect = isDefectProduct(row.product_name);
                    return (
                      <div
                        key={row.category_product_id}
                        className={`flex items-center gap-3 p-3 rounded-lg border ${
                          isDefect ? 'bg-red-50 border-red-100' : 'bg-white border-gray-100'
                        }`}
                      >
                        <div
                          className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            isDefect ? 'bg-red-100 text-red-700' : 'bg-teal-100 text-teal-700'
                          }`}
                        >
                          <Package className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {row.product_name}
                          </p>
                          {isDefect && (
                            <p className="text-[11px] text-red-600">
                              {t('depot.sorting.goesToRepair')}
                            </p>
                          )}
                        </div>
                        <input
                          type="number"
                          min="0"
                          inputMode="numeric"
                          value={row.quantity}
                          onChange={(e) => {
                            const copy = itemInputs.slice();
                            copy[idx] = { ...row, quantity: e.target.value };
                            setItemInputs(copy);
                          }}
                          className="w-24 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm text-right font-semibold"
                          placeholder="0"
                        />
                      </div>
                    );
                  })
                )}
              </div>

              {currentBatch.notes && (
                <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
                  {currentBatch.notes}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 p-5 border-t border-gray-100">
              <button
                onClick={() => handleCancel(currentBatch.id)}
                disabled={submitting}
                className="inline-flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                {t('depot.sorting.cancelBatch')}
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveProgress}
                  disabled={submitting}
                  className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  {t('depot.sorting.saveProgress')}
                </button>
                <button
                  onClick={handleComplete}
                  disabled={submitting || sortedTotal === 0 || diff !== 0}
                  title={diff !== 0 ? t('depot.sorting.mustMatchTotal') : ''}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <CheckCircle2 className="w-4 h-4" />
                  {t('depot.sorting.completeAndPost')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <PalletScanner
        open={showPalletScanner}
        onClose={() => setShowPalletScanner(false)}
        onScan={handlePalletScan}
        context="sorting"
        continuous={false}
        title={t('scanner.title') || 'Skano paleten'}
      />
    </div>
  );
}
