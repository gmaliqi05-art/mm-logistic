import { useEffect, useMemo, useRef, useState } from 'react';
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
  Save,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import { matchProduct } from '../../utils/productMatcher';
import { isEuroPaletteName, isNewPalletProduct, epalClassRank } from '../../utils/productSort';
import { parseLineItemsFromNotes } from '../../utils/scanLineInference';
import { notifyUsers } from '../../utils/notifications';
import FlowRoleSelector from './FlowRoleSelector';
import StockDeductionConfirmModal from './StockDeductionConfirmModal';
import type { FlowRole } from '../../utils/counterpartyMatch';
import { isOwnCompanyName } from '../../utils/companyName';

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
  auto_register_partner?: boolean | null;
  company_reviewed_at?: string | null;
  company_reviewed_by?: string | null;
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
  aliases?: string[] | null;
}

interface Product {
  id: string;
  name: string;
  sku: string | null;
  category_id: string | null;
  aliases?: string[] | null;
  keywords?: string[] | null;
  dimensions?: string | null;
  default_condition?: string | null;
}

interface DeliveryReviewPanelProps {
  role: Role;
  typeFilter?: 'delivery' | 'pickup';
  hideChrome?: boolean;
  emptyMessage?: string;
}

export default function DeliveryReviewPanel({ role, typeFilter, hideChrome, emptyMessage }: DeliveryReviewPanelProps) {
  const { profile } = useAuth();
  const { t } = useTranslation();
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
      .select('*, items:delivery_note_items(intended_action)')
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
          <p className="text-sm font-medium text-gray-700">{emptyMessage || t('review.cta.allClearTitle')}</p>
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

  function getRoutingTag(n: ReviewNote): 'sorting' | 'stock' | 'mixed' | null {
    const items = (n as any).items as Array<{ intended_action: string | null }> | undefined;
    if (!items || items.length === 0) return null;
    const hasSorting = items.some((i) => i.intended_action === 'sorting');
    const hasRepair = items.some((i) => i.intended_action === 'repair');
    const hasStock = items.some((i) => !i.intended_action || i.intended_action === 'stock');
    if (hasSorting && !hasStock && !hasRepair) return 'sorting';
    if (hasSorting || hasRepair) return 'mixed';
    return 'stock';
  }

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
                {role === 'depot_worker' && (() => {
                  const tag = getRoutingTag(n);
                  if (tag === 'sorting') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-800">SORTIM</span>;
                  if (tag === 'mixed') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">SORTIM + STOK</span>;
                  return null;
                })()}
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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [showStockDeduction, setShowStockDeduction] = useState(false);
  const [stockDeductionItems, setStockDeductionItems] = useState<Array<{ product_name: string; category_name: string; quantity: number; condition: string; stock_available: number | null }>>([]);
  const [rows, setRows] = useState<RowState[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState<'approve' | 'complete' | 'reject' | null>(null);
  const [itemsDirty, setItemsDirty] = useState(false);
  const [savingItems, setSavingItems] = useState(false);
  const [reason, setReason] = useState('');
  const [showRejectReason, setShowRejectReason] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scannedUrl, setScannedUrl] = useState<string | null>(note.scanned_photo_url);
  const [uploading, setUploading] = useState(false);
  const initialFlowRole: FlowRole | null = note.flow_role ?? (note.type === 'pickup' ? 'receiver' : null);
  const [currentFlowRole, setCurrentFlowRole] = useState<FlowRole | null>(initialFlowRole);
  const isOutgoing = currentFlowRole
    ? currentFlowRole === 'sender' || currentFlowRole === 'custodian_out'
    : note.type === 'delivery';
  const [stockMap, setStockMap] = useState<Record<string, number>>({});
  const [negConfirm, setNegConfirm] = useState<null | {
    shortages: Array<{ label: string; condition: string; requested: number; available: number }>;
    onConfirm: () => void;
  }>(null);
  const [warningModal, setWarningModal] = useState<null | {
    messages: string[];
    onConfirm: () => void;
  }>(null);
  const [showInvoicePrompt, setShowInvoicePrompt] = useState(false);
  const [showSortingRedirect, setShowSortingRedirect] = useState(false);
  const persistingRef = useRef(false);
  const [ownCompany, setOwnCompany] = useState<{ name: string; vat: string }>({ name: '', vat: '' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('companies')
        .select('name, vat_number')
        .eq('id', note.company_id)
        .maybeSingle();
      if (cancelled) return;
      setOwnCompany({ name: (data?.name || '').trim(), vat: (data?.vat_number || '').trim() });
    })();
    return () => { cancelled = true; };
  }, [note.company_id]);

  const partnerIsOwnCompany = isOwnCompanyName(
    note.counterparty_name ?? note.partner_name,
    note.counterparty_vat,
    ownCompany.name,
    ownCompany.vat,
  );

  function getAiPartnerName(): string {
    const e = (note.ai_extracted_json as any) || {};
    const pickConsignor = shouldPickConsignor(note, e, note.type === 'pickup');
    const fromAi = pickConsignor ? e.consignor_name : e.consignee_name;
    return ((note.counterparty_name || note.partner_name || fromAi || '') as string).trim();
  }

  function hasSortingItems(): boolean {
    return rows.some((r) => r.intended_action === 'sorting');
  }

  function allSortingItems(): boolean {
    return rows.length > 0 && rows.every((r) => r.intended_action === 'sorting');
  }

  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!itemsDirty || loading || persistingRef.current) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      if (persistingRef.current) return;
      try {
        await persistItems();
        setItemsDirty(false);
      } catch { /* silent */ }
    }, 1500);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [rows, deletedIds, itemsDirty, loading]);

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

      // Trigger AI scan to extract document data (document_number, parties, etc.)
      triggerAiScan(file, path);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ngarkimi deshtoi');
    } finally {
      setUploading(false);
    }
  }

  async function triggerAiScan(file: File, _storagePath: string) {
    try {
      const companyId = profile?.company_id;
      if (!companyId) return;

      const scanPath = `scans/${companyId}/${Date.now()}-${file.name}`;
      const { error: scanUpErr } = await supabase.storage
        .from('acc-scans')
        .upload(scanPath, file, { contentType: file.type || 'application/octet-stream', upsert: true });
      if (scanUpErr) return;

      const { data: scan, error: scanErr } = await supabase
        .from('acc_scanned_documents')
        .insert({
          company_id: companyId,
          uploaded_by: profile?.id,
          storage_path: scanPath,
          file_mime: file.type,
          file_size: file.size,
          status: 'uploaded',
        })
        .select()
        .single();
      if (scanErr || !scan) return;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scan-document`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ scanId: scan.id, role: 'company_admin' }),
        },
      );
      const json = await res.json();
      if (!json.success || !json.extracted) return;

      const ex = json.extracted;
      const docNumber = ex.document_number || ex.invoice_number || '';
      const updatePayload: Record<string, unknown> = {
        ai_extracted_json: ex,
        ai_confidence: ex.confidence ?? null,
        updated_at: new Date().toISOString(),
      };
      if (docNumber) {
        updatePayload.document_number = docNumber;
        if (!note.reference_number) {
          updatePayload.reference_number = docNumber;
        }
      }

      await supabase
        .from('delivery_notes')
        .update(updatePayload)
        .eq('id', note.id);

      onDone();
    } catch {
      // AI scan is best-effort; the upload already succeeded
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Heqja deshtoi');
    } finally {
      setUploading(false);
    }
  }

  useEffect(() => {
    load();
  }, [note.id]);

  async function load() {
    setLoading(true);
    const depotId = note.assigned_depot_id;
    const stockQuery = depotId
      ? supabase.from('stock').select('category_id, category_product_id, condition, quantity')
          .eq('company_id', note.company_id).eq('depot_id', depotId)
      : Promise.resolve({ data: [] });
    const [itemsRes, catsRes, prodsRes, stockRes] = await Promise.all([
      supabase.from('delivery_note_items').select('*').eq('delivery_note_id', note.id).order('created_at', { ascending: true }),
      supabase.from('product_categories').select('id, name, aliases').eq('company_id', note.company_id).order('name'),
      supabase.from('category_products').select('id, name, sku, category_id, aliases, keywords, dimensions, default_condition').eq('company_id', note.company_id).eq('is_active', true).order('name'),
      stockQuery,
    ]);
    const sMap: Record<string, number> = {};
    ((stockRes as any).data as Array<{ category_id: string; category_product_id: string | null; condition: string; quantity: number }> | null ?? []).forEach((s) => {
      const key = `${s.category_id}|${s.category_product_id || ''}|${s.condition}`;
      sMap[key] = (sMap[key] || 0) + (s.quantity || 0);
    });
    setStockMap(sMap);
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

      if (!productId && categoryId) {
        const inCat = prods.filter((p) => p.category_id === categoryId);
        if (inCat.length === 1) {
          productId = inCat[0].id;
          autoMatched = true;
          matchedOn = matchedOn || 'category_name';
          if (inCat[0].default_condition && !condition) condition = inCat[0].default_condition;
        }
      }

      return {
        _key: it.id,
        _persistedId: it.id,
        _groupKey: `g-${idx}-${it.id}`,
        _isChild: false,
        _sourceDescription: '',
        _sourceQuantity: 0,
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
    setItemsDirty(true);
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

  async function persistItems(rowsOverride?: RowState[]) {
    if (persistingRef.current) return;
    persistingRef.current = true;
    const rowsToPersist = rowsOverride ?? rows;
    try {
      if (deletedIds.length > 0) {
        await supabase.from('delivery_note_items').delete().in('id', deletedIds);
        setDeletedIds([]);
      }
      const updates = rowsToPersist.filter((r) => r._persistedId);
      const inserts = rowsToPersist.filter((r) => !r._persistedId);

      for (const r of updates) {
        await supabase
          .from('delivery_note_items')
          .update({
            category_product_id: r.product_id,
            category_id: r.category_id,
            quantity: r.quantity,
            condition: r.condition,
            intended_action: r.intended_action,
            notes: r.notes,
          })
          .eq('id', r._persistedId!);
      }

      const insertedIds: string[] = [];
      if (inserts.length > 0) {
        const payload = inserts.map((r) => ({
          delivery_note_id: note.id,
          category_product_id: r.product_id,
          category_id: r.category_id,
          quantity: r.quantity,
          condition: r.condition,
          intended_action: r.intended_action,
          notes: r.notes,
        }));
        const { data: inserted } = await supabase
          .from('delivery_note_items')
          .insert(payload as any)
          .select('id');
        if (inserted) {
          const ids = inserted as Array<{ id: string }>;
          for (const it of ids) insertedIds.push(it.id);
          setRows((prev) => {
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

      const keepIds = new Set<string>([
        ...rowsToPersist.map((r) => r._persistedId).filter((id): id is string => !!id),
        ...insertedIds,
      ]);
      const { data: existing } = await supabase
        .from('delivery_note_items')
        .select('id')
        .eq('delivery_note_id', note.id);
      if (existing) {
        const stale = (existing as Array<{ id: string }>)
          .map((x) => x.id)
          .filter((id) => !keepIds.has(id));
        if (stale.length > 0) {
          await supabase.from('delivery_note_items').delete().in('id', stale);
        }
      }
    } finally {
      persistingRef.current = false;
    }
  }

  async function saveItemChanges() {
    setSavingItems(true);
    try {
      await persistItems();
      setItemsDirty(false);
      setDeletedIds([]);
    } finally {
      setSavingItems(false);
    }
  }

  async function ensureDepotAssigned(): Promise<string | null> {
    if (note.assigned_depot_id) return note.assigned_depot_id;
    let depotId: string | null = profile?.depot_id || null;
    if (!depotId) {
      const { data: defaultDepot } = await supabase
        .from('depots')
        .select('id')
        .eq('company_id', note.company_id)
        .eq('is_active', true)
        .order('depot_type', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      depotId = defaultDepot?.id || null;
    }
    if (depotId) {
      await supabase.from('delivery_notes').update({ assigned_depot_id: depotId }).eq('id', note.id);
      (note as any).assigned_depot_id = depotId;
    }
    return depotId;
  }

  async function handleApprove() {
    setSaving('approve');
    setError(null);
    try {
      const depotId = await ensureDepotAssigned();
      if (!depotId) {
        throw new Error(t('review.errors.noDepotApprove'));
      }
      if (rows.length === 0) {
        throw new Error(t('review.errors.addItemBeforeApprove'));
      }
      const invalid = rows.filter((r) => !r.category_id || !r.quantity || r.quantity <= 0);
      if (invalid.length > 0) {
        throw new Error(t('review.errors.fillCategoryQty'));
      }
      let hasPartnerLink = !!(note.partner_id || note.counterparty_contact_id || note.counterparty_company_id);
      const willAutoRegister = !!(note as any).auto_register_partner;
      if (!partnerIsOwnCompany && !hasPartnerLink && (willAutoRegister || !!getAiPartnerName()) && getAiPartnerName()) {
        const { data: contactId, error: rpcErr } = await supabase.rpc('auto_register_counterparty', { p_note_id: note.id });
        if (rpcErr) throw new Error(rpcErr.message);
        if (contactId) {
          (note as any).counterparty_contact_id = contactId;
          (note as any).partner_id = contactId;
          hasPartnerLink = true;
        }
      }
      if (!partnerIsOwnCompany && !hasPartnerLink && !willAutoRegister) {
        if (!getAiPartnerName()) throw new Error(t('review.errors.linkPartnerApprove'));
      }

      const autoRouted = rows.map((r) => {
        if (r.condition === 'damaged' && r.intended_action !== 'repair') {
          return { ...r, intended_action: 'repair' as const };
        }
        if (r.condition === 'sorting' && r.intended_action !== 'sorting') {
          return { ...r, intended_action: 'sorting' as const };
        }
        return r;
      });
      setRows(autoRouted);
      await persistItems(autoRouted);

      const allAreSorting = autoRouted.every((r) => r.intended_action === 'sorting');

      const prevAi = (note.ai_extracted_json as any) || null;
      const sanitizedAi = prevAi
        ? { ...prevAi, line_items: [], _original_line_items: prevAi.line_items ?? prevAi._original_line_items ?? null, _company_reviewed: true }
        : null;
      const updatePayload: Record<string, any> = {
        status: allAreSorting ? 'confirmed' : 'pending_stock_confirmation',
        company_reviewed_by: profile!.id,
        company_reviewed_at: new Date().toISOString(),
        ai_extracted_json: sanitizedAi,
        updated_at: new Date().toISOString(),
      };
      if (allAreSorting) {
        updatePayload.stock_confirmed_by = profile!.id;
        updatePayload.stock_confirmed_at = new Date().toISOString();
      }
      if (partnerIsOwnCompany) {
        updatePayload.auto_register_partner = false;
        updatePayload.partner_id = null;
        updatePayload.counterparty_contact_id = null;
        updatePayload.counterparty_company_id = null;
        if (!note.flow_role) updatePayload.flow_role = 'internal_transfer';
      }
      const scanUrl = (note as any).scanned_photo_url as string | null;
      const attachUrl = (note as any).attachment_url as string | null;
      if (scanUrl && !attachUrl) {
        updatePayload.attachment_url = scanUrl;
      }

      if (allAreSorting && depotId) {
        const { data: persistedItems } = await supabase
          .from('delivery_note_items')
          .select('id, category_id, quantity, intended_action, notes')
          .eq('delivery_note_id', note.id)
          .eq('intended_action', 'sorting');
        const createdBatchIds: string[] = [];
        if (persistedItems && persistedItems.length > 0) {
          for (const item of persistedItems) {
            if (!item.category_id || !item.quantity) continue;
            const { data: upserted } = await supabase
              .from('pallet_sorting_batches')
              .upsert({
                company_id: profile!.company_id!,
                depot_id: depotId,
                category_id: item.category_id,
                source_delivery_note_id: note.id,
                source_item_id: item.id,
                total_received: item.quantity,
                status: 'in_progress',
                notes: item.notes || '',
                created_by: profile!.id,
                reference_number_snapshot: (note as any).reference_number || note.note_number || '',
              }, { onConflict: 'source_item_id' })
              .select('id')
              .maybeSingle();
            if (upserted) createdBatchIds.push(upserted.id);
          }
        }

        const { error: upErr } = await supabase
          .from('delivery_notes')
          .update(updatePayload)
          .eq('id', note.id);
        if (upErr) throw upErr;

        const { data: depotUsers } = await supabase
          .from('profiles')
          .select('id')
          .eq('depot_id', depotId)
          .eq('role', 'depot_worker')
          .eq('is_active', true);
        if (depotUsers && depotUsers.length > 0) {
          const sortingUrl = createdBatchIds.length === 1
            ? `/depot/sorting?batch=${createdBatchIds[0]}`
            : '/depot/sorting';
          await notifyUsers({
            userIds: depotUsers.map((u) => u.id),
            type: 'delivery',
            titleKey: 'notifications.templates.sortingRequested.title',
            messageKey: 'notifications.templates.sortingRequested.body',
            params: { number: note.note_number },
            referenceId: note.id,
            fallbackTitle: 'Sortim i ri',
            fallbackMessage: `${note.note_number} kerkon sortim ne depo.`,
            url: sortingUrl,
          });
        }
      } else {
        const { error: upErr } = await supabase
          .from('delivery_notes')
          .update(updatePayload)
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
      }
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gabim');
    } finally {
      setSaving(null);
    }
  }

  async function handleCreateInvoice() {
    if (note.acc_invoice_id) {
      navigate(`/company/invoices/${note.acc_invoice_id}/print`);
      return;
    }
    setError(null);
    // Build stock deduction preview
    const items: typeof stockDeductionItems = [];
    for (const r of rows) {
      if (!r.category_id || !r.quantity) continue;
      const cat = categories.find((c) => c.id === r.category_id);
      const prod = products.find((p) => p.id === r.product_id);
      const cond = r.condition || 'good';
      const key = `${r.category_id}|${r.product_id || ''}|${cond}`;
      const available = stockMap[key] ?? null;
      items.push({
        product_name: prod?.name || '',
        category_name: cat?.name || '',
        quantity: r.quantity,
        condition: cond,
        stock_available: available,
      });
    }
    setStockDeductionItems(items);
    setShowStockDeduction(true);
  }

  async function executeInvoiceCreation() {
    setCreatingInvoice(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.rpc('create_invoice_with_stock_deduction', { p_note_id: note.id });
      if (err) throw err;
      const invoiceId = typeof data === 'string' ? data : (data as any)?.id;
      if (invoiceId) {
        navigate(`/company/invoices/${invoiceId}/print`);
      } else {
        navigate(`/company/invoices/new?delivery_note_id=${note.id}`);
      }
    } catch (e: any) {
      setError(e.message || 'Krijimi i fatures deshtoi');
      setShowStockDeduction(false);
    } finally {
      setCreatingInvoice(false);
    }
  }

  async function handleSendToSorting() {
    setSaving('approve');
    setError(null);
    try {
      const depotId = await ensureDepotAssigned();
      if (!depotId) {
        throw new Error(t('review.errors.noDepotSorting'));
      }
      if (rows.length === 0) {
        throw new Error(t('review.errors.addItemBeforeSorting'));
      }
      const invalid = rows.filter((r) => !r.category_id || !r.quantity || r.quantity <= 0);
      if (invalid.length > 0) {
        throw new Error(t('review.errors.fillCategoryQty'));
      }
      let hasPartnerLink = !!(note.partner_id || note.counterparty_contact_id || note.counterparty_company_id);
      const willAutoRegister = !!(note as any).auto_register_partner;
      if (!partnerIsOwnCompany && !hasPartnerLink && (willAutoRegister || !!getAiPartnerName()) && getAiPartnerName()) {
        const { data: contactId, error: rpcErr } = await supabase.rpc('auto_register_counterparty', { p_note_id: note.id });
        if (rpcErr) throw new Error(rpcErr.message);
        if (contactId) {
          (note as any).counterparty_contact_id = contactId;
          (note as any).partner_id = contactId;
          hasPartnerLink = true;
        }
      }
      if (!partnerIsOwnCompany && !hasPartnerLink && !willAutoRegister) {
        if (!getAiPartnerName()) throw new Error(t('review.errors.linkPartnerSorting'));
      }
      const sortingRows: RowState[] = rows.map((r) => ({
        ...r,
        intended_action: r.intended_action === 'repair' ? 'repair' : 'sorting',
      }));
      await persistItems(sortingRows);
      setRows(sortingRows);
      const prevAi = (note.ai_extracted_json as any) || null;
      const sanitizedAi = prevAi
        ? { ...prevAi, line_items: [], _original_line_items: prevAi.line_items ?? prevAi._original_line_items ?? null, _company_reviewed: true }
        : null;

      const allAreSorting = sortingRows.every((r) => r.intended_action === 'sorting');
      const targetStatus = allAreSorting ? 'confirmed' : 'pending_stock_confirmation';

      const updatePayload: Record<string, any> = {
        status: targetStatus,
        company_reviewed_by: profile!.id,
        company_reviewed_at: new Date().toISOString(),
        ai_extracted_json: sanitizedAi,
        updated_at: new Date().toISOString(),
      };
      if (allAreSorting) {
        updatePayload.stock_confirmed_by = profile!.id;
        updatePayload.stock_confirmed_at = new Date().toISOString();
      }
      if (partnerIsOwnCompany) {
        updatePayload.auto_register_partner = false;
        updatePayload.partner_id = null;
        updatePayload.counterparty_contact_id = null;
        updatePayload.counterparty_company_id = null;
        if (!note.flow_role) updatePayload.flow_role = 'internal_transfer';
      }
      const scanUrl = (note as any).scanned_photo_url as string | null;
      const attachUrl = (note as any).attachment_url as string | null;
      if (scanUrl && !attachUrl) {
        updatePayload.attachment_url = scanUrl;
      }

      // Create sorting batches before status update so trigger finds them via ON CONFLICT
      const { data: persistedItems } = await supabase
        .from('delivery_note_items')
        .select('id, category_id, quantity, intended_action, notes')
        .eq('delivery_note_id', note.id)
        .eq('intended_action', 'sorting');
      const createdBatchIds: string[] = [];
      if (persistedItems && persistedItems.length > 0) {
        for (const item of persistedItems) {
          if (!item.category_id || !item.quantity) continue;
          const { data: upserted } = await supabase
            .from('pallet_sorting_batches')
            .upsert({
              company_id: profile!.company_id!,
              depot_id: depotId,
              category_id: item.category_id,
              source_delivery_note_id: note.id,
              source_item_id: item.id,
              total_received: item.quantity,
              status: 'in_progress',
              notes: item.notes || '',
              created_by: profile!.id,
              reference_number_snapshot: (note as any).reference_number || note.note_number || '',
            }, { onConflict: 'source_item_id' })
            .select('id')
            .maybeSingle();
          if (upserted) createdBatchIds.push(upserted.id);
        }
      }

      const { error: upErr } = await supabase
        .from('delivery_notes')
        .update(updatePayload)
        .eq('id', note.id);
      if (upErr) throw upErr;

      // Notify depot workers with direct link to sorting page
      const { data: depotUsers } = await supabase
        .from('profiles')
        .select('id')
        .eq('depot_id', depotId)
        .eq('role', 'depot_worker')
        .eq('is_active', true);
      if (depotUsers && depotUsers.length > 0) {
        const sortingUrl = createdBatchIds.length === 1
          ? `/depot/sorting?batch=${createdBatchIds[0]}`
          : '/depot/sorting';
        await notifyUsers({
          userIds: depotUsers.map((u) => u.id),
          type: 'delivery',
          titleKey: 'notifications.templates.sortingRequested.title',
          messageKey: 'notifications.templates.sortingRequested.body',
          params: { number: note.note_number },
          referenceId: note.id,
          fallbackTitle: 'Sortim i ri',
          fallbackMessage: `${note.note_number} kerkon sortim ne depo.`,
          url: sortingUrl,
        });
      }
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gabim');
    } finally {
      setSaving(null);
    }
  }

  function effConditionForRow(r: RowState): string {
    if (r.intended_action === 'repair') return 'damaged';
    if (r.intended_action === 'sorting' && !['ready_a','ready_b','ready_c'].includes(r.condition)) return 'sorting';
    if (['good','damaged','repaired','sorting','ready_a','ready_b','ready_c'].includes(r.condition)) return r.condition;
    return 'good';
  }

  function computeShortages() {
    if (!isOutgoing) return [];
    const out: Array<{ label: string; condition: string; requested: number; available: number }> = [];
    for (const r of rows) {
      if (r.intended_action !== 'stock') continue;
      if (!r.category_id || !r.quantity) continue;
      const cond = effConditionForRow(r);
      const key = `${r.category_id}|${r.product_id || ''}|${cond}`;
      const available = stockMap[key] || 0;
      if (available < r.quantity) {
        const prod = products.find((p) => p.id === r.product_id);
        const cat = categories.find((c) => c.id === r.category_id);
        out.push({
          label: prod?.name || cat?.name || 'Artikull',
          condition: cond,
          requested: r.quantity,
          available,
        });
      }
    }
    return out;
  }

  function humanizeWarnings(raw: string[]): string[] {
    const cleaned: string[] = [];
    for (const w of raw) {
      if (!w) continue;
      // Filter out technical internals that should not reach the user.
      if (/pallet_account/i.test(w)) continue;
      // Translate common backend messages to Albanian.
      const stockMatch = w.match(/Insufficient stock for item\s+([a-f0-9-]+):\s*need\s+(\d+),\s*have\s+(\d+)/i);
      if (stockMatch) {
        cleaned.push(`Stok i pamjaftueshem: kerkohen ${stockMatch[2]}, ne depo ${stockMatch[3]}.`);
        continue;
      }
      cleaned.push(w);
    }
    return cleaned;
  }

  async function handleCompleteToStock(allowNegative: boolean = false, skipWarnings: boolean = false) {
    setSaving('complete');
    setError(null);
    try {
      if (rows.length === 0) {
        throw new Error(t('review.errors.noItemsToStock'));
      }
      const missing = rows.filter((r) => !r.category_id || !r.quantity || r.quantity <= 0);
      if (missing.length > 0) {
        throw new Error(t('review.errors.fillCategoryQtyStock'));
      }
      const missingProduct = rows.filter(
        (r) => r.intended_action !== 'repair' && !r.product_id,
      );
      if (missingProduct.length > 0) {
        throw new Error(t('review.errors.productRequired'));
      }

      if (!allowNegative) {
        const shortages = computeShortages();
        if (shortages.length > 0) {
          setSaving(null);
          setNegConfirm({
            shortages,
            onConfirm: () => {
              setNegConfirm(null);
              handleCompleteToStock(true);
            },
          });
          return;
        }
      }

      let hasPartnerLink = !!(note.partner_id || note.counterparty_contact_id || note.counterparty_company_id);
      const willAutoRegister = !!(note as any).auto_register_partner;
      if (!partnerIsOwnCompany && !hasPartnerLink && (willAutoRegister || !!getAiPartnerName()) && getAiPartnerName()) {
        const { data: contactId, error: rpcErr } = await supabase.rpc('auto_register_counterparty', { p_note_id: note.id });
        if (rpcErr) throw new Error(rpcErr.message);
        if (contactId) {
          (note as any).counterparty_contact_id = contactId;
          (note as any).partner_id = contactId;
          hasPartnerLink = true;
        }
      }
      if (!partnerIsOwnCompany && !hasPartnerLink && !willAutoRegister) {
        if (!getAiPartnerName()) throw new Error(t('review.errors.linkPartnerStock'));
      }

      await persistItems();

      if (isOutgoing) {
        await supabase
          .from('delivery_notes')
          .update({ allow_negative_stock: allowNegative })
          .eq('id', note.id);
      }

      const depotId = await ensureDepotAssigned();
      if (!depotId) throw new Error(t('review.errors.noDepotBasic'));

      const { data: validation, error: vErr } = await supabase.functions.invoke('validate-delivery-action', {
        body: {
          action: 'confirm',
          delivery_note_id: note.id,
        },
      });

      if (vErr || !validation?.valid) {
        throw new Error((validation?.blockers || ['Validimi dështoi']).join('\n'));
      }

      if (!skipWarnings && validation.warnings?.length > 0) {
        const messages = humanizeWarnings(validation.warnings as string[]);
        if (messages.length > 0) {
          setSaving(null);
          setWarningModal({
            messages,
            onConfirm: () => {
              setWarningModal(null);
              handleCompleteToStock(allowNegative, true);
            },
          });
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

      if (isOutgoing && !note.acc_invoice_id && role === 'company_admin') {
        setShowInvoicePrompt(true);
      } else if (hasSortingItems()) {
        setShowSortingRedirect(true);
      } else {
        await onDone();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gabim gjate regjistrimit ne stok');
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gabim');
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
              <h3 className="text-base font-bold text-gray-900">{(note as any).document_number || note.note_number}</h3>
              {(note as any).document_number && (note as any).document_number !== note.note_number && (
                <span className="text-xs text-gray-400">({note.note_number})</span>
              )}
              {noScanFlag && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200">
                  <AlertCircle className="w-3 h-3" />{t('common.paSkanim')}</span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {isPickup ? 'Fletemarrje' : 'Fletedergese'}
              {(note.counterparty_name || note.partner_name) ? ` - ${note.counterparty_name || note.partner_name}` : ''}
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

          {(note as any).auto_reviewed && (
            <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 flex items-center gap-2 text-sm text-sky-800">
              <Sparkles className="w-4 h-4 flex-shrink-0 text-sky-600" />
              <div>
                <p className="font-semibold text-sky-900">Shqyrtim automatik</p>
                <p className="text-xs text-sky-700 mt-0.5">{t('common.kyDokumentUMiratuaAutomatikishtSepse')}</p>
              </div>
            </div>
          )}

          {role === 'depot_worker' && hasSortingItems() && (
            <div className={`rounded-xl p-3 flex items-center gap-3 border ${allSortingItems() ? 'bg-teal-50 border-teal-200' : 'bg-amber-50 border-amber-200'}`}>
              <Layers className={`w-5 h-5 flex-shrink-0 ${allSortingItems() ? 'text-teal-600' : 'text-amber-600'}`} />
              <div>
                <p className={`text-sm font-bold ${allSortingItems() ? 'text-teal-900' : 'text-amber-900'}`}>
                  {allSortingItems()
                    ? t('review.sortingBanner.allSortingTitle')
                    : t('review.sortingBanner.mixedTitle')}
                </p>
                <p className="text-xs text-gray-600 mt-0.5">
                  {allSortingItems()
                    ? t('review.sortingBanner.allSortingDesc')
                    : note.company_reviewed_at
                      ? t('review.sortingBanner.mixedCompanyReviewed')
                      : t('review.sortingBanner.mixedDesc')}
                </p>
              </div>
            </div>
          )}

          {profile?.company_id && role === 'company_admin' && (() => {
              const e = (note.ai_extracted_json as any) || {};
              const pickFromConsignor = shouldPickConsignor(note, e, note.type === 'pickup');
              const aiSnap = pickFromConsignor
                ? {
                    name: e.consignor_name || null,
                    vat: e.consignor_vat || null,
                    email: e.consignor_email || null,
                    phone: e.consignor_phone || null,
                    address: e.consignor_address || null,
                    order_number: e.document_number || e.invoice_number || e.order_number || e.reference_number || null,
                  }
                : {
                    name: e.consignee_name || null,
                    vat: e.consignee_vat || null,
                    email: e.consignee_email || null,
                    phone: e.consignee_phone || null,
                    address: e.consignee_address || null,
                    order_number: e.document_number || e.invoice_number || e.order_number || e.reference_number || null,
                  };
              const routing = e._routing || e.routing;
              const routingOverride = routing?.partner_to_register && aiSnap.name;
              return (
                <FlowRoleSelector
                  ownCompanyId={profile.company_id}
                  noteId={note.id}
                  noteType={note.type}
                  onRoleChange={(r) => setCurrentFlowRole(r)}
                  onChanged={onDone}
                  initial={{
                    flow_role: note.flow_role ?? (note.type === 'pickup' ? 'receiver' : 'sender'),
                    counterparty_company_id: note.counterparty_company_id ?? null,
                    counterparty_contact_id: note.counterparty_contact_id ?? null,
                    counterparty_name: routingOverride ? aiSnap.name : (note.counterparty_name ?? note.partner_name ?? null),
                    counterparty_vat: routingOverride ? (aiSnap.vat || note.counterparty_vat || null) : (note.counterparty_vat ?? null),
                    counterparty_email: routingOverride ? (aiSnap.email || note.counterparty_email || null) : (note.counterparty_email ?? null),
                    counterparty_phone: routingOverride ? (aiSnap.phone || note.counterparty_phone || null) : (note.counterparty_phone ?? null),
                    counterparty_address: routingOverride ? (aiSnap.address || null) : ((note.type === 'pickup' ? (note as any).pickup_address : (note as any).delivery_address) ?? null),
                    reference_number: (note as any).reference_number ?? null,
                    partner_id: note.partner_id ?? null,
                    auto_register_partner: note.auto_register_partner ?? null,
                  }}
                  aiSnapshot={aiSnap}
                />
              );
          })()}

          <div className="grid lg:grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Dokumenti i skanuar</p>
              {scannedUrl ? (
                <div className="rounded-xl border border-gray-200 overflow-hidden bg-gray-50">
                  {/\.(pdf)(\?|$)/i.test(scannedUrl) ? (
                    <div className="p-6 text-center text-xs text-gray-500 bg-white">{t('common.pdfINgarkuar')}</div>
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
                      <Download className="w-3.5 h-3.5" /> {t('review.openOriginal')}
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
                    <p className="text-xs font-semibold text-amber-800">{t('common.shoferiEMbylliPaSkanim')}</p>
                    <p className="text-[11px] text-amber-700 mt-0.5">{t('common.ngarkoniDokumentinQeJuErdhiMe')}</p>
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
                  <p className="mt-0.5 text-[11px] text-gray-500">{t('common.imageOsePdfDeriMb')}</p>
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
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Te dhenat Doc</p>
              <PartnerSnapshot
                note={note}
                ex={ex}
                isPickup={isPickup}
                partnerIsOwnCompany={partnerIsOwnCompany}
                ownCompanyName={ownCompany.name}
                ownCompanyVat={ownCompany.vat}
                onSelectPartner={async (data) => {
                  await supabase.from('delivery_notes').update({
                    counterparty_name: data.name || null,
                    counterparty_vat: data.vat || null,
                    counterparty_email: data.email || null,
                    counterparty_phone: data.phone || null,
                    partner_name: data.name || null,
                    auto_register_partner: true,
                    updated_at: new Date().toISOString(),
                  }).eq('id', note.id);
                  onDone();
                }}
              />
              <DataRow label="Nr. dokumenti" value={ex.document_number || ex.invoice_number || note.reference_number || '-'} />
              <DataRow label="Data" value={ex.document_date || ex.invoice_date || '-'} />

              {ex.line_items && ex.line_items.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                    Artikujt e skanuar ({ex.line_items.length})
                  </p>
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-100 text-left">
                        <tr>
                          <th className="px-2.5 py-1.5 font-semibold text-slate-600">{t('common.pershkrim')}</th>
                          <th className="px-2.5 py-1.5 font-semibold text-slate-600 text-right">{t('common.sasi')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {ex.line_items.map((li: any, idx: number) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="px-2.5 py-1.5 text-slate-800">{li.description}</td>
                            <td className="px-2.5 py-1.5 text-right text-slate-700">{li.quantity} {li.unit || ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {note.notes && (
                <div>
                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">{t('common.notes')}</p>
                  <pre className="text-xs text-gray-700 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap font-sans border border-gray-100">{note.notes}</pre>
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{t('common.lineItems')}</p>
              <div className="flex items-center gap-2">
                {itemsDirty && (
                  <button
                    type="button"
                    onClick={saveItemChanges}
                    disabled={savingItems}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50"
                  >
                    {savingItems ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Ruaj ndryshimet
                  </button>
                )}
                <button
                  type="button"
                  onClick={addNewItem}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-sky-700 bg-sky-50 border border-sky-100 rounded-lg hover:bg-sky-100 transition-colors"
                >
                  <Plus className="w-3 h-3" /> {t('review.addItem')}
                </button>
              </div>
            </div>
            {loading ? (
              <div className="text-center py-6"><Loader2 className="w-5 h-5 animate-spin text-teal-600 inline" /></div>
            ) : rows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 p-5 text-center text-xs text-gray-400">{t('common.aiNukGjetiArtikujMundT')}</div>
            ) : (
              <div className="space-y-3">
                {groupRows(rows).map((group) => {
                  const isSortingGroup = group.rows.every((r) => r.intended_action === 'sorting');
                  const depotReadOnly = role === 'depot_worker' && !!note.company_reviewed_at && isSortingGroup;
                  return (
                  <ItemGroupBlock
                    key={group.key}
                    group={group}
                    categories={categories}
                    products={products}
                    isOutgoing={isOutgoing}
                    stockMap={stockMap}
                    onUpdate={updateRow}
                    onRemoveRow={removeRow}
                    onAddSplit={() => addSplit(group.key)}
                    readOnly={depotReadOnly}
                    onCreateCategory={async (name, sourceDescription) => {
                      const aliases = sourceDescription ? [sourceDescription.trim()].filter(Boolean) : [];
                      const { data, error: e } = await supabase.from('product_categories').insert({
                        company_id: note.company_id,
                        name: name.trim(),
                        aliases,
                      } as any).select('id, name, aliases').maybeSingle();
                      if (e || !data) throw e || new Error('Nuk u krijua kategoria');
                      setCategories((prev) => [...prev, data as Category].sort((a, b) => a.name.localeCompare(b.name)));
                      return data as Category;
                    }}
                    onCreateProduct={async (name, categoryId, sourceDescription) => {
                      const aliases = sourceDescription ? [sourceDescription.trim()].filter(Boolean) : [];
                      const { data, error: e } = await supabase.from('category_products').insert({
                        company_id: note.company_id,
                        category_id: categoryId,
                        name: name.trim(),
                        aliases,
                      } as any).select('id, name, sku, category_id, aliases, keywords, dimensions, default_condition').maybeSingle();
                      if (e || !data) throw e || new Error('Nuk u krijua produkti');
                      setProducts((prev) => [...prev, data as Product].sort((a, b) => a.name.localeCompare(b.name)));
                      return data as Product;
                    }}
                  />
                  );
                })}
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
                placeholder={t('common.shkruaniArsyen')}
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
          {role === 'company_admin' && !showRejectReason && isOutgoing && note.status === 'confirmed' && (
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
                  title={t('common.dergoNeSortireNeDepoPaletat')}
                >
                  {saving === 'approve' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
                  Dergo ne Sortire
                </button>
              )}
            </>
          )}
          {!showRejectReason && (
            <button
              onClick={() => handleCompleteToStock(false)}
              disabled={!!saving}
              className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-50 ${
                role === 'depot_worker' && hasSortingItems()
                  ? 'bg-teal-600 hover:bg-teal-700'
                  : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {saving === 'complete' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {role === 'depot_worker' && allSortingItems()
                ? t('review.confirmAndSendToSorting')
                : role === 'depot_worker' && hasSortingItems()
                  ? t('review.confirmStockPlusSorting')
                  : t('review.registerToStock')}
            </button>
          )}
        </div>
      </div>

      {negConfirm && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setNegConfirm(null)}>
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-amber-50 border-b border-amber-100 px-5 py-4 flex items-start gap-3">
              <AlertCircle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-gray-900">Stok i pamjaftueshem</h4>
                <p className="text-xs text-gray-600 mt-1">Disa artikuj do te shkojne ne minus ne stok. Deshironi te vazhdoni?</p>
              </div>
            </div>
            <div className="p-5 space-y-2 max-h-80 overflow-y-auto">
              {negConfirm.shortages.map((s, i) => (
                <div key={i} className="flex items-center justify-between gap-3 bg-gray-50 rounded-lg px-3 py-2 text-xs">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{s.label}</p>
                    <p className="text-[10px] text-gray-500">Klasi: {s.condition}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-semibold text-amber-700">-{s.requested - s.available}</p>
                    <p className="text-[10px] text-gray-500">{s.available} / {s.requested}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 bg-gray-50 border-t border-gray-100">
              <button
                onClick={() => setNegConfirm(null)}
                className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-100"
              >{t('common.cancel')}</button>
              <button
                onClick={negConfirm.onConfirm}
                className="px-4 py-2 text-sm font-semibold text-white bg-amber-600 rounded-lg hover:bg-amber-700"
              >
                Vazhdo ne minus
              </button>
            </div>
          </div>
        </div>
      )}

      {warningModal && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setWarningModal(null)}>
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-amber-50 border-b border-amber-100 px-5 py-4 flex items-start gap-3">
              <AlertCircle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-gray-900">Paralajmerime</h4>
                <p className="text-xs text-gray-600 mt-1">{t('common.reviewWarningsBeforeProceeding')}</p>
              </div>
            </div>
            <div className="p-5 space-y-2 max-h-80 overflow-y-auto">
              {warningModal.messages.map((m, i) => (
                <div key={i} className="bg-amber-50/60 border border-amber-100 rounded-lg px-3 py-2 text-sm text-gray-800">
                  {m}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 bg-gray-50 border-t border-gray-100">
              <button
                onClick={() => setWarningModal(null)}
                className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-100"
              >{t('common.cancel')}</button>
              <button
                onClick={warningModal.onConfirm}
                className="px-4 py-2 text-sm font-semibold text-white bg-amber-600 rounded-lg hover:bg-amber-700"
              >{t('common.continue')}</button>
            </div>
          </div>
        </div>
      )}

      {showInvoicePrompt && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => { setShowInvoicePrompt(false); onDone(); }}>
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-emerald-50 border-b border-emerald-100 px-5 py-4 flex items-start gap-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-gray-900">{t('common.deliveryRegisteredToStock')}</h4>
                <p className="text-sm text-gray-600 mt-1">{t('common.createInvoiceForDelivery')}</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4">
              <button
                onClick={() => { setShowInvoicePrompt(false); onDone(); }}
                className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-100"
              >
                Jo
              </button>
              <button
                onClick={() => { setShowInvoicePrompt(false); handleCreateInvoice(); }}
                className="px-4 py-2 text-sm font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700"
              >
                Po, krijo fature
              </button>
            </div>
          </div>
        </div>
      )}

      {showSortingRedirect && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => { setShowSortingRedirect(false); onDone(); }}>
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-teal-50 border-b border-teal-100 px-5 py-4 flex items-start gap-3">
              <CheckCircle2 className="w-6 h-6 text-teal-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-gray-900">U konfirmua me sukses</h4>
                <p className="text-sm text-gray-600 mt-1">Artikujt per sortim jane derguar ne sortire. Deshironi te shkoni direkt te faqja e sortimit?</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4">
              <button
                onClick={() => { setShowSortingRedirect(false); onDone(); }}
                className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-100"
              >{t('common.close')}</button>
              <button
                onClick={() => { setShowSortingRedirect(false); navigate('/depot/sorting'); }}
                className="px-4 py-2 text-sm font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700"
              >
                Shko te Sortimi
              </button>
            </div>
          </div>
        </div>
      )}

      {showStockDeduction && (
        <StockDeductionConfirmModal
          items={stockDeductionItems}
          noteNumber={note.note_number}
          partnerName={note.partner_name}
          onConfirm={executeInvoiceCreation}
          onCancel={() => setShowStockDeduction(false)}
        />
      )}
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

function shouldPickConsignor(note: ReviewNote, ex: any, isPickup: boolean): boolean {
  const routing = ex._routing || ex.routing;
  if (routing?.partner_to_register === 'consignor') return true;
  if (routing?.partner_to_register === 'consignee') return false;
  return isPickup || note.flow_role === 'receiver' || (note as any).our_role === 'consignee';
}

function PartnerSnapshot({
  note,
  ex,
  isPickup,
  partnerIsOwnCompany,
  ownCompanyName,
  ownCompanyVat,
  onSelectPartner,
}: {
  note: ReviewNote;
  ex: any;
  isPickup: boolean;
  partnerIsOwnCompany: boolean;
  ownCompanyName?: string;
  ownCompanyVat?: string;
  onSelectPartner?: (data: { name: string; vat: string; email: string; phone: string; address: string }) => void;
}) {
  const { t } = useTranslation();
  const routing = ex._routing || ex.routing;
  const pickConsignor = shouldPickConsignor(note, ex, isPickup);

  const partnerName =
    (pickConsignor ? ex.consignor_name : ex.consignee_name) ||
    note.counterparty_name ||
    note.partner_name ||
    '';
  const partnerVat =
    (pickConsignor ? ex.consignor_vat : ex.consignee_vat) ||
    note.counterparty_vat ||
    '';
  const partnerAddress =
    (pickConsignor ? ex.consignor_address : ex.consignee_address) ||
    (isPickup ? note.pickup_address : note.delivery_address) ||
    '';
  const partnerEmail =
    (pickConsignor ? ex.consignor_email : ex.consignee_email) ||
    note.counterparty_email ||
    '';
  const partnerPhone =
    (pickConsignor ? ex.consignor_phone : ex.consignee_phone) ||
    note.counterparty_phone ||
    '';

  const carrierName = ex.carrier_name || '';
  const carrierIsOwnCompany = !!(ownCompanyName && isOwnCompanyName(carrierName, null, ownCompanyName, ownCompanyVat));

  const isLinked = !!(note.counterparty_contact_id || note.partner_id || note.counterparty_company_id);
  const isNew = !!note.auto_register_partner && !isLinked;
  const roleLabel = routing?.partner_to_register
    ? t('common.scanner.partnerClient')
    : (isPickup ? t('common.scanner.sender') : t('common.scanner.receiver'));

  if (partnerIsOwnCompany) {
    return (
      <div className="flex items-start gap-3 py-1.5 border-b border-gray-100">
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide w-28 flex-shrink-0 pt-0.5">Partner</p>
        <p className="text-sm text-gray-900 break-words flex-1">Kompania jone (transfer i brendshem)</p>
      </div>
    );
  }

  if (!partnerName) {
    return <DataRow label="Partner" value="-" />;
  }

  const canClick = !!onSelectPartner && !isLinked;

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={!canClick}
        onClick={() => canClick && onSelectPartner?.({ name: partnerName, vat: partnerVat, email: partnerEmail, phone: partnerPhone, address: partnerAddress })}
        className={`w-full text-left rounded-xl border border-gray-200 bg-gradient-to-br from-sky-50/40 to-white p-3 transition-all ${
          canClick ? 'cursor-pointer hover:border-teal-400 hover:shadow-sm active:scale-[0.99]' : ''
        }`}
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{roleLabel}</p>
            <p className="text-sm font-bold text-gray-900 break-words">{partnerName}</p>
          </div>
          {isLinked ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 flex-shrink-0">
              <CheckCircle2 className="w-3 h-3" /> Ekziston
            </span>
          ) : isNew ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 flex-shrink-0">
              <Sparkles className="w-3 h-3" /> I ri
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-600 border border-gray-200 flex-shrink-0">{t('common.paLidhje')}</span>
          )}
        </div>
        <div className="space-y-1 text-xs text-gray-700">
          {partnerVat && (
            <p><span className="text-gray-500">VAT:</span> <span className="font-semibold">{partnerVat}</span></p>
          )}
          {partnerAddress && (
            <p className="break-words"><span className="text-gray-500">Adresa:</span> {partnerAddress}</p>
          )}
          {partnerEmail && (
            <p className="break-words"><span className="text-gray-500">Email:</span> {partnerEmail}</p>
          )}
          {partnerPhone && (
            <p><span className="text-gray-500">Telefoni:</span> {partnerPhone}</p>
          )}
        </div>
        <p className="mt-2 text-[10px] text-gray-500">
          {isLinked
            ? 'Te dhenat e mbushura nga skanimi. Ndryshoji te seksioni Partneri me lart.'
            : canClick
              ? 'Kliko per te vendosur kete partner automatikisht.'
              : 'Ky partner do te regjistrohet automatikisht kur ta dergoni ne stok.'}
        </p>
      </button>

      {carrierName && !carrierIsOwnCompany && (
        <div className="rounded-lg border border-gray-150 bg-gray-50/50 p-2.5">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-0.5">
            {t('common.scanner.carrier')}
          </p>
          <p className="text-xs font-semibold text-gray-800 break-words">{carrierName}</p>
        </div>
      )}
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
  stockMap,
  onUpdate,
  onRemoveRow,
  onAddSplit,
  onCreateCategory,
  onCreateProduct,
  readOnly = false,
}: {
  group: Group;
  categories: Category[];
  products: Product[];
  isOutgoing?: boolean;
  stockMap: Record<string, number>;
  onUpdate: (key: string, patch: Partial<RowState>) => void;
  onRemoveRow: (key: string) => void;
  onAddSplit: () => void;
  onCreateCategory: (name: string, sourceDescription?: string) => Promise<Category>;
  onCreateProduct: (name: string, categoryId: string, sourceDescription?: string) => Promise<Product>;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
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
            stockMap={stockMap}
            onUpdate={onUpdate}
            onRemove={readOnly ? null : (group.rows.length > 1 || !row._persistedId ? () => onRemoveRow(row._key) : null)}
            isFirst={idx === 0}
            onCreateCategory={onCreateCategory}
            onCreateProduct={onCreateProduct}
            readOnly={readOnly}
          />
        ))}
      </div>

      {!readOnly && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onAddSplit}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-teal-700 bg-teal-50 border border-teal-100 rounded-lg hover:bg-teal-100 transition-colors"
          >
            <Plus className="w-3 h-3" /> {t('review.addSplit')}
          </button>
        </div>
      )}
    </div>
  );
}

function SplitRow({
  row,
  categories,
  products,
  isOutgoing = false,
  stockMap,
  onUpdate,
  onRemove,
  isFirst,
  onCreateCategory,
  onCreateProduct,
  readOnly = false,
}: {
  row: RowState;
  categories: Category[];
  products: Product[];
  isOutgoing?: boolean;
  stockMap: Record<string, number>;
  onUpdate: (key: string, patch: Partial<RowState>) => void;
  onRemove: (() => void) | null;
  isFirst: boolean;
  onCreateCategory: (name: string, sourceDescription?: string) => Promise<Category>;
  onCreateProduct: (name: string, categoryId: string, sourceDescription?: string) => Promise<Product>;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const productsForCategory = useMemo(
    () => (row.category_id ? products.filter((p) => p.category_id === row.category_id) : []),
    [products, row.category_id],
  );
  const invalid = !row.category_id || !row.quantity || row.quantity <= 0;
  const [createCatName, setCreateCatName] = useState('');
  const [createProdName, setCreateProdName] = useState('');
  const [createMode, setCreateMode] = useState<null | 'cat' | 'prod'>(null);
  const [creating, setCreating] = useState(false);

  const effCond =
    row.intended_action === 'repair' ? 'damaged' :
    row.intended_action === 'sorting' && !['ready_a','ready_b','ready_c'].includes(row.condition) ? 'sorting' :
    ['good','damaged','repaired','sorting','ready_a','ready_b','ready_c'].includes(row.condition) ? row.condition : 'good';
  const stockKey = row.category_id ? `${row.category_id}|${row.product_id || ''}|${effCond}` : '';
  const availableStock = stockKey ? (stockMap[stockKey] || 0) : null;
  const showStockBadge = isOutgoing && row.intended_action === 'stock' && row.category_id && row.product_id;
  const goingNegative = showStockBadge && row.quantity > 0 && (availableStock ?? 0) < row.quantity;

  async function handleCategoryChange(val: string) {
    if (val === '__create__') {
      setCreateMode('cat');
      return;
    }
    const cur = products.find((p) => p.id === row.product_id);
    const keepProduct = cur && cur.category_id === val;
    const inCat = val ? products.filter((p) => p.category_id === val) : [];
    let autoProductId: string | null = keepProduct ? row.product_id : null;
    let autoCondition: string | undefined = undefined;
    if (!autoProductId && inCat.length === 1) {
      autoProductId = inCat[0].id;
      if (inCat[0].default_condition) autoCondition = inCat[0].default_condition;
    }
    onUpdate(row._key, {
      category_id: val || null,
      product_id: autoProductId,
      auto_matched: !!autoProductId && inCat.length === 1,
      ...(autoCondition ? { condition: autoCondition } : {}),
    });
  }

  async function submitCreateCategory() {
    if (!createCatName.trim()) return;
    setCreating(true);
    try {
      const cat = await onCreateCategory(createCatName, row._sourceDescription || row.notes || undefined);
      setCreateCatName('');
      setCreateMode(null);
      onUpdate(row._key, { category_id: cat.id, product_id: null, auto_matched: false });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Gabim');
    } finally {
      setCreating(false);
    }
  }

  async function submitCreateProduct() {
    if (!createProdName.trim() || !row.category_id) return;
    setCreating(true);
    try {
      const prod = await onCreateProduct(createProdName, row.category_id, row._sourceDescription || row.notes || undefined);
      setCreateProdName('');
      setCreateMode(null);
      onUpdate(row._key, { product_id: prod.id, auto_matched: false });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Gabim');
    } finally {
      setCreating(false);
    }
  }

  function handleActionChange(val: 'stock' | 'sorting' | 'repair') {
    let condition = row.condition;
    if (val === 'repair') condition = 'damaged';
    else if (val === 'sorting') condition = 'sorting';
    else if (condition === 'damaged' || condition === 'sorting') condition = 'good';
    onUpdate(row._key, { intended_action: val, condition });
  }

  if (readOnly) {
    const catName = categories.find((c) => c.id === row.category_id)?.name || '-';
    const prodName = products.find((p) => p.id === row.product_id)?.name || '';
    const actionLabel = row.intended_action === 'sorting' ? 'Sortim' : row.intended_action === 'repair' ? 'Riparim' : 'Stok';
    const actionColor = row.intended_action === 'sorting' ? 'bg-teal-100 text-teal-800' : row.intended_action === 'repair' ? 'bg-orange-100 text-orange-800' : 'bg-emerald-100 text-emerald-800';
    return (
      <div className={`bg-slate-50 border border-slate-200 rounded-lg p-2.5 ${!isFirst ? 'ml-4 border-l-4 border-l-slate-300' : ''}`}>
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-800 truncate">{catName}{prodName ? ` / ${prodName}` : ''}</p>
          </div>
          <span className="text-sm font-bold text-slate-900 tabular-nums">{row.quantity}</span>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${actionColor}`}>{actionLabel}</span>
        </div>
      </div>
    );
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
          <option value="__create__">+ Krijo kategori te re</option>
        </select>
        <select
          value={row.product_id || ''}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '__create__') {
              setCreateMode('prod');
              return;
            }
            const newId = v || null;
            const newProd = newId ? products.find((p) => p.id === newId) ?? null : null;
            const d = deriveConditionAction(row._sourceDescription || row.notes || '', newProd?.name, null, isOutgoing);
            const finalCondition = newProd?.default_condition || d.condition;
            onUpdate(row._key, {
              product_id: newId,
              auto_matched: false,
              condition: finalCondition,
              intended_action: isOutgoing ? 'stock' : d.intended_action,
            });
          }}
          disabled={!row.category_id}
          className="col-span-5 bg-white border border-gray-200 rounded-lg px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-gray-50 disabled:text-gray-400"
        >
          <option value="">{row.category_id ? t('review.productPlaceholder') : t('review.pickCategoryFirst')}</option>
          {productsForCategory.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
          {row.category_id && <option value="__create__">+ Krijo produkt te ri</option>}
        </select>
        <input
          type="number"
          min={0}
          inputMode="numeric"
          value={row.quantity || ''}
          onChange={(e) => onUpdate(row._key, { quantity: parseInt(e.target.value) || 0 })}
          className="col-span-2 bg-white border border-gray-200 rounded-lg px-2 py-2 text-xs text-right font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500"
          placeholder={t('common.quantity')}
        />
      </div>

      {createMode === 'cat' && (
        <div className="flex items-center gap-1.5 bg-sky-50 border border-sky-200 rounded-lg p-2">
          <input
            autoFocus
            type="text"
            value={createCatName}
            onChange={(e) => setCreateCatName(e.target.value)}
            placeholder="Emri i kategorise se re"
            className="flex-1 bg-white border border-sky-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500"
            onKeyDown={(e) => { if (e.key === 'Enter') submitCreateCategory(); if (e.key === 'Escape') setCreateMode(null); }}
          />
          <button
            type="button"
            onClick={submitCreateCategory}
            disabled={creating || !createCatName.trim()}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700 disabled:opacity-50"
          >
            {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
            Ruaj
          </button>
          <button
            type="button"
            onClick={() => { setCreateMode(null); setCreateCatName(''); }}
            className="inline-flex items-center px-2 py-1.5 text-[11px] font-semibold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
          >{t('common.cancel')}</button>
        </div>
      )}

      {createMode === 'prod' && (
        <div className="flex items-center gap-1.5 bg-teal-50 border border-teal-200 rounded-lg p-2">
          <input
            autoFocus
            type="text"
            value={createProdName}
            onChange={(e) => setCreateProdName(e.target.value)}
            placeholder="Emri i produktit te ri"
            className="flex-1 bg-white border border-teal-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
            onKeyDown={(e) => { if (e.key === 'Enter') submitCreateProduct(); if (e.key === 'Escape') setCreateMode(null); }}
          />
          <button
            type="button"
            onClick={submitCreateProduct}
            disabled={creating || !createProdName.trim()}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50"
          >
            {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
            Ruaj
          </button>
          <button
            type="button"
            onClick={() => { setCreateMode(null); setCreateProdName(''); }}
            className="inline-flex items-center px-2 py-1.5 text-[11px] font-semibold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
          >{t('common.cancel')}</button>
        </div>
      )}

      {showStockBadge && (
        <div className="flex items-center gap-2 text-[11px]">
          {goingNegative ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-800 border border-amber-200">
              <AlertCircle className="w-3 h-3" />
              Ne stok: {availableStock} — shkon ne -{row.quantity - (availableStock ?? 0)}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <Package className="w-3 h-3" />
              Ne stok: {availableStock}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1 flex-wrap">
          {ACTION_OPTIONS.map((opt) => {
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
              onClick={() => {
                const actionForCondition: Record<string, 'stock' | 'sorting' | 'repair'> = {
                  good: 'stock', damaged: 'repair', sorting: 'sorting',
                  ready_a: 'sorting', ready_b: 'sorting', ready_c: 'sorting',
                };
                onUpdate(row._key, { condition: opt.value, intended_action: actionForCondition[opt.value] || 'stock' });
              }}
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
