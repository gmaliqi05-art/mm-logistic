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
  parent_batch_id?: string | null;
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

// A "load group" bundles the root sorting batch of an incoming load with all
// its continuation batches (partial sortings), so the list shows one card per
// load instead of one per session.
interface LoadGroup {
  key: string;
  members: BatchWithItems[];        // all batches of the load, newest first
  completedMembers: BatchWithItems[];
  root: BatchWithItems;
  originalTotal: number;            // the full intake quantity
  committedSorted: number;          // sum sorted across completed members
  remaining: number;                // originalTotal - committedSorted
  activeMember: BatchWithItems | null;   // an in-progress continuation, if any
  cancelledMember: BatchWithItems | null;
  latestDate: string;
  allReported: boolean;
}

function buildLoadGroups(batches: BatchWithItems[]): LoadGroup[] {
  const byRoot = new Map<string, BatchWithItems[]>();
  for (const b of batches) {
    const rid = b.parent_batch_id ?? b.id;
    const arr = byRoot.get(rid);
    if (arr) arr.push(b);
    else byRoot.set(rid, [b]);
  }
  const groups: LoadGroup[] = [];
  for (const [rid, members] of byRoot) {
    members.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const root = members.find((m) => m.id === rid) ?? members[members.length - 1];
    const originalTotal = members.reduce((mx, m) => Math.max(mx, m.total_received), 0);
    const completedMembers = members.filter((m) => m.status === 'completed');
    const committedSorted = completedMembers.reduce(
      (s, m) => s + m.items.reduce((x, i) => x + i.quantity, 0), 0,
    );
    const remaining = Math.max(0, originalTotal - committedSorted);
    const activeMember = members.find((m) => m.status === 'in_progress') ?? null;
    const cancelledMember = members.find((m) => m.status === 'cancelled') ?? null;
    const latestDate = members[0]?.completed_at || members[0]?.updated_at || members[0]?.created_at;
    const allReported = completedMembers.length > 0 && completedMembers.every((m) => m.report_sent_at);
    groups.push({
      key: rid, members, completedMembers, root, originalTotal,
      committedSorted, remaining, activeMember, cancelledMember, latestDate, allReported,
    });
  }
  return groups;
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
  const [needsBatchChoice, setNeedsBatchChoice] = useState(false);
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

  // Sorting can never exceed the received quantity — otherwise more pallets
  // than came in would be posted to stock (double counting). Returns an error
  // string to show, or null when the amounts are valid.
  function overSortError(): string | null {
    const total = Math.max(0, parseInt(editTotal || '0', 10) || 0);
    const sorted = itemInputs.reduce((s, r) => s + (parseInt(r.quantity || '0', 10) || 0), 0);
    if (sorted > total) {
      return t('depot.sorting.cannotExceedIntake')
        .replace('{sorted}', String(sorted))
        .replace('{total}', String(total));
    }
    return null;
  }

  async function handleSaveProgress() {
    if (!activeBatchId) return;
    const over = overSortError();
    if (over) { setError(over); return; }
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
    const over = overSortError();
    if (over) { setError(over); return; }
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
  useEffect(() => {
    fillDoneRef.current = false;
    if (activeBatchId) setNeedsBatchChoice(false);
  }, [activeBatchId]);

  // Cancel the "which sorting?" picker and drop any pending voice-fill params.
  const cancelBatchChoice = () => {
    setNeedsBatchChoice(false);
    const sp = new URLSearchParams(searchParams);
    ['a', 'b', 'c', 'd', 'items', 'save'].forEach((k) => sp.delete(k));
    setSearchParams(sp, { replace: true });
  };

  // Voice fill from the assistant. Two ways to pass quantities:
  //   ?a=&b=&c=&d=            — the common Klasse A/B/C/Defekt shorthand, and
  //   ?items=[{"name","qty"}] — ANY product by name (dynamic: every batch has
  //                              different products), matched to the rows.
  // ?save=1 completes the batch to stock. The user can review/edit before save.
  useEffect(() => {
    const a = searchParams.get('a'); const b = searchParams.get('b');
    const c = searchParams.get('c'); const d = searchParams.get('d');
    const itemsRaw = searchParams.get('items');
    const save = searchParams.get('save') === '1';
    const hasFill = a !== null || b !== null || c !== null || d !== null || itemsRaw !== null;
    if (!hasFill && !save) return;

    // Need a batch open. Auto-open the single in-progress one; if several are
    // in progress, ask the worker which one to fill instead of silently doing
    // nothing (that used to make the assistant "fill" with no visible effect).
    if (!activeBatchId) {
      const inProg = batches.filter((x) => x.status === 'in_progress');
      if (inProg.length === 1) openBatch(inProg[0]);
      else if (inProg.length > 1) setNeedsBatchChoice(true);
      return; // re-runs after a batch is opened
    }
    if (itemInputs.length === 0) return;

    if (hasFill && !fillDoneRef.current) {
      const num = (v: string | number | null | undefined) =>
        (v === null || v === undefined || v === '' ? null : String(Math.max(0, parseInt(String(v), 10) || 0)));
      const av = num(a), bv = num(b), cv = num(c), dv = num(d);
      // Parse the dynamic product list, if any.
      let named: Array<{ name: string; qty: string | null }> = [];
      if (itemsRaw) {
        try {
          const parsed = JSON.parse(itemsRaw) as Array<{ name?: string; qty?: number | string }>;
          named = parsed.filter((x) => x && x.name).map((x) => ({ name: String(x.name).toLowerCase(), qty: num(x.qty) }));
        } catch { /* ignore malformed */ }
      }
      const isDefektName = (n: string) => /defekt|defect|damaged|dëmtu|demtu/i.test(n);
      setItemInputs((prev) => prev.map((r) => {
        const rowName = r.product_name.toLowerCase();
        // 1) exact-ish product name match from the dynamic list wins.
        const match = named.find((it) =>
          r.category_product_id === DEFEKT_INPUT_ID ? isDefektName(it.name)
            : (rowName.includes(it.name) || it.name.includes(rowName)) && !isDefektName(it.name));
        if (match && match.qty !== null) return { ...r, quantity: match.qty };
        // 2) fall back to the Klasse A/B/C/Defekt shorthand.
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
    ['a', 'b', 'c', 'd', 'items', 'save'].forEach((k) => sp.delete(k));
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

  // A cancelled sorting batch is never lost: it can be resumed (put back to
  // in_progress) and reopened to finish, so no incoming sorting disappears.
  // (Cancelled batches were never committed to stock, so reopening + completing
  // posts correctly.)
  async function handleResume(batch: BatchWithItems) {
    try {
      setSubmitting(true);
      setError(null);
      const { error: updErr } = await supabase
        .from('pallet_sorting_batches')
        .update({ status: 'in_progress' })
        .eq('id', batch.id);
      if (updErr) throw updErr;
      await fetchAll();
      openBatch(batch);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setSubmitting(false);
    }
  }

  // A completed batch is already committed to stock (its sorted classes posted,
  // the unsorted intake bucket drained by that amount). If it was only PARTLY
  // sorted, the remaining pallets are still in stock as unsorted intake — so we
  // continue by creating a fresh batch for just the remainder and opening it.
  // This keeps stock correct (each batch commits its own items exactly once)
  // and never blocks a load until its full quantity is sorted.
  // Continue sorting the remainder of a load. If a continuation is already
  // in progress, reuse it (correcting its total to the true remaining) instead
  // of spawning duplicates; otherwise create a fresh continuation linked to the
  // load's root batch so all partial sortings group under one card.
  async function handleContinueRemaining(g: LoadGroup) {
    if (g.remaining <= 0) return;
    try {
      setSubmitting(true);
      setError(null);
      if (g.activeMember) {
        const id = g.activeMember.id;
        const { error: updErr } = await supabase
          .from('pallet_sorting_batches')
          .update({ total_received: g.remaining })
          .eq('id', id);
        if (updErr) throw updErr;
        await fetchAll();
        setSearchParams((prev) => { prev.set('batch', id); return prev; }, { replace: true });
        return;
      }
      const companyId = profile!.company_id!;
      const { data: created, error: insErr } = await supabase
        .from('pallet_sorting_batches')
        .insert({
          company_id: companyId,
          depot_id: profile?.depot_id ?? null,
          category_id: g.root.category_id,
          total_received: g.remaining,
          status: 'in_progress',
          created_by: profile!.id,
          parent_batch_id: g.root.id,
          source_delivery_note_id: g.root.source_delivery_note_id ?? null,
          reference_number_snapshot: g.root.reference_number_snapshot ?? null,
          notes: `Vazhdim i sortimit (${g.committedSorted}/${g.originalTotal} u sortuan me pare)`,
        })
        .select('id')
        .single();
      if (insErr) throw insErr;
      await fetchAll();
      if (created?.id) {
        setSearchParams((prev) => { prev.set('batch', created.id); return prev; }, { replace: true });
      }
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setSubmitting(false);
    }
  }

  // Continue a load: reopen a cancelled-only load in place; otherwise continue
  // the remainder (reusing/creating a continuation).
  function handleLoadResume(g: LoadGroup) {
    if (g.committedSorted === 0 && !g.activeMember && g.cancelledMember) {
      void handleResume(g.cancelledMember);
      return;
    }
    void handleContinueRemaining(g);
  }

  // One consolidated report per finished load: aggregates every completed
  // partial sorting and marks them all reported.
  async function handleSendGroupReport(g: LoadGroup) {
    const ids = g.completedMembers.map((m) => m.id);
    if (ids.length === 0) return;
    try {
      setSubmitting(true);
      setError(null);
      const { error: updErr } = await supabase
        .from('pallet_sorting_batches')
        .update({ report_sent_at: new Date().toISOString() })
        .in('id', ids);
      if (updErr) throw updErr;

      const cat = categories.find((c) => c.id === g.root.category_id);
      const allItems = g.completedMembers.flatMap((m) => m.items).filter((i) => i.quantity > 0);
      const labelOf = (i: PalletSortingItem) =>
        i.condition === 'damaged' ? 'Defekt' : products.find((p) => p.id === i.category_product_id)?.name || '-';
      const agg = new Map<string, number>();
      for (const i of allItems) agg.set(labelOf(i), (agg.get(labelOf(i)) ?? 0) + i.quantity);
      const itemsSummary = Array.from(agg.entries()).map(([l, q]) => `${l}: ${q}`).join(', ');

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
          message: `${cat?.name || 'Kategori'} (${g.root.reference_number_snapshot || '-'}): ${itemsSummary}`,
          data: JSON.stringify({
            url: '/company/sorting-reports',
            batch_id: g.root.id,
            category: cat?.name,
            total_received: g.originalTotal,
            items: Array.from(agg.entries()).map(([name, quantity]) => ({
              product_name: name,
              quantity,
              condition: name === 'Defekt' ? 'damaged' : 'good',
            })),
          }),
          reference_id: g.root.id,
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
  // Group every load's partial sortings under one card. Recent shows loads that
  // have at least one finished (non-in-progress) partial, newest first.
  const recentGroups = useMemo(
    () => buildLoadGroups(batches)
      .filter((g) => g.members.some((m) => m.status !== 'in_progress'))
      .sort((a, b) => new Date(b.latestDate).getTime() - new Date(a.latestDate).getTime())
      .slice(0, 12),
    [batches],
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

      {recentGroups.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
            {t('depot.sorting.recent')}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {recentGroups.map((g) => {
              const cat = categories.find((c) => c.id === g.root.category_id);
              const partner = partnerLabel(g.root) ?? g.members.map(partnerLabel).find(Boolean) ?? null;
              const bd = computeBreakdown(g.completedMembers.flatMap((m) => m.items), productNameById);
              const isDone = g.remaining <= 0 && g.committedSorted > 0;
              const isCancelledOnly = g.committedSorted === 0 && !g.activeMember && !!g.cancelledMember;
              const statusLabel = isDone
                ? t('depot.sorting.status.completed')
                : isCancelledOnly
                ? t('depot.sorting.status.cancelled')
                : t('depot.sorting.partial');
              const partialCount = g.completedMembers.length;
              return (
                <div key={g.key} className="bg-white border border-gray-100 rounded-xl p-3 space-y-2">
                  <div className="flex items-start gap-2.5">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        isDone ? 'bg-green-100 text-green-700' : isCancelledOnly ? 'bg-gray-100 text-gray-400' : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {isDone ? <CheckCircle2 className="w-4 h-4" /> : isCancelledOnly ? <X className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-900 truncate">{cat?.name ?? '-'}</p>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${
                            isDone ? 'bg-green-50 text-green-700' : isCancelledOnly ? 'bg-gray-100 text-gray-500' : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {statusLabel}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {partner && <span className="font-medium text-slate-600">{partner} · </span>}
                        {g.root.reference_number_snapshot && <span className="text-teal-600">{g.root.reference_number_snapshot} · </span>}
                        <span className="font-semibold text-slate-700">{g.committedSorted}/{g.originalTotal}</span>
                        {' · '}{new Date(g.latestDate).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  {g.committedSorted > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {bd.a > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium">A: {bd.a}</span>}
                      {bd.b > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-medium">B: {bd.b}</span>}
                      {bd.c > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 font-medium">C: {bd.c}</span>}
                      {bd.defekt > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 font-medium">Defekt: {bd.defekt}</span>}
                      {bd.other > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">Te tjera: {bd.other}</span>}
                    </div>
                  )}

                  {partialCount > 1 && (
                    <details className="rounded-lg border border-gray-100 bg-gray-50/60">
                      <summary className="cursor-pointer list-none px-2.5 py-1.5 text-[11px] font-medium text-gray-600 flex items-center gap-1.5">
                        <ChevronRight className="w-3.5 h-3.5 text-gray-400 details-chevron" />
                        {t('depot.sorting.partialSortings').replace('{n}', String(partialCount))}
                      </summary>
                      <div className="px-2.5 pb-2 space-y-1.5">
                        {g.completedMembers.map((m) => {
                          const mSorted = m.items.reduce((s, i) => s + i.quantity, 0);
                          const mbd = computeBreakdown(m.items, productNameById);
                          return (
                            <div key={m.id} className="rounded-md bg-white border border-gray-100 px-2 py-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] text-gray-500">
                                  {new Date(m.completed_at || m.updated_at || m.created_at).toLocaleDateString()}
                                </span>
                                <span className="text-[11px] font-semibold text-teal-700">{mSorted}</span>
                              </div>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {mbd.a > 0 && <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-50 text-emerald-700">A: {mbd.a}</span>}
                                {mbd.b > 0 && <span className="text-[9px] px-1 py-0.5 rounded bg-amber-50 text-amber-700">B: {mbd.b}</span>}
                                {mbd.c > 0 && <span className="text-[9px] px-1 py-0.5 rounded bg-sky-50 text-sky-700">C: {mbd.c}</span>}
                                {mbd.defekt > 0 && <span className="text-[9px] px-1 py-0.5 rounded bg-rose-50 text-rose-700">Defekt: {mbd.defekt}</span>}
                                {mbd.other > 0 && <span className="text-[9px] px-1 py-0.5 rounded bg-slate-100 text-slate-700">Te tjera: {mbd.other}</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  )}

                  {g.remaining > 0 && (
                    <button
                      onClick={() => handleLoadResume(g)}
                      disabled={submitting}
                      className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors disabled:opacity-50"
                    >
                      <ArrowRight className="w-3 h-3" />
                      {isCancelledOnly
                        ? t('depot.sorting.resume')
                        : t('depot.sorting.continueRemaining').replace('{n}', String(g.remaining))}
                    </button>
                  )}
                  {isDone && !g.allReported && (
                    <button
                      onClick={() => handleSendGroupReport(g)}
                      disabled={submitting}
                      className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors disabled:opacity-50"
                    >
                      <Send className="w-3 h-3" />{t('common.dergoRaportin')}</button>
                  )}
                  {isDone && g.allReported && (
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

      {/* "Which sorting?" picker — shown when a voice-fill arrives but several
          batches are in progress, so the worker chooses which one to fill. */}
      {needsBatchChoice && !currentBatch && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
          <div className="fixed inset-0 bg-black/50" onClick={cancelBatchChoice} />
          <div className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">{t('depot.sorting.chooseBatch')}</h2>
              <button
                onClick={cancelBatchChoice}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-3 space-y-2 max-h-[70dvh] overflow-y-auto">
              {inProgress.map((b) => {
                const cat = categories.find((c) => c.id === b.category_id);
                const partner = partnerLabel(b);
                const sorted = b.items.reduce((s, i) => s + i.quantity, 0);
                return (
                  <button
                    key={b.id}
                    onClick={() => { setNeedsBatchChoice(false); openBatch(b); }}
                    className="w-full text-left rounded-lg border border-gray-200 hover:border-teal-300 hover:bg-teal-50/50 transition-colors p-3 flex items-center gap-3"
                  >
                    <div className="w-9 h-9 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center flex-shrink-0">
                      <Layers className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{cat?.name ?? '-'}</p>
                      <p className="text-[11px] text-gray-500 truncate">
                        {partner && <span className="font-medium text-slate-600">{partner} · </span>}
                        {b.reference_number_snapshot && <span className="text-teal-600">{b.reference_number_snapshot} · </span>}
                        {sorted}/{b.total_received}
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
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
              {currentBatch.notes && (
                <p className="text-[11px] text-slate-500">{currentBatch.notes}</p>
              )}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-gray-50 rounded-lg p-2.5">
                  <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">
                    {t('depot.sorting.totalReceived')}
                  </p>
                  <p className="text-2xl font-bold text-gray-800">{totalReceivedNum}</p>
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

              {diff < 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-2 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <p className="text-[11px] text-red-700">
                    {t('depot.sorting.cannotExceedIntake')
                      .replace('{sorted}', String(sortedTotal))
                      .replace('{total}', String(totalReceivedNum))}
                  </p>
                </div>
              )}

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
                    if (diff > 0) {
                      if (!window.confirm(`Ka nje diference prej ${diff} paletash. Vazhdo me perfundimin e sortimit?`)) return;
                    }
                    handleComplete();
                  }}
                  disabled={submitting || sortedTotal === 0 || diff < 0}
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
