import { useState, useEffect, useMemo, useRef } from 'react';
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
  creator?: { full_name?: string | null; role?: string | null } | null;
  completer?: { full_name?: string | null; role?: string | null } | null;
  source_delivery_note?: DeliveryNoteSource | null;
}

interface ItemInput {
  category_product_id: string;
  product_name: string;
  quantity: string;
  condition: 'good' | 'damaged';
}

interface ExtraItem {
  category_id: string;
  category_product_id: string;
  category_name: string;
  product_name: string;
  quantity: string;
  condition: 'good' | 'damaged';
}

const DEFEKT_INPUT_ID = '__defekt__';

function isDefectProduct(name: string) {
  const n = (name || '').toLowerCase();
  return n.includes('defekt') || n.includes('defect') || n.includes('damaged');
}

const CLASS_PATTERNS: Array<[RegExp, number]> = [
  [/\bklasse\s*a\b|a\s*klasse\b/i, 0],
  [/\bklasse\s*b\b|b\s*klasse\b/i, 1],
  [/\bklasse\s*c\b|c\s*klasse\b/i, 2],
  [/\bdefekt\b|\bdefect\b|\bdamaged\b/i, 3],
];

function primaryRank(name: string): number {
  for (const [re, rank] of CLASS_PATTERNS) {
    if (re.test(name)) return rank;
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

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err) return String((err as { message: unknown }).message);
  return String(err);
}

function partnerLabel(b: { source_delivery_note?: DeliveryNoteSource | null }): string | null {
  const note = b.source_delivery_note;
  if (!note) return null;
  return note.partner_name || note.counterparty_name || null;
}

export default function DepotSorting() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [products, setProducts] = useState<CategoryProduct[]>([]);
  const [batches, setBatches] = useState<BatchWithItems[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [itemInputs, setItemInputs] = useState<ItemInput[]>([]);
  const [extraItems, setExtraItems] = useState<ExtraItem[]>([]);
  const [editTotal, setEditTotal] = useState('');
  const fillDoneRef = useRef(false);

  useEffect(() => {
    if (profile?.company_id) fetchAll();
  }, [profile?.depot_id, profile?.company_id]);

  useEffect(() => {
    const batchId = searchParams.get('batch');
    if (!batchId || batches.length === 0) return;
    const b = batches.find((x) => x.id === batchId && x.status === 'in_progress');
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
          creator:profiles!pallet_sorting_batches_created_by_fkey(full_name, role),
          completer:profiles!pallet_sorting_batches_completed_by_fkey(full_name, role),
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
    } catch (err) {
      setError(errMsg(err));
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
    const isClassMode = cat?.sorting_mode === 'class';

    catProducts.sort((a, b) => {
      if (isClassMode) {
        const pa = primaryRank(a.name);
        const pb = primaryRank(b.name);
        if (pa !== pb) return pa - pb;
        return epalClassRank(a.name) - epalClassRank(b.name);
      }
      return a.name.localeCompare(b.name);
    });

    let damagedTotal = 0;
    for (const item of batch.items) {
      if (item.condition === 'damaged') damagedTotal += item.quantity;
    }

    const hasClassProducts = catProducts.some((p) => primaryRank(p.name) < 3);

    const productRows: ItemInput[] = catProducts
      .filter((p) => {
        if (isDefectProduct(p.name)) return false;
        if (primaryRank(p.name) >= 99 && (isClassMode || hasClassProducts)) return false;
        return true;
      })
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
    setExtraItems([]);
    setEditTotal(String(batch.total_received));
  };

  const closeBatch = () => {
    setActiveBatchId(null);
    setItemInputs([]);
    setExtraItems([]);
    setEditTotal('');
    if (searchParams.has('batch')) {
      setSearchParams((prev) => { prev.delete('batch'); return prev; }, { replace: true });
    }
  };

  async function persistItems(batchId: string) {
    const rows: Array<{
      batch_id: string;
      category_product_id: string | null;
      quantity: number;
      condition: string;
    }> = [];

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

  async function persistExtraItems() {
    if (extraItems.length === 0) return;
    const depotId = profile?.depot_id;
    if (!depotId) return;
    const companyId = profile!.company_id!;

    const rows = extraItems
      .map((item) => {
        const qty = Math.max(0, parseInt(item.quantity || '0', 10) || 0);
        if (qty <= 0) return null;
        const cond = item.condition === 'damaged' ? 'damaged' : 'good';
        return {
          company_id: companyId,
          depot_id: depotId,
          category_id: item.category_id,
          category_product_id: item.category_product_id,
          movement_type: 'entry' as const,
          quantity: qty,
          condition_before: cond,
          condition_after: cond,
          performed_by: profile!.id,
          notes: 'Gjetur gjate sortimit',
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (rows.length === 0) return;
    const { error: movErr } = await supabase.from('stock_movements').insert(rows);
    if (movErr) throw movErr;
  }

  async function handleSaveProgress() {
    if (!activeBatchId) return;
    try {
      setSubmitting(true);
      setError(null);
      await persistItems(activeBatchId);
      await persistExtraItems();
      setExtraItems([]);
      setSuccess(t('depot.sorting.progressSaved'));
      setTimeout(() => setSuccess(null), 2500);
      await fetchAll();
    } catch (err) {
      setError(errMsg(err));
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
      await persistExtraItems();
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
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setSubmitting(false);
    }
  }

  // Reset the "fill applied" guard whenever the open batch changes.
  useEffect(() => { fillDoneRef.current = false; }, [activeBatchId]);

  // Voice fill from the assistant: ?a=&b=&c=&d= set the A/B/C/Defekt quantities
  // on the in-progress batch; ?save=1 completes it to stock. The user can review
  // and edit the numbers before anything is saved.
  useEffect(() => {
    const a = searchParams.get('a'); const b = searchParams.get('b');
    const c = searchParams.get('c'); const d = searchParams.get('d');
    const save = searchParams.get('save') === '1';
    if (a === null && b === null && c === null && d === null && !save) return;

    // Need a batch open. If none, auto-open the single in-progress one.
    if (!activeBatchId) {
      const inProg = batches.filter((x) => x.status === 'in_progress');
      if (inProg.length === 1) openBatch(inProg[0]);
      return; // re-runs after the rows populate
    }
    if (itemInputs.length === 0) return;

    const hasFill = a !== null || b !== null || c !== null || d !== null;
    if (hasFill && !fillDoneRef.current) {
      const num = (v: string | null) => (v === null ? null : String(Math.max(0, parseInt(v, 10) || 0)));
      const av = num(a), bv = num(b), cv = num(c), dv = num(d);
      setItemInputs((prev) => prev.map((r) => {
        if (r.category_product_id === DEFEKT_INPUT_ID) return dv !== null ? { ...r, quantity: dv } : r;
        const pr = primaryRank(r.product_name);
        if (pr === 0 && av !== null) return { ...r, quantity: av };
        if (pr === 1 && bv !== null) return { ...r, quantity: bv };
        if (pr === 2 && cv !== null) return { ...r, quantity: cv };
        return r;
      }));
      fillDoneRef.current = true;
    }

    const sp = new URLSearchParams(searchParams);
    ['a', 'b', 'c', 'd', 'save'].forEach((k) => sp.delete(k));
    setSearchParams(sp, { replace: true });

    if (save) setTimeout(() => { void handleComplete(); }, 400);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, batches, activeBatchId, itemInputs]);

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
    } catch (err) {
      setError(errMsg(err));
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
    } catch (err) {
      setError(errMsg(err));
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
            <p className="mt-1 text-xs text-gray-400">{t('common.sortimetShfaqenAutomatikishtKurRegjistrohetNje')}</p>
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
                  {(() => {
                    const creatorName = b.creator?.role !== 'driver' ? b.creator?.full_name : null;
                    const completerName = b.completer?.role !== 'driver' ? b.completer?.full_name : null;
                    if (!creatorName && !completerName) return null;
                    return (
                      <p className="text-[11px] text-slate-500 mt-2">
                        {creatorName && <>Krijuar nga: <span className="font-medium">{creatorName}</span></>}
                        {completerName && completerName !== creatorName && (
                          <> · Mbaruar nga: <span className="font-medium">{completerName}</span></>
                        )}
                      </p>
                    );
                  })()}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {recent.map((b) => {
              const cat = categories.find((c) => c.id === b.category_id);
              const sorted = b.items.reduce((s, i) => s + i.quantity, 0);
              const partner = partnerLabel(b);
              const bd = computeBreakdown(b.items, productNameById);
              const isCompleted = b.status === 'completed';
              return (
                <div key={b.id} className="bg-white border border-gray-100 rounded-xl p-3 space-y-2">
                  <div className="flex items-start gap-2.5">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        isCompleted ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                      }`}
                    >
                      {isCompleted ? <CheckCircle2 className="w-4 h-4" /> : <X className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-900 truncate">{cat?.name ?? '-'}</p>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${
                            isCompleted ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {t(`depot.sorting.status.${b.status}`)}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {partner && <span className="font-medium text-slate-600">{partner} · </span>}
                        {b.reference_number_snapshot && <span className="text-teal-600">{b.reference_number_snapshot} · </span>}
                        {sorted}/{b.total_received} · {new Date(b.completed_at || b.updated_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  {isCompleted && sorted > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {bd.a > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium">A: {bd.a}</span>}
                      {bd.b > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-medium">B: {bd.b}</span>}
                      {bd.c > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 font-medium">C: {bd.c}</span>}
                      {bd.defekt > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 font-medium">Defekt: {bd.defekt}</span>}
                      {bd.other > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">Te tjera: {bd.other}</span>}
                    </div>
                  )}
                  {isCompleted && !b.report_sent_at && (
                    <button
                      onClick={() => handleSendReport(b)}
                      disabled={submitting}
                      className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors disabled:opacity-50"
                    >
                      <Send className="w-3 h-3" />{t('common.dergoRaportin')}</button>
                  )}
                  {isCompleted && b.report_sent_at && (
                    <div className="flex items-center gap-1.5 text-[11px] text-teal-700">
                      <CheckCircle2 className="w-3 h-3" />
                      <span className="font-medium">Raporti u dergua</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Active Batch Modal */}
      {currentBatch && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
          <div className="fixed inset-0 bg-black/50" onClick={closeBatch} />
          <div className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-2xl max-h-[95dvh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center flex-shrink-0">
                  <Layers className="w-4.5 h-4.5" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-gray-900 truncate">
                    {currentCategory?.name ?? t('depot.sorting.title')}
                  </h2>
                  <p className="text-[11px] text-gray-500">
                    {currentBatch.reference_number_snapshot && (
                      <span className="text-teal-700 font-medium">{currentBatch.reference_number_snapshot} &middot; </span>
                    )}
                    {new Date(currentBatch.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <button
                onClick={closeBatch}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="mx-4 mt-2 bg-red-50 border border-red-200 rounded-lg p-2.5 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                <p className="text-red-700 text-xs flex-1">{error}</p>
                <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {success && (
              <div className="mx-4 mt-2 bg-green-50 border border-green-200 rounded-lg p-2.5 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                <p className="text-green-800 text-xs flex-1">{success}</p>
              </div>
            )}

            <div className="px-4 py-3 space-y-3 overflow-y-auto flex-1">
              {currentBatch.source_delivery_note_id && (
                <div className="bg-sky-50 border border-sky-200 rounded-lg p-2 flex items-center gap-2">
                  <Truck className="w-3.5 h-3.5 text-sky-600 flex-shrink-0" />
                  <p className="text-[11px] text-sky-800">
                    {t('depot.sorting.dataFromCompany')}
                  </p>
                </div>
              )}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-gray-50 rounded-lg p-2.5">
                  <label className="block text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">
                    {t('depot.sorting.totalReceived')}
                  </label>
                  <input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={editTotal}
                    onChange={(e) => setEditTotal(e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 text-lg font-bold"
                  />
                </div>
                <div className="bg-teal-50 rounded-lg p-2.5">
                  <p className="text-[10px] font-medium text-teal-700 uppercase tracking-wide mb-1">
                    {t('depot.sorting.sorted')}
                  </p>
                  <p className="text-2xl font-bold text-teal-800">{sortedTotal}</p>
                </div>
                <div
                  className={`rounded-lg p-2.5 ${
                    diff === 0 ? 'bg-green-50' : diff > 0 ? 'bg-amber-50' : 'bg-red-50'
                  }`}
                >
                  <p
                    className={`text-[10px] font-medium uppercase tracking-wide mb-1 ${
                      diff === 0 ? 'text-green-700' : diff > 0 ? 'text-amber-700' : 'text-red-700'
                    }`}
                  >
                    {t('depot.sorting.remaining')}
                  </p>
                  <p
                    className={`text-2xl font-bold ${
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

              <ExtraProductSelector
                categories={categories}
                productsByCat={productsByCat}
                currentCategoryId={currentCategory?.id ?? ''}
                extraItems={extraItems}
                setExtraItems={setExtraItems}
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

            <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-gray-100">
              <button
                onClick={() => handleCancel(currentBatch.id)}
                disabled={submitting}
                className="inline-flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {t('depot.sorting.cancelBatch')}
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveProgress}
                  disabled={submitting}
                  className="px-3 py-2 text-xs font-semibold text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
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
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <CheckCircle2 className="w-3.5 h-3.5" />
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
  const { t } = useTranslation();
  if (itemInputs.length === 0) {
    return (
      <div className="text-center py-6 text-gray-400 text-sm">
        <Package className="w-8 h-8 mx-auto mb-2 text-gray-300" />{t('common.nukKaProduktePerKeteKategori')}</div>
    );
  }

  const hasClassInputs = itemInputs.some((r) => primaryRank(r.product_name) < 3 && r.category_product_id !== DEFEKT_INPUT_ID);
  const shouldSplit = isClassMode || hasClassInputs;
  const primary = shouldSplit ? itemInputs.filter((r) => primaryRank(r.product_name) < 99 || r.category_product_id === DEFEKT_INPUT_ID) : itemInputs;
  const extras = shouldSplit ? itemInputs.filter((r) => primaryRank(r.product_name) >= 99 && r.category_product_id !== DEFEKT_INPUT_ID) : [];

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

  const CLASS_LETTERS: Record<number, string> = { 0: 'A', 1: 'B', 2: 'C' };

  const renderRow = (row: ItemInput) => {
    const realIdx = itemInputs.indexOf(row);
    const isDefect = isDefectProduct(row.product_name) || row.category_product_id === DEFEKT_INPUT_ID;
    const rank = primaryRank(row.product_name);
    const tone: Record<number, string> = {
      0: 'border-emerald-300 bg-emerald-50',
      1: 'border-amber-300 bg-amber-50',
      2: 'border-sky-300 bg-sky-50',
      3: 'border-rose-300 bg-rose-50',
    };
    const letterTone: Record<number, string> = {
      0: 'bg-emerald-600 text-white',
      1: 'bg-amber-500 text-white',
      2: 'bg-sky-600 text-white',
    };
    const shell = isDefect
      ? 'border-rose-300 bg-rose-50'
      : isClassMode && rank < 99
      ? tone[rank] ?? 'border-gray-200 bg-white'
      : 'border-gray-200 bg-white';

    const showLetter = isClassMode && rank < 3 && !isDefect;

    return (
      <div
        key={row.category_product_id}
        className={`flex items-center gap-2 p-2.5 rounded-lg border-2 ${shell}`}
      >
        {showLetter ? (
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${letterTone[rank] ?? 'bg-teal-600 text-white'}`}>
            <span className="text-base font-black">{CLASS_LETTERS[rank]}</span>
          </div>
        ) : isDefect ? (
          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-rose-600 text-white">
            <span className="text-base font-black">D</span>
          </div>
        ) : (
          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-teal-100 text-teal-700">
            <Package className="w-4 h-4" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-900 truncate">
            {showLetter ? row.product_name.replace(/\s*klasse\s*/i, ' Klasse ').trim() : row.product_name}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => bump(realIdx, -1)}
            className={`w-8 h-8 rounded-lg border flex items-center justify-center active:scale-95 transition-transform ${
              isDefect
                ? 'bg-white border-rose-300 text-rose-600 active:bg-rose-100'
                : 'bg-white border-gray-300 text-gray-700 active:bg-gray-100'
            }`}
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <input
            type="number"
            min="0"
            inputMode="numeric"
            value={row.quantity}
            onChange={(e) => updateQty(realIdx, e.target.value)}
            className={`w-14 px-1 py-1.5 border rounded-lg focus:outline-none text-center text-base font-bold ${
              isDefect
                ? 'border-rose-300 bg-white text-rose-700 placeholder-rose-300 focus:ring-2 focus:ring-rose-400'
                : 'border-gray-300 bg-white focus:ring-2 focus:ring-teal-500'
            }`}
            placeholder="0"
          />
          <button
            type="button"
            onClick={() => bump(realIdx, 1)}
            className={`w-8 h-8 rounded-lg border flex items-center justify-center active:scale-95 transition-transform ${
              isDefect
                ? 'bg-white border-rose-300 text-rose-600 active:bg-rose-100'
                : 'bg-white border-gray-300 text-gray-700 active:bg-gray-100'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-2.5">
      {primary.map(renderRow)}
      {extras.length > 0 && (
        <details className="rounded-xl border border-gray-200 bg-gray-50/50 open:bg-white">
          <summary className="cursor-pointer list-none p-3 flex items-center gap-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-xl">
            <ChevronRight className="w-4 h-4 text-gray-400 transition-transform details-chevron" />
            Produkte te tjera te kategorise ({extras.length})
          </summary>
          <div className="p-2 pt-0 space-y-2.5">{extras.map(renderRow)}</div>
        </details>
      )}
    </div>
  );
}

function ExtraProductSelector({
  categories,
  productsByCat,
  currentCategoryId,
  extraItems,
  setExtraItems,
}: {
  categories: ProductCategory[];
  productsByCat: Map<string, CategoryProduct[]>;
  currentCategoryId: string;
  extraItems: ExtraItem[];
  setExtraItems: (items: ExtraItem[]) => void;
}) {
  const { t } = useTranslation();
  const [showSelector, setShowSelector] = useState(false);
  const [selectedCatId, setSelectedCatId] = useState('');

  const otherCategories = categories.filter((c) => c.id !== currentCategoryId);
  const selectedCatProducts = selectedCatId ? (productsByCat.get(selectedCatId) ?? []) : [];
  const selectedCatName = categories.find((c) => c.id === selectedCatId)?.name ?? '';

  function addProduct(product: CategoryProduct) {
    const already = extraItems.find((e) => e.category_product_id === product.id);
    if (already) return;
    const catName = categories.find((c) => c.id === product.category_id)?.name ?? '';
    setExtraItems([
      ...extraItems,
      {
        category_id: product.category_id,
        category_product_id: product.id,
        category_name: catName,
        product_name: product.name,
        quantity: '',
        condition: 'good',
      },
    ]);
    setShowSelector(false);
    setSelectedCatId('');
  }

  function removeExtra(index: number) {
    const copy = extraItems.slice();
    copy.splice(index, 1);
    setExtraItems(copy);
  }

  function updateExtraQty(index: number, value: string) {
    const copy = extraItems.slice();
    copy[index] = { ...copy[index], quantity: value };
    setExtraItems(copy);
  }

  function bumpExtra(index: number, delta: number) {
    const copy = extraItems.slice();
    const current = parseInt(copy[index].quantity || '0', 10) || 0;
    copy[index] = { ...copy[index], quantity: String(Math.max(0, current + delta)) };
    setExtraItems(copy);
  }

  return (
    <div className="space-y-2">
      {extraItems.map((item, idx) => (
        <div
          key={item.category_product_id}
          className="flex items-center gap-2 p-2.5 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50"
        >
          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-slate-200 text-slate-600">
            <Package className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-900 truncate">{item.product_name}</p>
            <p className="text-[10px] text-slate-500">{item.category_name}</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => bumpExtra(idx, -1)}
              className="w-8 h-8 rounded-lg border bg-white border-slate-300 text-slate-600 flex items-center justify-center active:scale-95 transition-transform active:bg-slate-100"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={item.quantity}
              onChange={(e) => updateExtraQty(idx, e.target.value)}
              className="w-14 px-1 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 text-center text-base font-bold"
              placeholder="0"
            />
            <button
              type="button"
              onClick={() => bumpExtra(idx, 1)}
              className="w-8 h-8 rounded-lg border bg-white border-slate-300 text-slate-600 flex items-center justify-center active:scale-95 transition-transform active:bg-slate-100"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => removeExtra(idx)}
            className="p-1 text-slate-400 hover:text-red-500 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}

      {!showSelector ? (
        <button
          type="button"
          onClick={() => setShowSelector(true)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border-2 border-dashed border-gray-300 text-gray-500 hover:border-teal-400 hover:text-teal-600 hover:bg-teal-50/50 transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          {t('depot.sorting.addExtraProduct')}
        </button>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-700">{t('depot.sorting.addExtraProduct')}</p>
            <button
              type="button"
              onClick={() => { setShowSelector(false); setSelectedCatId(''); }}
              className="p-1 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <select
            value={selectedCatId}
            onChange={(e) => setSelectedCatId(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <option value="">{t('depot.sorting.selectCategory')}</option>
            {otherCategories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {selectedCatId && selectedCatProducts.length > 0 && (
            <div className="grid grid-cols-1 gap-1.5 max-h-48 overflow-y-auto">
              {selectedCatProducts.map((p) => {
                const alreadyAdded = extraItems.some((e) => e.category_product_id === p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={alreadyAdded}
                    onClick={() => addProduct(p)}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-gray-100 hover:border-teal-300 hover:bg-teal-50 transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Package className="w-4 h-4 text-teal-600 flex-shrink-0" />
                    <span className="text-sm font-medium text-gray-900 truncate">{p.name}</span>
                    {alreadyAdded && <span className="text-[10px] text-gray-400 ml-auto">Shtuar</span>}
                  </button>
                );
              })}
            </div>
          )}
          {selectedCatId && selectedCatProducts.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-3">
              {selectedCatName} nuk ka produkte
            </p>
          )}
        </div>
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
