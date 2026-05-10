import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Download,
  Layers,
  Loader2,
  MapPin,
  Minus,
  Package,
  Plus,
  Sparkles,
  Trash2,
  Truck,
  Undo2,
  Upload,
  User,
  Warehouse,
  Wrench,
  X,
  FileText,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { matchProduct } from '../../utils/productMatcher';
import { isEuroPaletteName, isNewPalletProduct, epalClassRank } from '../../utils/productSort';
import { parseLineItemsFromNotes } from '../../utils/scanLineInference';
import { notifyUsers } from '../../utils/notifications';
import FlowRoleSelector from './FlowRoleSelector';
import type { FlowRole } from '../../utils/counterpartyMatch';

type Role = 'company_admin' | 'depot_worker';

interface ReviewNote {
  id: string;
  note_number: string;
  type: string;
  status: string;
  partner_name: string | null;
  delivery_address: string | null;
  pickup_address: string | null;
  reference_number: string | null;
  scanned_photo_url: string | null;
  ai_extracted_json: any;
  ai_confidence: number | null;
  notes: string | null;
  assigned_depot_id: string | null;
  assigned_driver_id: string | null;
  company_id: string;
  delivered_at: string | null;
  flow_role?: FlowRole | null;
  counterparty_company_id?: string | null;
  counterparty_contact_id?: string | null;
  counterparty_name?: string | null;
  counterparty_vat?: string | null;
  counterparty_email?: string | null;
  counterparty_phone?: string | null;
  partner_id?: string | null;
  acc_invoice_id?: string | null;
}

interface NoteItem {
  id: string;
  delivery_note_id: string;
  category_id: string | null;
  product_id: string | null;
  category_product_id: string | null;
  quantity: number;
  condition: string;
  intended_action: 'stock' | 'sorting' | 'repair';
  notes: string | null;
  auto_matched?: boolean;
  match_score?: number;
  match_type?: 'sku' | 'product_name' | 'category_name' | null;
}

type RowState = {
  _key: string;
  _persistedId: string | null;
  _groupKey: string;
  _isChild: boolean;
  _sourceDescription: string;
  _sourceQuantity: number;
  category_id: string | null;
  product_id: string | null;
  quantity: number;
  condition: string;
  intended_action: 'stock' | 'sorting' | 'repair';
  notes: string | null;
  auto_matched?: boolean;
  match_type?: 'sku' | 'product_name' | 'category_name' | 'combined' | null;
  match_confidence?: 'high' | 'medium' | 'low' | 'none';
};

function deriveConditionAction(
  desc: string,
  productName?: string | null,
  categoryName?: string | null,
  isOutgoing: boolean = false,
): { condition: string; intended_action: 'stock' | 'sorting' | 'repair' } {
  const d = `${desc || ''} ${productName || ''}`.toLowerCase();
  const outgoingAction = (fallback: 'stock' | 'sorting' | 'repair'): 'stock' | 'sorting' | 'repair' =>
    isOutgoing ? 'stock' : fallback;
  if (/\b(defekt|defect|damage|damaged|kaputt|broken|repair|riparim)\b/i.test(d)) {
    return { condition: 'damaged', intended_action: outgoingAction('repair') };
  }
  if (/(klasse\s*a|\bkl\.?\s*a\b|\bclass\s*a\b|\ba[\s-]?klasse\b|a[- ]?qualit(a|ä)t|qualit(a|ä)t\s*a)/i.test(d)) {
    return { condition: 'ready_a', intended_action: outgoingAction('sorting') };
  }
  if (/(klasse\s*b|\bkl\.?\s*b\b|\bclass\s*b\b|\bb[\s-]?klasse\b|b[- ]?qualit(a|ä)t|qualit(a|ä)t\s*b)/i.test(d)) {
    return { condition: 'ready_b', intended_action: outgoingAction('sorting') };
  }
  if (/(klasse\s*c|\bkl\.?\s*c\b|\bclass\s*c\b|\bc[\s-]?klasse\b|c[- ]?qualit(a|ä)t|qualit(a|ä)t\s*c)/i.test(d)) {
    return { condition: 'ready_c', intended_action: outgoingAction('sorting') };
  }
  if (/\b(sortier|sortir|sorting|mix|mischt|gemischt|mischpalette)\b/i.test(d)) {
    return { condition: isOutgoing ? 'good' : 'sorting', intended_action: outgoingAction('sorting') };
  }
  if (isEuroPaletteName(d) || isEuroPaletteName(categoryName)) {
    return { condition: 'good', intended_action: 'stock' };
  }
  return { condition: 'good', intended_action: 'stock' };
}

interface Category {
  id: string;
  name: string;
}

interface Product {
  id: string;
  name: string;
  sku: string | null;
  category_id: string | null;
}

interface DeliveryReviewPanelProps {
  role: Role;
  typeFilter?: 'delivery' | 'pickup';
  hideChrome?: boolean;
  emptyMessage?: string;
}

export default function DeliveryReviewPanel({ role, typeFilter, hideChrome, emptyMessage }: DeliveryReviewPanelProps) {
  const { profile } = useAuth();
  const [notes, setNotes] = useState<ReviewNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ReviewNote | null>(null);

  const targetStatus = role === 'company_admin' ? 'pending_company_review' : 'pending_stock_confirmation';

  useEffect(() => {
    if (!profile?.company_id) return;
    fetchNotes();
    const ch = supabase
      .channel(`review-panel-${role}-${profile.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'delivery_notes', filter: `company_id=eq.${profile.company_id}` },
        () => fetchNotes(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile?.company_id, profile?.depot_id]);

  async function fetchNotes() {
    if (!profile?.company_id) return;
    setLoading(true);
    let q = supabase
      .from('delivery_notes')
      .select('*')
      .eq('company_id', profile.company_id)
      .eq('status', targetStatus)
      .order('delivered_at', { ascending: false, nullsFirst: false })
      .limit(100);
    if (role === 'depot_worker' && profile.depot_id) {
      q = q.eq('assigned_depot_id', profile.depot_id);
    }
    if (typeFilter) {
      q = q.eq('type', typeFilter);
    }
    const { data } = await q;
    setNotes((data as ReviewNote[]) ?? []);
    setLoading(false);
  }

  if (loading && notes.length === 0) {
    if (hideChrome) {
      return (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      );
    }
    return null;
  }

  if (notes.length === 0) {
    if (hideChrome) {
      return (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white py-10 text-center">
          <CheckCircle2 className="w-9 h-9 text-emerald-300 mx-auto mb-2" />
          <p className="text-sm font-medium text-gray-700">{emptyMessage || 'Nuk ka asgje per shqyrtim'}</p>
        </div>
      );
    }
    return null;
  }

  const headerTitle = role === 'company_admin'
    ? 'Dergesa per shqyrtim'
    : 'Per verifikim ne stok';
  const headerSubtitle = role === 'company_admin'
    ? 'Shoferi skanoi dokumentin. Miratoni dhe dergojeni te depoja per regjistrim.'
    : 'Miratuar nga kompania. Verifikoni sasite dhe regjistrojini ne stok.';
  const accentGradient = role === 'company_admin'
    ? 'from-sky-500 to-blue-600'
    : 'from-orange-500 to-amber-600';
  const badgeCls = role === 'company_admin' ? 'bg-sky-100 text-sky-800' : 'bg-orange-100 text-orange-800';

  const listInner = (
    <div className={hideChrome ? 'space-y-2' : 'p-3 space-y-2'}>
      {notes.map((n) => (
        <button
          key={n.id}
          onClick={() => setSelected(n)}
          className="w-full text-left bg-white rounded-xl shadow-sm border border-gray-100 border-l-4 border-l-sky-400 p-3.5 active:scale-[0.99] hover:shadow-md transition-all"
        >
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-sky-50 flex-shrink-0">
              {n.type === 'pickup' ? (
                <Package className="w-4 h-4 text-sky-600" />
              ) : (
                <Truck className="w-4 h-4 text-sky-600" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-gray-900">{n.note_number}</span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${badgeCls}`}>
                  {n.type === 'pickup' ? 'Fletemarrje' : 'Fletedergese'}
                </span>
                {n.ai_confidence != null && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700">
                    <Sparkles className="w-2.5 h-2.5" /> {Math.round(n.ai_confidence * 100)}%
                  </span>
                )}
              </div>
              {n.partner_name && (
                <p className="text-sm font-medium text-gray-800 mt-1 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-gray-400" /> {n.partner_name}
                </p>
              )}
              {(n.delivery_address || n.pickup_address) && (
                <p className="text-xs text-gray-500 mt-0.5 flex items-start gap-1.5">
                  <MapPin className="w-3 h-3 text-gray-400 flex-shrink-0 mt-0.5" />
                  <span className="line-clamp-1">{n.delivery_address || n.pickup_address}</span>
                </p>
              )}
            </div>
            <ArrowRight className="w-4 h-4 text-gray-300 flex-shrink-0 mt-1" />
          </div>
        </button>
      ))}
    </div>
  );

  return (
    <>
      {hideChrome ? (
        listInner
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className={`bg-gradient-to-r ${accentGradient} px-4 py-3 text-white flex items-center gap-3`}>
            <div className="p-1.5 bg-white/20 rounded-lg">
              <ClipboardList className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold uppercase tracking-wide">{headerTitle}</p>
              <p className="text-[11px] text-white/90">{headerSubtitle}</p>
            </div>
            <span className="bg-white/20 text-white text-xs font-bold px-2.5 py-1 rounded-full">{notes.length}</span>
          </div>
          {listInner}
        </div>
      )}

      {selected && (
        <ReviewModal
          role={role}
          note={selected}
          onClose={() => setSelected(null)}
          onDone={async () => { setSelected(null); await fetchNotes(); }}
        />
      )}
    </>
  );
}

function ReviewModal({
  role, note, onClose, onDone,
}: {
  role: Role;
  note: ReviewNote;
  onClose: () => void;
  onDone: () => void | Promise<void>;
}) {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [rows, setRows] = useState<RowState[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState<'approve' | 'complete' | 'reject' | null>(null);
  const [reason, setReason] = useState('');
  const [showRejectReason, setShowRejectReason] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scannedUrl, setScannedUrl] = useState<string | null>(note.scanned_photo_url);
  const [uploading, setUploading] = useState(false);
  const isOutgoing = note.type === 'delivery';

  async function handleUploadDocument(file: File) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const ext = (file.name.split('.').pop() || 'pdf').toLowerCase();
      const path = `delivery-notes/${note.id}/upload-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('attachments')
        .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('attachments').getPublicUrl(path);
      const url = pub.publicUrl;

      const { error: dbErr } = await supabase
        .from('delivery_notes')
        .update({ scanned_photo_url: url, updated_at: new Date().toISOString() })
        .eq('id', note.id);
      if (dbErr) throw dbErr;

      setScannedUrl(url);
    } catch (err: any) {
      setError(err.message || 'Ngarkimi deshtoi');
    } finally {
      setUploading(false);
    }
  }

  async function handleRemoveDocument() {
    setUploading(true);
    setError(null);
    try {
      const { error: dbErr } = await supabase
        .from('delivery_notes')
        .update({ scanned_photo_url: null, updated_at: new Date().toISOString() })
        .eq('id', note.id);
      if (dbErr) throw dbErr;
      setScannedUrl(null);
    } catch (err: any) {
      setError(err.message || 'Heqja deshtoi');
    } finally {
      setUploading(false);
    }
  }

  useEffect(() => {
    load();
  }, [note.id]);

  async function load() {
    setLoading(true);
    const [itemsRes, catsRes, prodsRes] = await Promise.all([
      supabase.from('delivery_note_items').select('*').eq('delivery_note_id', note.id).order('created_at', { ascending: true }),
      supabase.from('product_categories').select('id, name').eq('company_id', note.company_id).order('name'),
      supabase.from('category_products').select('id, name, sku, category_id').eq('company_id', note.company_id).order('name'),
    ]);
    const cats = (catsRes.data as Category[]) ?? [];
    const prods = (prodsRes.data as Product[]) ?? [];
    const rawItems = (itemsRes.data as NoteItem[]) ?? [];

    const built: RowState[] = rawItems.map((it, idx) => {
      const existingProd = it.category_product_id || null;
      let categoryId = it.category_id;
      let productId = existingProd;
      let matchedOn: RowState['match_type'] = null;
      let confidence: RowState['match_confidence'] = 'none';
      let autoMatched = false;
      let condition = it.condition || '';
      let action: 'stock' | 'sorting' | 'repair' = (it.intended_action as any) || 'stock';
      if (isOutgoing) action = 'stock';

      if (!categoryId && !productId && it.notes) {
        const mm = matchProduct(it.notes, prods, cats);
        if (mm.confidence !== 'none') {
          categoryId = mm.categoryId;
          productId = mm.productId;
          matchedOn = mm.matchedOn;
          confidence = mm.confidence;
          autoMatched = !!(mm.productId || mm.categoryId);
        }
      }

      const matchedProdName = productId ? prods.find((p) => p.id === productId)?.name : null;
      const matchedCatName = categoryId ? cats.find((c) => c.id === categoryId)?.name : null;
      if (!condition || (!it.intended_action && it.notes)) {
        const d = deriveConditionAction(it.notes || '', matchedProdName, matchedCatName, isOutgoing);
        if (!condition) condition = d.condition;
        if (!it.intended_action) action = d.intended_action;
      }
      if (isOutgoing) action = 'stock';

      if (
        !productId &&
        categoryId &&
        isEuroPaletteName(matchedCatName) &&
        action === 'stock' &&
        !/(klass?e?\s*[abc]\b|class\s*[abc]\b|\b[abc][-\s]?klass?e?\b)/i.test(`${it.notes || ''} ${matchedProdName || ''}`)
      ) {
        const euroProducts = prods.filter((p) => p.category_id === categoryId);
        const newPallet = euroProducts.find((p) => isNewPalletProduct(p.name) || epalClassRank(p.name) === 0);
        if (newPallet) {
          productId = newPallet.id;
          autoMatched = true;
          confidence = 'medium';
          matchedOn = matchedOn || 'combined';
        }
      }

      return {
        _key: it.id,
        _persistedId: it.id,
        _groupKey: `g-${idx}-${it.id}`,
        _isChild: false,
        _sourceDescription: it.notes || '',
        _sourceQuantity: it.quantity || 0,
        category_id: categoryId,
        product_id: productId,
        quantity: it.quantity,
        condition: condition || 'good',
        intended_action: action,
        notes: it.notes,
        auto_matched: autoMatched,
        match_type: matchedOn,
        match_confidence: confidence,
      };
    });

    if (built.length === 0) {
      const ex = note.ai_extracted_json as any;
      const rawLineItems: Array<{ description?: string; quantity?: number; unit?: string }> =
        (ex && Array.isArray(ex.line_items) && ex.line_items.length > 0)
          ? ex.line_items
          : parseLineItemsFromNotes(note.notes);

      rawLineItems
        .filter((li) => (li.description || '').trim() && (li.quantity ?? 0) > 0)
        .forEach((li, idx) => {
          const desc = (li.description || '').trim();
          const mm = matchProduct(desc, prods, cats);
          const matchedName = mm.productId ? prods.find((p) => p.id === mm.productId)?.name : null;
          const d = deriveConditionAction(desc, matchedName, null, isOutgoing);
          const key = `synthetic-${idx}-${Date.now()}`;
          built.push({
            _key: key,
            _persistedId: null,
            _groupKey: key,
            _isChild: false,
            _sourceDescription: desc,
            _sourceQuantity: Math.max(1, Math.round(li.quantity || 0)),
            category_id: mm.categoryId,
            product_id: mm.productId,
            quantity: Math.max(1, Math.round(li.quantity || 0)),
            condition: d.condition,
            intended_action: d.intended_action,
            notes: `${desc}${li.unit ? ' (' + li.unit + ')' : ''}`,
            auto_matched: !!(mm.productId || mm.categoryId),
            match_type: mm.matchedOn,
            match_confidence: mm.confidence,
          });
        });
    }

    setCategories(cats);
    setProducts(prods);
    setRows(built);
    setDeletedIds([]);
    setLoading(false);
  }

  function updateRow(key: string, patch: Partial<RowState>) {
    setRows((prev) => prev.map((r) => (r._key === key ? { ...r, ...patch } : r)));
  }

  function addSplit(groupKey: string) {
    setRows((prev) => {
      const lastIdx = prev.map((r) => r._groupKey).lastIndexOf(groupKey);
      if (lastIdx < 0) return prev;
      const parent = prev[lastIdx];
      const newRow: RowState = {
        ...parent,
        _key: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        _persistedId: null,
        _isChild: true,
        quantity: 0,
        condition: 'good',
        intended_action: 'stock',
        auto_matched: false,
        match_type: null,
      };
      const next = prev.slice();
      next.splice(lastIdx + 1, 0, newRow);
      return next;
    });
  }

  function removeRow(key: string) {
    setRows((prev) => {
      const row = prev.find((r) => r._key === key);
      if (row?._persistedId) setDeletedIds((d) => [...d, row._persistedId!]);
      return prev.filter((r) => r._key !== key);
    });
  }

  function addNewItem() {
    const key = `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const row: RowState = {
      _key: key,
      _persistedId: null,
      _groupKey: key,
      _isChild: false,
      _sourceDescription: '',
      _sourceQuantity: 0,
      category_id: null,
      product_id: null,
      quantity: 0,
      condition: 'good',
      intended_action: 'stock',
      notes: null,
    };
    setRows((prev) => [...prev, row]);
  }

  async function persistItems() {
    if (deletedIds.length > 0) {
      await supabase.from('delivery_note_items').delete().in('id', deletedIds);
      setDeletedIds([]);
    }
    const updates = rows.filter((r) => r._persistedId);
    const inserts = rows.filter((r) => !r._persistedId);

    const effectiveAction = (r: RowState) => (isOutgoing ? 'stock' : r.intended_action);

    for (const r of updates) {
      await supabase
        .from('delivery_note_items')
        .update({
          category_product_id: r.product_id,
          category_id: r.category_id,
          quantity: r.quantity,
          condition: r.condition,
          intended_action: effectiveAction(r),
          notes: r.notes,
        })
        .eq('id', r._persistedId!);
    }

    if (inserts.length > 0) {
      const payload = inserts.map((r) => ({
        delivery_note_id: note.id,
        category_product_id: r.product_id,
        category_id: r.category_id,
        quantity: r.quantity,
        condition: r.condition,
        intended_action: effectiveAction(r),
        notes: r.notes,
      }));
      const { data: inserted } = await supabase
        .from('delivery_note_items')
        .insert(payload as any)
        .select('id');
      if (inserted) {
        setRows((prev) => {
          const ids = inserted as Array<{ id: string }>;
          let pos = 0;
          return prev.map((r) => {
            if (!r._persistedId && pos < ids.length) {
              const id = ids[pos++].id;
              return { ...r, _persistedId: id };
            }
            return r;
          });
        });
      }
    }
  }

  async function handleApprove() {
    setSaving('approve');
    setError(null);
    try {
      if (!note.assigned_depot_id) {
        throw new Error('Cakto nje depo per kete dergese para se ta dergosh per regjistrim.');
      }
      if (rows.length === 0) {
        throw new Error('Shtoni se paku nje artikull para se ta dergoni ne depo.');
      }
      const invalid = rows.filter((r) => !r.category_id || !r.quantity || r.quantity <= 0);
      if (invalid.length > 0) {
        throw new Error('Plotesoni kategorine dhe sasine per cdo artikull.');
      }
      await persistItems();
      const { error: upErr } = await supabase
        .from('delivery_notes')
        .update({
          status: 'pending_stock_confirmation',
          company_reviewed_by: profile!.id,
          company_reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', note.id);
      if (upErr) throw upErr;

      if (note.assigned_depot_id) {
        const { data: depotUsers } = await supabase
          .from('profiles')
          .select('id')
          .eq('depot_id', note.assigned_depot_id)
          .eq('role', 'depot_worker')
          .eq('is_active', true);
        if (depotUsers && depotUsers.length > 0) {
          await notifyUsers({
            userIds: depotUsers.map((u) => u.id),
            type: 'delivery',
            titleKey: 'notifications.templates.deliveryForStock.title',
            messageKey: 'notifications.templates.deliveryForStock.body',
            params: { number: note.note_number },
            referenceId: note.id,
            fallbackTitle: 'Dergese per stok',
            fallbackMessage: `${note.note_number} u miratua. Verifikoni dhe regjistrojeni ne stok.`,
          });
        }
      }
      await onDone();
    } catch (err: any) {
      setError(err.message || 'Gabim');
    } finally {
      setSaving(null);
    }
  }

  async function handleCreateInvoice() {
    if (note.acc_invoice_id) {
      navigate(`/accounting/invoices/${note.acc_invoice_id}`);
      return;
    }
    setCreatingInvoice(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.rpc('create_invoice_from_delivery_note', { p_note_id: note.id });
      if (err) throw err;
      const invoiceId = typeof data === 'string' ? data : (data as any)?.id;
      if (invoiceId) {
        navigate(`/accounting/invoices/${invoiceId}`);
      } else {
        navigate(`/accounting/invoices/new?delivery_note_id=${note.id}`);
      }
    } catch (e: any) {
      setError(e.message || 'Krijimi i fatures deshtoi');
    } finally {
      setCreatingInvoice(false);
    }
  }

  async function handleSendToSorting() {
    if (isOutgoing) {
      setError('Fletedergesat dalese nuk mund te dergohen ne sortire. Perdorni "Regjistro ne stok" ose "Dergo te depo per stok".');
      return;
    }
    setSaving('approve');
    setError(null);
    try {
      if (!note.assigned_depot_id) {
        throw new Error('Cakto nje depo per kete dergese para se ta dergosh ne sortire.');
      }
      if (rows.length === 0) {
        throw new Error('Shtoni se paku nje artikull para se ta dergoni ne sortire.');
      }
      const invalid = rows.filter((r) => !r.category_id || !r.quantity || r.quantity <= 0);
      if (invalid.length > 0) {
        throw new Error('Plotesoni kategorine dhe sasine per cdo artikull.');
      }
      const sortingRows = rows.map((r) => ({
        ...r,
        intended_action: r.intended_action === 'repair' ? 'repair' : 'sorting',
      }));
      setRows(sortingRows as any);
      const originalRows = rows;
      try {
        await persistItems();
      } catch (err) {
        setRows(originalRows);
        throw err;
      }
      const { error: upErr } = await supabase
        .from('delivery_notes')
        .update({
          status: 'pending_stock_confirmation',
          company_reviewed_by: profile!.id,
          company_reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', note.id);
      if (upErr) throw upErr;

      const { data: depotUsers } = await supabase
        .from('profiles')
        .select('id')
        .eq('depot_id', note.assigned_depot_id)
        .eq('role', 'depot_worker')
        .eq('is_active', true);
      if (depotUsers && depotUsers.length > 0) {
        await notifyUsers({
          userIds: depotUsers.map((u) => u.id),
          type: 'delivery',
          titleKey: 'notifications.templates.sortingRequested.title',
          messageKey: 'notifications.templates.sortingRequested.body',
          params: { number: note.note_number },
          referenceId: note.id,
          fallbackTitle: 'Sortim i ri',
          fallbackMessage: `${note.note_number} kerkon sortim ne depo.`,
        });
      }
      await onDone();
    } catch (err: any) {
      setError(err.message || 'Gabim');
    } finally {
      setSaving(null);
    }
  }

  async function handleCompleteToStock() {
    setSaving('complete');
    setError(null);
    try {
      if (rows.length === 0) {
        throw new Error('Nuk ka asnje artikull per te regjistruar ne stok. Shtoni artikujt ose kthejeni dergesen.');
      }
      const missing = rows.filter((r) => !r.category_id || !r.quantity || r.quantity <= 0);
      if (missing.length > 0) {
        throw new Error('Caktoni kategorine dhe sasine per cdo artikull para regjistrimit ne stok.');
      }
      const missingProduct = rows.filter(
        (r) => r.intended_action !== 'repair' && !r.category_product_id,
      );
      if (missingProduct.length > 0) {
        throw new Error(
          'Cdo artikull duhet te kete produkt te caktuar (jo vetem kategori). Zgjidhni produktin e sakte para regjistrimit ne stok.',
        );
      }
      await persistItems();

      const depotId = note.assigned_depot_id || profile?.depot_id;
      if (!depotId) throw new Error('Depoja nuk eshte caktuar per kete dergese.');

      const { data: validation, error: vErr } = await supabase.functions.invoke('validate-delivery-action', {
        body: {
          action: 'confirm',
          delivery_note_id: note.id,
        },
      });

      if (vErr || !validation?.valid) {
        throw new Error((validation?.blockers || ['Validimi dështoi']).join('\n'));
      }

      if (validation.warnings?.length > 0) {
        const proceed = confirm(`Paralajmërime:\n${validation.warnings.join('\n')}\n\nVazhdo?`);
        if (!proceed) {
          setSaving(null);
          return;
        }
      }

      const { error: upErr } = await supabase
        .from('delivery_notes')
        .update({
          status: 'confirmed',
          stock_confirmed_by: profile!.id,
          stock_confirmed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', note.id);
      if (upErr) throw upErr;

      const { data: verify } = await supabase
        .from('delivery_notes')
        .select('stock_posted, stock_post_error')
        .eq('id', note.id)
        .maybeSingle();
      if (verify && verify.stock_posted === false) {
        throw new Error(verify.stock_post_error || 'Stoku nuk u regjistrua. Kontrolloni artikujt dhe depon.');
      }

      const receivers = [note.assigned_driver_id].filter(Boolean) as string[];
      if (receivers.length > 0) {
        await notifyUsers({
          userIds: receivers,
          type: 'delivery',
          titleKey: 'notifications.templates.deliveryRegisteredInStock.title',
          messageKey: 'notifications.templates.deliveryRegisteredInStock.body',
          params: { number: note.note_number },
          referenceId: note.id,
          fallbackTitle: 'Dergesa u regjistrua ne stok',
          fallbackMessage: `${note.note_number} u mbyll dhe u regjistrua ne stok.`,
        });
      }

      if (role === 'depot_worker' && note.company_id) {
        const { data: admins } = await supabase
          .from('profiles')
          .select('id')
          .eq('company_id', note.company_id)
          .eq('role', 'company_admin')
          .eq('is_active', true);
        if (admins && admins.length > 0) {
          await notifyUsers({
            userIds: admins.map((a) => a.id),
            type: 'delivery',
            titleKey: 'notifications.templates.deliveryRegisteredInStock.title',
            messageKey: 'notifications.templates.deliveryRegisteredInStock.body',
            params: { number: note.note_number },
            referenceId: note.id,
            fallbackTitle: 'Dergesa u regjistrua ne stok',
            fallbackMessage: `${note.note_number} u regjistrua ne stok nga depoja.`,
          });
        }
      }

      await onDone();
    } catch (err: any) {
      setError(err.message || 'Gabim gjate regjistrimit ne stok');
    } finally {
      setSaving(null);
    }
  }

  async function handleReject() {
    if (!reason.trim()) {
      setShowRejectReason(true);
      return;
    }
    setSaving('reject');
    setError(null);
    try {
      const newStatus = role === 'company_admin' ? 'in_transit' : 'pending_company_review';
      await supabase
        .from('delivery_notes')
        .update({
          status: newStatus,
          review_notes: reason.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', note.id);

      if (note.assigned_driver_id && role === 'company_admin') {
        await notifyUsers({
          userIds: [note.assigned_driver_id],
          type: 'delivery',
          titleKey: 'notifications.templates.deliveryReturned.title',
          messageKey: 'notifications.templates.deliveryReturned.body',
          params: { number: note.note_number, reason: reason.trim() },
          referenceId: note.id,
          fallbackTitle: 'Dergesa u kthye',
          fallbackMessage: `${note.note_number}: ${reason.trim()}`,
        });
      }

      if (role === 'depot_worker' && note.company_id) {
        const { data: admins } = await supabase
          .from('profiles')
          .select('id')
          .eq('company_id', note.company_id)
          .eq('role', 'company_admin')
          .eq('is_active', true);
        if (admins && admins.length > 0) {
          await notifyUsers({
            userIds: admins.map((a) => a.id),
            type: 'delivery',
            titleKey: 'notifications.templates.deliveryReturned.title',
            messageKey: 'notifications.templates.deliveryReturned.body',
            params: { number: note.note_number, reason: reason.trim() },
            referenceId: note.id,
            fallbackTitle: 'Dergesa u kthye nga depoja',
            fallbackMessage: `${note.note_number}: ${reason.trim()}`,
          });
        }
      }
      await onDone();
    } catch (err: any) {
      setError(err.message || 'Gabim');
    } finally {
      setSaving(null);
    }
  }

  const ex = note.ai_extracted_json || {};
  const isPickup = note.type === 'pickup';
  const noScanFlag = !scannedUrl && /\[Pa skanim\]/i.test(note.notes || '');

  return (
    <div className="fixed inset-0 z-[1100] flex items-end lg:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl lg:rounded-2xl w-full lg:max-w-3xl max-h-[94vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between z-10">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-gray-900">{note.note_number}</h3>
              {noScanFlag && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200">
                  <AlertCircle className="w-3 h-3" /> Pa skanim
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {isPickup ? 'Fletemarrje' : 'Fletedergese'}
              {note.partner_name ? ` - ${note.partner_name}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="p-2 -mr-2 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
            </div>
          )}

          {profile?.company_id && role === 'company_admin' && (
            <FlowRoleSelector
              ownCompanyId={profile.company_id}
              noteId={note.id}
              initial={{
                flow_role: note.flow_role ?? (note.type === 'pickup' ? 'receiver' : 'sender'),
                counterparty_company_id: note.counterparty_company_id ?? null,
                counterparty_contact_id: note.counterparty_contact_id ?? null,
                counterparty_name: note.counterparty_name ?? note.partner_name ?? null,
                counterparty_vat: note.counterparty_vat ?? null,
                counterparty_email: note.counterparty_email ?? null,
                counterparty_phone: note.counterparty_phone ?? null,
              }}
            />
          )}

          <div className="grid lg:grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Dokumenti i skanuar</p>
              {scannedUrl ? (
                <div className="rounded-xl border border-gray-200 overflow-hidden bg-gray-50">
                  {/\.(pdf)(\?|$)/i.test(scannedUrl) ? (
                    <div className="p-6 text-center text-xs text-gray-500 bg-white">PDF i ngarkuar</div>
                  ) : (
                    <img src={scannedUrl} alt="" className="w-full max-h-80 object-contain" />
                  )}
                  <div className="flex items-center justify-between gap-2 border-t bg-white px-3 py-2">
                    <a
                      href={scannedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-teal-600 hover:text-teal-700 text-xs font-semibold"
                    >
                      <Download className="w-3.5 h-3.5" /> Hap origjinalin
                    </a>
                    {role === 'company_admin' && (
                      <div className="flex items-center gap-1.5">
                        <label className="inline-flex items-center gap-1 text-xs font-semibold text-sky-600 hover:text-sky-700 cursor-pointer">
                          <Upload className="w-3.5 h-3.5" />
                          Zevendeso
                          <input
                            type="file"
                            accept="image/*,application/pdf"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleUploadDocument(f);
                              e.target.value = '';
                            }}
                            disabled={uploading}
                          />
                        </label>
                        <button
                          onClick={handleRemoveDocument}
                          disabled={uploading}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Hiq
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : role === 'company_admin' ? (
                <>
                {noScanFlag && (
                  <div className="mb-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
                    <p className="text-xs font-semibold text-amber-800">Shoferi e mbylli pa skanim</p>
                    <p className="text-[11px] text-amber-700 mt-0.5">Ngarkoni dokumentin qe ju erdhi me email kur te vij.</p>
                  </div>
                )}
                <label className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-sky-200 bg-sky-50/40 hover:bg-sky-50 transition-colors p-6 text-center cursor-pointer ${uploading ? 'opacity-60 pointer-events-none' : ''}`}>
                  {uploading ? (
                    <Loader2 className="w-6 h-6 text-sky-500 animate-spin" />
                  ) : (
                    <Upload className="w-6 h-6 text-sky-500" />
                  )}
                  <p className="mt-2 text-xs font-semibold text-sky-700">
                    {uploading ? 'Duke ngarkuar...' : 'Ngarko dokumentin'}
                  </p>
                  <p className="mt-0.5 text-[11px] text-gray-500">Image ose PDF, deri 10 MB</p>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleUploadDocument(f);
                      e.target.value = '';
                    }}
                    disabled={uploading}
                  />
                </label>
                </>
              ) : (
                <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-xs text-gray-400">
                  {noScanFlag ? 'Shoferi e mbylli pa skanim - pritet ngarkimi nga kompania' : 'Nuk ka dokument te skanuar'}
                </div>
              )}
            </div>

            <div className="space-y-3 text-sm">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Te dhenat AI</p>
              <DataRow label="Partner" value={ex.supplier_name || ex.customer_name || note.partner_name || '-'} />
              <DataRow label="Nr. dokumenti" value={ex.invoice_number || note.reference_number || '-'} />
              <DataRow label="Data" value={ex.invoice_date || '-'} />
              <DataRow
                label="Totali"
                value={ex.total != null ? `${Number(ex.total).toFixed(2)} ${ex.currency || ''}` : '-'}
              />
              {note.notes && (
                <div>
                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Shenime</p>
                  <pre className="text-xs text-gray-700 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap font-sans border border-gray-100">{note.notes}</pre>
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                Artikujt
              </p>
              <button
                type="button"
                onClick={addNewItem}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-sky-700 bg-sky-50 border border-sky-100 rounded-lg hover:bg-sky-100 transition-colors"
              >
                <Plus className="w-3 h-3" /> Shto artikull
              </button>
            </div>
            {loading ? (
              <div className="text-center py-6"><Loader2 className="w-5 h-5 animate-spin text-teal-600 inline" /></div>
            ) : rows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 p-5 text-center text-xs text-gray-400">
                AI nuk gjeti artikuj. Mund t'i shtoni manualisht gjate verifikimit ne stok.
              </div>
            ) : (
              <div className="space-y-3">
                {groupRows(rows).map((group) => (
                  <ItemGroupBlock
                    key={group.key}
                    group={group}
                    categories={categories}
                    products={products}
                    isOutgoing={isOutgoing}
                    onUpdate={updateRow}
                    onRemoveRow={removeRow}
                    onAddSplit={() => addSplit(group.key)}
                  />
                ))}
              </div>
            )}
          </div>

          {showRejectReason && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <p className="text-xs font-semibold text-amber-900 mb-2">Arsyeja e kthimit</p>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                className="w-full bg-white border border-amber-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                placeholder="Shkruani arsyen..."
              />
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-5 py-3 flex items-center justify-end gap-2 flex-wrap pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            onClick={() => setShowRejectReason(true)}
            disabled={!!saving}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 disabled:opacity-50"
          >
            <Undo2 className="w-4 h-4" /> Kthe
          </button>
          {showRejectReason && (
            <button
              onClick={handleReject}
              disabled={saving === 'reject' || !reason.trim()}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50"
            >
              {saving === 'reject' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Undo2 className="w-4 h-4" />}
              Konfirmo kthimin
            </button>
          )}
          {role === 'company_admin' && !showRejectReason && note.partner_id && (
            <button
              onClick={handleCreateInvoice}
              disabled={!!saving || creatingInvoice}
              className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg disabled:opacity-50 ${
                note.acc_invoice_id ? 'bg-teal-50 border border-teal-300 text-teal-800 hover:bg-teal-100' : 'bg-sky-600 text-white hover:bg-sky-700'
              }`}
            >
              {creatingInvoice ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              {note.acc_invoice_id ? 'Shiko faturen' : 'Krijo fature'}
            </button>
          )}
          {role === 'company_admin' && !showRejectReason && (
            <>
              <button
                onClick={handleApprove}
                disabled={!!saving}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700 disabled:opacity-50"
              >
                {saving === 'approve' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Warehouse className="w-4 h-4" />}
                Dergo te depo per stok
              </button>
              {!isOutgoing && (
                <button
                  onClick={handleSendToSorting}
                  disabled={!!saving}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50"
                  title="Dergo ne sortire ne depo — paletat do te ndahen ne A/B/C/Defekt"
                >
                  {saving === 'approve' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
                  Dergo ne Sortire
                </button>
              )}
            </>
          )}
          {!showRejectReason && (
            <button
              onClick={handleCompleteToStock}
              disabled={!!saving}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving === 'complete' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Regjistro ne stok
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-1.5 border-b border-gray-100 last:border-0">
      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide w-28 flex-shrink-0 pt-0.5">{label}</p>
      <p className="text-sm text-gray-900 break-words flex-1">{value}</p>
    </div>
  );
}

interface Group {
  key: string;
  sourceDescription: string;
  sourceQuantity: number;
  rows: RowState[];
}

function groupRows(rows: RowState[]): Group[] {
  const map = new Map<string, Group>();
  const order: string[] = [];
  for (const r of rows) {
    if (!map.has(r._groupKey)) {
      map.set(r._groupKey, {
        key: r._groupKey,
        sourceDescription: r._sourceDescription,
        sourceQuantity: r._sourceQuantity,
        rows: [],
      });
      order.push(r._groupKey);
    }
    map.get(r._groupKey)!.rows.push(r);
  }
  return order.map((k) => map.get(k)!);
}

const CONDITION_OPTIONS: { value: string; label: string; tone: string }[] = [
  { value: 'good', label: 'I mire', tone: 'bg-emerald-600' },
  { value: 'damaged', label: 'Me defekt', tone: 'bg-red-600' },
  { value: 'sorting', label: 'Per sortim', tone: 'bg-teal-600' },
  { value: 'ready_a', label: 'Klasse A', tone: 'bg-blue-600' },
  { value: 'ready_b', label: 'Klasse B', tone: 'bg-sky-600' },
  { value: 'ready_c', label: 'Klasse C', tone: 'bg-amber-600' },
];

const ACTION_OPTIONS: {
  value: 'stock' | 'sorting' | 'repair';
  label: string;
  icon: typeof Package;
  tone: string;
}[] = [
  { value: 'stock', label: 'Stok', icon: Package, tone: 'bg-emerald-600' },
  { value: 'sorting', label: 'Sortire', icon: Layers, tone: 'bg-teal-600' },
  { value: 'repair', label: 'Defekt', icon: Wrench, tone: 'bg-red-600' },
];

function ItemGroupBlock({
  group,
  categories,
  products,
  isOutgoing = false,
  onUpdate,
  onRemoveRow,
  onAddSplit,
}: {
  group: Group;
  categories: Category[];
  products: Product[];
  isOutgoing?: boolean;
  onUpdate: (key: string, patch: Partial<RowState>) => void;
  onRemoveRow: (key: string) => void;
  onAddSplit: () => void;
}) {
  const sumQty = useMemo(() => group.rows.reduce((s, r) => s + (r.quantity || 0), 0), [group.rows]);
  const hasSource = group.sourceQuantity > 0;
  const diff = group.sourceQuantity - sumQty;

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-3">
      {group.sourceDescription && (
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5 flex items-center gap-1">
              <Sparkles className="w-2.5 h-2.5 text-emerald-500" /> AI nga dokumenti
              {isOutgoing && (
                <span className="ml-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-semibold normal-case tracking-normal">
                  Zbritet nga stoku
                </span>
              )}
            </p>
            <p className="text-xs text-gray-700 break-words">{group.sourceDescription}</p>
          </div>
          {hasSource && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-[11px] text-gray-500">
                AI: <span className="font-bold text-gray-700">{group.sourceQuantity}</span>
              </span>
              <span className="text-[11px] text-gray-500">
                Ndare: <span className={`font-bold ${diff === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>{sumQty}</span>
              </span>
              {diff !== 0 && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800">
                  {diff > 0 ? `+${diff}` : diff}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        {group.rows.map((row, idx) => (
          <SplitRow
            key={row._key}
            row={row}
            categories={categories}
            products={products}
            isOutgoing={isOutgoing}
            onUpdate={onUpdate}
            onRemove={group.rows.length > 1 || !row._persistedId ? () => onRemoveRow(row._key) : null}
            isFirst={idx === 0}
          />
        ))}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onAddSplit}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-teal-700 bg-teal-50 border border-teal-100 rounded-lg hover:bg-teal-100 transition-colors"
        >
          <Plus className="w-3 h-3" /> Shto ndarje
        </button>
      </div>
    </div>
  );
}

function SplitRow({
  row,
  categories,
  products,
  isOutgoing = false,
  onUpdate,
  onRemove,
  isFirst,
}: {
  row: RowState;
  categories: Category[];
  products: Product[];
  isOutgoing?: boolean;
  onUpdate: (key: string, patch: Partial<RowState>) => void;
  onRemove: (() => void) | null;
  isFirst: boolean;
}) {
  const productsForCategory = useMemo(
    () => (row.category_id ? products.filter((p) => p.category_id === row.category_id) : []),
    [products, row.category_id],
  );
  const invalid = !row.category_id || !row.quantity || row.quantity <= 0;

  function handleCategoryChange(val: string) {
    const cur = products.find((p) => p.id === row.product_id);
    const keepProduct = cur && cur.category_id === val;
    onUpdate(row._key, {
      category_id: val || null,
      product_id: keepProduct ? row.product_id : null,
      auto_matched: false,
    });
  }

  function handleActionChange(val: 'stock' | 'sorting' | 'repair') {
    if (isOutgoing) val = 'stock';
    let condition = row.condition;
    if (val === 'repair') condition = 'damaged';
    else if (val === 'sorting') condition = 'sorting';
    else if (condition === 'damaged' || condition === 'sorting') condition = 'good';
    onUpdate(row._key, { intended_action: val, condition });
  }

  return (
    <div
      className={`bg-white border rounded-lg p-2.5 space-y-2 ${
        invalid ? 'border-red-200 ring-1 ring-red-100' : 'border-gray-200'
      } ${!isFirst ? 'ml-4 border-l-4 border-l-teal-200' : ''}`}
    >
      <div className="grid grid-cols-12 gap-2">
        <select
          value={row.category_id || ''}
          onChange={(e) => handleCategoryChange(e.target.value)}
          className="col-span-5 bg-white border border-gray-200 rounded-lg px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
        >
          <option value="">-- Kategoria --</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          value={row.product_id || ''}
          onChange={(e) => {
            const newId = e.target.value || null;
            const newProd = newId ? products.find((p) => p.id === newId) ?? null : null;
            const d = deriveConditionAction(row._sourceDescription || row.notes || '', newProd?.name, null, isOutgoing);
            onUpdate(row._key, {
              product_id: newId,
              auto_matched: false,
              condition: d.condition,
              intended_action: isOutgoing ? 'stock' : d.intended_action,
            });
          }}
          disabled={!row.category_id}
          className="col-span-5 bg-white border border-gray-200 rounded-lg px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-gray-50 disabled:text-gray-400"
        >
          <option value="">{row.category_id ? '-- Produkti --' : 'Zgjidh kategorine'}</option>
          {productsForCategory.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <input
          type="number"
          min={0}
          inputMode="numeric"
          value={row.quantity || ''}
          onChange={(e) => onUpdate(row._key, { quantity: parseInt(e.target.value) || 0 })}
          className="col-span-2 bg-white border border-gray-200 rounded-lg px-2 py-2 text-xs text-right font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500"
          placeholder="Sasia"
        />
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1 flex-wrap">
          {ACTION_OPTIONS.filter((opt) => !isOutgoing || opt.value === 'stock').map((opt) => {
            const Icon = opt.icon;
            const active = row.intended_action === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleActionChange(opt.value)}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                  active ? `${opt.tone} text-white border-transparent` : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                <Icon className="w-3 h-3" />
                {opt.label}
              </button>
            );
          })}
        </div>
        {row.auto_matched && (() => {
          const tone =
            row.match_confidence === 'high' ? 'bg-emerald-100 text-emerald-700' :
            row.match_confidence === 'medium' ? 'bg-amber-100 text-amber-800' :
            'bg-gray-100 text-gray-600';
          const label =
            row.match_type === 'sku' ? 'AI - SKU' :
            row.match_type === 'combined' ? 'AI - Kategori + Produkt' :
            row.match_type === 'product_name' ? 'AI - Produkt' :
            'AI - Kategori';
          return (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${tone}`}>
              <Sparkles className="w-2.5 h-2.5" />
              {label}
              {row.match_confidence && row.match_confidence !== 'none' && (
                <span className="opacity-75">
                  {row.match_confidence === 'high' ? '(e larte)' : row.match_confidence === 'medium' ? '(e mesme)' : '(e ulet)'}
                </span>
              )}
            </span>
          );
        })()}
      </div>

      <div className="flex items-center gap-1 flex-wrap">
        {CONDITION_OPTIONS.map((opt) => {
          const active = row.condition === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onUpdate(row._key, { condition: opt.value })}
              className={`px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                active ? `${opt.tone} text-white border-transparent` : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-red-600 hover:bg-red-50 transition-colors"
          >
            <Minus className="w-3 h-3" /> Hiq
          </button>
        )}
      </div>
    </div>
  );
}
