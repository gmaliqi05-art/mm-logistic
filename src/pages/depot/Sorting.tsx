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
  ChevronDown,
  ChevronRight,
  Wrench,
  Minus,
  Send,
  Truck,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PageSkeleton } from '../../components/ui/Skeleton';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import type { ProductCategory, PalletSortingBatch, PalletSortingItem } from '../../types';
import { epalClassRank } from '../../utils/productSort';

interface CategoryProduct {
  id: string;
  category_id: string;
  name: string;
}

interface DeliveryNoteSource {
  id: string;
  partner_name?: string | null;
  counterparty_name?: string | null;
  delivered_at?: string | null;
  type?: string | null;
}

interface BatchWithItems extends PalletSortingBatch {
  items: PalletSortingItem[];
  reference_number_snapshot?: string | null;
  report_sent_at?: string | null;
  creator?: { full_name?: string | null } | null;
  completer?: { full_name?: string | null } | null;
  source_delivery_note?: DeliveryNoteSource | null;
}

interface ItemInput {
  category_product_id: string;
  product_name: string;
  quantity: string;
  condition: 'good' | 'damaged';
}

// Sentinel id for the synthetic "Defekt" input row. It is not a real
// category_products.id — when this row is saved we write
// category_product_id = NULL so the damaged quantity is recorded at the
// category level only, matching how pallet companies model defekt stock.
const DEFEKT_INPUT_ID = '__defekt__';

function isDefectProduct(name: string) {
  const n = (name || '').toLowerCase();
  return n.includes('defekt') || n.includes('defect') || n.includes('damaged');
}

const PRIMARY_ORDER = ['a klasse', 'b klasse', 'c klasse', 'defekt'];

function primaryRank(name: string): number {
  const n = (name || '').toLowerCase();
  for (let i = 0; i < PRIMARY_ORDER.length; i++) {
    if (n.includes(PRIMARY_ORDER[i])) return i;
  }
  return 99;
}

type Breakdown = { a: number; b: number; c: number; defekt: number; other: number };

function computeBreakdown(
  items: PalletSortingItem[],
  productNameById: Map<string, string>,
): Breakdown {
  const out: Breakdown = { a: 0, b: 0, c: 0, defekt: 0, other: 0 };
  for (const it of items) {
    const name = it.category_product_id
      ? productNameById.get(it.category_product_id) || ''
      : '';
    if (it.condition === 'damaged' || isDefectProduct(name)) {
      out.defekt += it.quantity;
      continue;
    }
    const rank = primaryRank(name);
    if (rank === 0) out.a += it.quantity;
    else if (rank === 1) out.b += it.quantity;
    else if (rank === 2) out.c += it.quantity;
    else out.other += it.quantity;
  }
  return out;
}

function partnerLabel(b: { source_delivery_note?: DeliveryNoteSource | null }): string | null {
  const note = b.source_delivery_note;
  if (!note) return null;
  return note.partner_name || note.counterparty_name || null;
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

  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [itemInputs, setItemInputs] = useState<ItemInput[]>([]);
  const [editTotal, setEditTotal] = useState('');

  useEffect(() => {
    if (profile?.company_id) fetchAll();
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
      const depotId = profile?.depot_id ?? null;

      const batchQuery = supabase
        .from('pallet_sorting_batches')
        .select(`*,
          items:pallet_sorting_items(*),
          creator:profiles!pallet_sorting_batches_created_by_fkey(full_name),
          completer:profiles!pallet_sorting_batches_completed_by_fkey(full_name),
          source_delivery_note:delivery_notes!pallet_sorting_batches_source_delivery_note_id_fkey(
            id, partner_name, counterparty_name, delivered_at, type
          )
        `)
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(30);
      if (depotId) batchQuery.eq('depot_id', depotId);

      const [catRes, prodRes, batchRes] = await Promise.all([
        supabase
          .from('product_categories')
          .select('*')
          .eq('company_id', companyId)
          .order('name'),
        supabase
          .from('category_products')
          .select('id, category_id, name')
          .eq('company_id', companyId)
          .order('name'),
        batchQuery,
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

  const productNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of products) m.set(p.id, p.name);
    return m;
  }, [products]);

  const openBatch = (batch: BatchWithItems) => {
    const cat = categories.find((c) => c.id === batch.category_id);
    const catProducts = (productsByCat.get(batch.category_id) ?? []).slice();

    catProducts.sort((a, b) => {
      if (cat?.sorting_mode === 'class') {
        const pa = primaryRank(a.name);
        const pb = primaryRank(b.name);
        if (pa !== pb) return pa - pb;
        return epalClassRank(a.name) - epalClassRank(b.name);
      }
      return a.name.localeCompare(b.name);
    });

    // Defekt is a category-level bucket — sum every damaged item in the
    // batch regardless of whether it has a product_id (NULL = new model)
    // or sits on the legacy "Defekt" / Klasse A/B/C category_products.
    let damagedTotal = 0;
    for (const item of batch.items) {
      if (item.condition === 'damaged') damagedTotal += item.quantity;
    }

    // Drop any legacy "Defekt" category_product from the per-product rows so
    // it doesn't render twice; we render a single synthetic Defekt row below.
    const productRows: ItemInput[] = catProducts
      .filter((p) => !isDefectProduct(p.name))
      .map((p) => {
        const goodItem = batch.items.find(
          (i) => i.category_product_id === p.id && i.condition === 'good',
        );
        return {
          category_product_id: p.id,
          product_name: p.name,
          quantity: goodItem ? String(goodItem.quantity) : '',
          condition: 'good',
        };
      });

    const inputs: ItemInput[] = [
      ...productRows,
      {
        category_product_id: DEFEKT_INPUT_ID,
        product_name: 'Defekt',
        quantity: damagedTotal > 0 ? String(damagedTotal) : '',
        condition: 'damaged',
      },
    ];

    setActiveBatchId(batch.id);
    setItemInputs(inputs);
    setEditTotal(String(batch.total_received));
  };

  const closeBatch = () => {
    setActiveBatchId(null);
    setItemInputs([]);
    setEditTotal('');
  };

  async function persistItems(batchId: string) {
    const rows: Array<{
      batch_id: string;
      category_product_id: string | null;
      quantity: number;
      condition: string;
    }> = [];

    // Class/product rows save with their real category_product_id; the
    // synthetic Defekt row saves with NULL so the damaged quantity lives at
    // the category level (no fictional "Defekt" product behind it).
    for (const r of itemInputs) {
      const qty = Math.max(0, parseInt(r.quantity || '0', 10) || 0);
      if (qty <= 0) continue;
      const isDefektRow = r.category_product_id === DEFEKT_INPUT_ID;
      rows.push({
        batch_id: batchId,
        category_product_id: isDefektRow ? null : r.category_product_id,
        quantity: qty,
        condition: isDefektRow ? 'damaged' : r.condition === 'damaged' ? 'damaged' : 'good',
      });
    }

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

  async function handleSendReport(batch: BatchWithItems) {
    try {
      setSubmitting(true);
      setError(null);
      const { error: updErr } = await supabase
        .from('pallet_sorting_batches')
        .update({ report_sent_at: new Date().toISOString() })
        .eq('id', batch.id);
      if (updErr) throw updErr;

      const cat = categories.find((c) => c.id === batch.category_id);
      const itemsSummary = batch.items
        .filter((i) => i.quantity > 0)
        .map((i) => {
          const label =
            i.condition === 'damaged'
              ? 'Defekt'
              : products.find((p) => p.id === i.category_product_id)?.name || '-';
          return `${label}: ${i.quantity}`;
        })
        .join(', ');

      const { data: admins } = await supabase
        .from('profiles')
        .select('id')
        .eq('company_id', profile!.company_id!)
        .eq('role', 'company_admin')
        .eq('is_active', true);

      if (admins && admins.length > 0) {
        const rows = admins.map((a) => ({
          user_id: a.id,
          type: 'delivery',
          title: 'Raport sortimi',
          message: `${cat?.name || 'Kategori'} (${batch.reference_number_snapshot || '-'}): ${itemsSummary}`,
          data: JSON.stringify({
            url: '/company/sorting-reports',
            batch_id: batch.id,
            category: cat?.name,
            total_received: batch.total_received,
            items: batch.items.filter((i) => i.quantity > 0).map((i) => ({
              product_name:
                i.condition === 'damaged'
                  ? 'Defekt'
                  : products.find((p) => p.id === i.category_product_id)?.name || '-',
              quantity: i.quantity,
              condition: i.condition,
            })),
          }),
          reference_id: batch.id,
          is_read: false,
          push_sent: false,
        }));
        await supabase.from('notifications').insert(rows);
      }

      setSuccess(t('depot.sorting.reportSent') || 'Raporti u dergua me sukses');
      setTimeout(() => setSuccess(null), 3000);
      await fetchAll();
    } catch (err: any) {
      setError(err.message || 'Gabim gjate dergimit te raportit');
    } finally {
      setSubmitting(false);
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
    return <PageSkeleton rows={6} cols={5} />;
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
            <Package className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            <p className="font-medium text-gray-500">{t('depot.sorting.noActiveBatches')}</p>
            <p className="mt-1 text-xs text-gray-400">
              Sortimet shfaqen automatikisht kur regjistrohet nje fletmarrje me artikuj per sortim.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {inProgress.map((b) => {
              const cat = categories.find((c) => c.id === b.category_id);
              const sorted = b.items.reduce((s, i) => s + i.quantity, 0);
              const pct = b.total_received > 0 ? Math.min(100, Math.round((sorted / b.total_received) * 100)) : 0;
              const partner = partnerLabel(b);
              const deliveryDate = b.source_delivery_note?.delivered_at;
              const bd = computeBreakdown(b.items, productNameById);
              return (
                <button
                  key={b.id}
                  onClick={() => openBatch(b)}
                  className="bg-white border border-gray-100 hover:border-teal-300 rounded-xl p-4 text-left transition-colors shadow-sm hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{cat?.name ?? '-'}</p>
                      {partner && (
                        <p className="text-xs text-slate-700 mt-0.5 flex items-center gap-1 truncate">
                          <Truck className="w-3 h-3 text-slate-400 flex-shrink-0" />
                          <span className="truncate font-medium">{partner}</span>
                        </p>
                      )}
                      <p className="text-xs text-gray-500 mt-0.5">
                        {b.reference_number_snapshot && <span className="text-teal-600 font-medium">{b.reference_number_snapshot} · </span>}
                        {deliveryDate
                          ? new Date(deliveryDate).toLocaleDateString()
                          : new Date(b.created_at).toLocaleDateString()}
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
                  {sorted > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                      {bd.a > 0 && <span className="text-[11px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium">A: {bd.a}</span>}
                      {bd.b > 0 && <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-medium">B: {bd.b}</span>}
                      {bd.c > 0 && <span className="text-[11px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 font-medium">C: {bd.c}</span>}
                      {bd.defekt > 0 && <span className="text-[11px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 font-medium">Defekt: {bd.defekt}</span>}
                      {bd.other > 0 && <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">Te tjera: {bd.other}</span>}
                    </div>
                  )}
                  {(b.creator?.full_name || b.completer?.full_name) && (
                    <p className="text-[11px] text-slate-500 mt-2">
                      {b.creator?.full_name && <>Krijuar nga: <span className="font-medium">{b.creator.full_name}</span></>}
                      {b.completer?.full_name && b.completer.full_name !== b.creator?.full_name && (
                        <> · Mbaruar nga: <span className="font-medium">{b.completer.full_name}</span></>
                      )}
                    </p>
                  )}
                  {b.notes && (
                    <p className="text-xs text-gray-500 mt-1 line-clamp-1">{b.notes}</p>
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
                const partner = partnerLabel(b);
                const bd = computeBreakdown(b.items, productNameById);
                return (
                  <li key={b.id} className="flex items-start gap-3 px-4 py-3">
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
                        {partner && <span className="font-medium text-slate-600">{partner} &middot; </span>}
                        {b.reference_number_snapshot && <span className="text-teal-600">{b.reference_number_snapshot} &middot; </span>}
                        {sorted} / {b.total_received} &middot;{' '}
                        {new Date(b.completed_at || b.updated_at).toLocaleDateString()}
                      </p>
                      {b.status === 'completed' && sorted > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {bd.a > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium">A: {bd.a}</span>}
                          {bd.b > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-medium">B: {bd.b}</span>}
                          {bd.c > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 font-medium">C: {bd.c}</span>}
                          {bd.defekt > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 font-medium">Defekt: {bd.defekt}</span>}
                          {bd.other > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">Te tjera: {bd.other}</span>}
                        </div>
                      )}
                    </div>
                    {b.status === 'completed' && !b.report_sent_at && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleSendReport(b); }}
                        disabled={submitting}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors disabled:opacity-50"
                      >
                        <Send className="w-3 h-3" /> Dergo raportin
                      </button>
                    )}
                    {b.status === 'completed' && b.report_sent_at && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-teal-50 text-teal-700">
                        Raporti u dergua
                      </span>
                    )}
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

      {/* Active Batch Modal */}
      {currentBatch && (
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
                    {currentCategory?.name ?? t('depot.sorting.title')}
                  </h2>
                  <p className="text-xs text-gray-500">
                    {currentCategory ? t(`depot.sorting.mode.${currentCategory.sorting_mode}`) : '-'} &middot;{' '}
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

              <SortingItemsGrid
                itemInputs={itemInputs}
                setItemInputs={setItemInputs}
                isClassMode={currentCategory?.sorting_mode === 'class'}
              />
              <OtherCategoriesPanel
                currentCategoryId={currentCategory?.id ?? ''}
                categories={categories}
                batches={batches}
                onOpen={(b) => openBatch(b)}
              />

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
                  onClick={() => {
                    if (Math.abs(diff) > 0) {
                      if (!window.confirm(`Ka nje diference prej ${diff} paletash. Vazhdo me perfundimin e sortimit?`)) return;
                    }
                    handleComplete();
                  }}
                  disabled={submitting || sortedTotal === 0}
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

    </div>
  );
}

function SortingItemsGrid({
  itemInputs,
  setItemInputs,
  isClassMode,
}: {
  itemInputs: ItemInput[];
  setItemInputs: (r: ItemInput[]) => void;
  isClassMode: boolean;
}) {
  if (itemInputs.length === 0) {
    return (
      <div className="text-center py-6 text-gray-400 text-sm">
        <Package className="w-8 h-8 mx-auto mb-2 text-gray-300" />
        Nuk ka produkte per kete kategori
      </div>
    );
  }

  const primary = isClassMode ? itemInputs.filter((r) => primaryRank(r.product_name) < 99) : itemInputs;
  const extras = isClassMode ? itemInputs.filter((r) => primaryRank(r.product_name) >= 99) : [];

  function updateQty(index: number, next: string) {
    const copy = itemInputs.slice();
    copy[index] = { ...copy[index], quantity: next };
    setItemInputs(copy);
  }

  function bump(index: number, delta: number) {
    const copy = itemInputs.slice();
    const current = parseInt(copy[index].quantity || '0', 10) || 0;
    copy[index] = { ...copy[index], quantity: String(Math.max(0, current + delta)) };
    setItemInputs(copy);
  }

  const renderRow = (row: ItemInput) => {
    const realIdx = itemInputs.indexOf(row);
    const isDefect = isDefectProduct(row.product_name);
    const rank = primaryRank(row.product_name);
    const tone: Record<number, string> = {
      0: 'border-emerald-200 bg-emerald-50',
      1: 'border-amber-200 bg-amber-50',
      2: 'border-sky-200 bg-sky-50',
      3: 'border-rose-200 bg-rose-50',
    };
    const iconTone: Record<number, string> = {
      0: 'bg-emerald-100 text-emerald-700',
      1: 'bg-amber-100 text-amber-700',
      2: 'bg-sky-100 text-sky-700',
      3: 'bg-rose-100 text-rose-700',
    };
    const shell = isDefect
      ? 'border-rose-200 bg-rose-50'
      : isClassMode && rank < 99
      ? tone[rank] ?? 'border-gray-100 bg-white'
      : 'border-gray-100 bg-white';
    const iconShell = isDefect
      ? 'bg-rose-100 text-rose-700'
      : isClassMode && rank < 99
      ? iconTone[rank] ?? 'bg-teal-100 text-teal-700'
      : 'bg-teal-100 text-teal-700';

    return (
      <div
        key={row.category_product_id}
        className={`flex items-center gap-3 p-3 rounded-lg border ${shell}`}
      >
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${iconShell}`}>
          {isDefect ? <Wrench className="w-4 h-4" /> : <Package className="w-4 h-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{row.product_name}</p>
          {isDefect && <p className="text-[11px] text-rose-600">Shkon automatikisht ne stokun e defekteve</p>}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => bump(realIdx, -1)}
            className={`w-7 h-7 rounded-lg border flex items-center justify-center ${
              isDefect
                ? 'bg-white border-rose-200 text-rose-600 hover:bg-rose-50'
                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Minus className="w-3 h-3" />
          </button>
          <input
            type="number"
            min="0"
            inputMode="numeric"
            value={row.quantity}
            onChange={(e) => updateQty(realIdx, e.target.value)}
            className={`w-16 px-2 py-1.5 border rounded-lg focus:outline-none text-sm text-right font-bold ${
              isDefect
                ? 'border-rose-200 bg-white text-rose-700 placeholder-rose-300 focus:ring-2 focus:ring-rose-400'
                : 'border-gray-200 bg-white focus:ring-2 focus:ring-teal-500'
            }`}
            placeholder="0"
          />
          <button
            type="button"
            onClick={() => bump(realIdx, 1)}
            className={`w-7 h-7 rounded-lg border flex items-center justify-center ${
              isDefect
                ? 'bg-white border-rose-200 text-rose-600 hover:bg-rose-50'
                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 px-3 pb-1">
        <div className="w-9 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Produkti</span>
        </div>
        <div className="w-[7.5rem] text-center">
          <span className="text-[11px] font-semibold text-teal-700 uppercase tracking-wide">Sasia</span>
        </div>
      </div>
      {primary.map(renderRow)}
      {extras.length > 0 && (
        <details className="rounded-lg border border-gray-100 bg-gray-50/50 open:bg-white">
          <summary className="cursor-pointer list-none p-3 flex items-center gap-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg">
            <ChevronRight className="w-4 h-4 text-gray-400 transition-transform details-chevron" />
            Produkte te tjera te kategorise ({extras.length})
          </summary>
          <div className="p-2 pt-0 space-y-2">{extras.map(renderRow)}</div>
        </details>
      )}
    </div>
  );
}

function OtherCategoriesPanel({
  currentCategoryId,
  categories,
  batches,
  onOpen,
}: {
  currentCategoryId: string;
  categories: ProductCategory[];
  batches: BatchWithItems[];
  onOpen: (b: BatchWithItems) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  // Only show categories that already have an in-progress batch (auto-created
  // from an incoming delivery). Manual batch creation was removed in favour of
  // the auto-flow.
  const otherActive = categories
    .filter((c) => c.id !== currentCategoryId)
    .map((c) => ({ cat: c, batch: batches.find((b) => b.category_id === c.id && b.status === 'in_progress') }))
    .filter((x): x is { cat: ProductCategory; batch: BatchWithItems } => Boolean(x.batch));

  if (otherActive.length === 0) return null;

  return (
    <div className="rounded-xl border border-gray-100 bg-white">
      <button
        type="button"
        onClick={() => setExpanded((s) => !s)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 rounded-xl"
      >
        <span className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-teal-600" />
          Sortime te tjera aktive ({otherActive.length})
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 pt-0">
          {otherActive.map(({ cat: c, batch }) => {
            const sorted = batch.items.reduce((s, i) => s + i.quantity, 0);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onOpen(batch)}
                className="text-left rounded-lg border border-gray-100 hover:border-teal-300 hover:bg-teal-50/50 transition-colors p-3 flex items-center gap-3"
              >
                <div className="w-9 h-9 rounded-lg bg-gray-100 text-gray-600 flex items-center justify-center flex-shrink-0">
                  <Package className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                  <p className="text-[11px] text-gray-500">{sorted}/{batch.total_received} paleta</p>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-400" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
