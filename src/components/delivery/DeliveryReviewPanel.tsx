import { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Download,
  Loader2,
  MapPin,
  Package,
  Sparkles,
  Trash2,
  Truck,
  Undo2,
  Upload,
  User,
  Warehouse,
  X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { matchProduct } from '../../utils/productMatcher';

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
}

interface NoteItem {
  id: string;
  delivery_note_id: string;
  category_id: string | null;
  product_id: string | null;
  quantity: number;
  condition: string;
  notes: string | null;
  auto_matched?: boolean;
  match_score?: number;
  match_type?: 'sku' | 'product_name' | 'category_name' | null;
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
  const [items, setItems] = useState<NoteItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<'approve' | 'complete' | 'reject' | null>(null);
  const [reason, setReason] = useState('');
  const [showRejectReason, setShowRejectReason] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scannedUrl, setScannedUrl] = useState<string | null>(note.scanned_photo_url);
  const [uploading, setUploading] = useState(false);

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
      supabase.from('delivery_note_items').select('*').eq('delivery_note_id', note.id),
      supabase.from('product_categories').select('id, name').eq('company_id', note.company_id).order('name'),
      supabase.from('acc_products').select('id, name, sku, category_id').eq('company_id', note.company_id),
    ]);
    const cats = (catsRes.data as Category[]) ?? [];
    const prods = (prodsRes.data as Product[]) ?? [];
    const rawItems = (itemsRes.data as NoteItem[]) ?? [];

    const enriched = rawItems.map((it) => {
      if (it.category_id || it.product_id) return it;
      const m = matchProduct(it.notes || '', prods, cats);
      return {
        ...it,
        product_id: m.productId,
        category_id: m.categoryId,
        auto_matched: !!(m.productId || m.categoryId),
        match_score: m.score,
        match_type: m.matchedOn,
      };
    });

    setCategories(cats);
    setProducts(prods);
    setItems(enriched);
    setLoading(false);
  }

  function updateItem(id: string, patch: Partial<NoteItem>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  async function persistItems() {
    for (const it of items) {
      await supabase
        .from('delivery_note_items')
        .update({
          product_id: it.product_id,
          category_id: it.category_id,
          quantity: it.quantity,
          condition: it.condition,
          notes: it.notes,
        })
        .eq('id', it.id);
    }
  }

  async function handleApprove() {
    setSaving('approve');
    setError(null);
    try {
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
          await supabase.from('notifications').insert(
            depotUsers.map((u) => ({
              user_id: u.id,
              title: 'Dergese per stok',
              message: `${note.note_number} u miratua. Verifikoni dhe regjistrojeni ne stok.`,
              type: 'system',
              reference_id: note.id,
            })) as any,
          );
        }
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
      const missing = items.filter((i) => !i.category_id || !i.quantity || i.quantity <= 0);
      if (missing.length > 0) {
        throw new Error('Caktoni kategorine dhe sasine per cdo artikull para regjistrimit ne stok.');
      }
      await persistItems();

      const depotId = note.assigned_depot_id || profile?.depot_id;
      if (!depotId) throw new Error('Depoja nuk eshte caktuar per kete dergese.');

      const productIds = items.map((i) => i.product_id).filter((x): x is string => !!x);
      const validProductIds = new Set<string>();
      if (productIds.length > 0) {
        const { data: cps } = await supabase
          .from('category_products')
          .select('id')
          .in('id', productIds);
        (cps ?? []).forEach((p) => validProductIds.add(p.id));
      }

      const isPickup = note.type === 'pickup';
      for (const it of items) {
        const signedQty = isPickup ? -Math.abs(it.quantity) : Math.abs(it.quantity);
        const stockProductId = it.product_id && validProductIds.has(it.product_id) ? it.product_id : null;

        let lookup = supabase
          .from('stock')
          .select('id, quantity')
          .eq('company_id', note.company_id)
          .eq('depot_id', depotId)
          .eq('category_id', it.category_id)
          .eq('condition', it.condition);
        lookup = stockProductId ? lookup.eq('category_product_id', stockProductId) : lookup.is('category_product_id', null);
        const { data: existing } = await lookup.maybeSingle();

        if (existing) {
          await supabase
            .from('stock')
            .update({ quantity: Math.max(0, (existing.quantity || 0) + signedQty) })
            .eq('id', existing.id);
        } else if (!isPickup) {
          await supabase.from('stock').insert({
            company_id: note.company_id,
            depot_id: depotId,
            category_id: it.category_id,
            category_product_id: stockProductId,
            condition: it.condition,
            quantity: signedQty,
          });
        }

        await supabase.from('stock_movements').insert({
          company_id: note.company_id,
          depot_id: depotId,
          category_id: it.category_id,
          category_product_id: stockProductId,
          movement_type: isPickup ? 'exit' : 'entry',
          quantity: Math.abs(it.quantity),
          condition_after: it.condition,
          notes: `${note.note_number}${note.partner_name ? ' / ' + note.partner_name : ''}${it.notes ? ' / ' + it.notes : ''}`,
          performed_by: profile!.id,
        });

        if (it.product_id) {
          const { data: prod } = await supabase
            .from('acc_products')
            .select('current_stock')
            .eq('id', it.product_id)
            .maybeSingle();
          const newStock = Math.max(0, Number(prod?.current_stock || 0) + signedQty);
          await supabase
            .from('acc_products')
            .update({ current_stock: newStock, updated_at: new Date().toISOString() })
            .eq('id', it.product_id);
        }
      }

      const { error: upErr } = await supabase
        .from('delivery_notes')
        .update({
          status: 'completed',
          stock_confirmed_by: profile!.id,
          stock_confirmed_at: new Date().toISOString(),
          stock_posted: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', note.id);
      if (upErr) throw upErr;

      const receivers = [note.assigned_driver_id].filter(Boolean) as string[];
      if (receivers.length > 0) {
        await supabase.from('notifications').insert(
          receivers.map((uid) => ({
            user_id: uid,
            title: 'Dergesa u regjistrua ne stok',
            message: `${note.note_number} u mbyll dhe u regjistrua ne stok.`,
            type: 'system',
            reference_id: note.id,
          })) as any,
        );
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
        await supabase.from('notifications').insert({
          user_id: note.assigned_driver_id,
          title: 'Dergesa u kthye',
          message: `${note.note_number}: ${reason.trim()}`,
          type: 'system',
          reference_id: note.id,
        });
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

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl lg:rounded-2xl w-full lg:max-w-3xl max-h-[94vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between z-10">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-gray-900">{note.note_number}</h3>
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
              ) : (
                <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-xs text-gray-400">
                  Nuk ka dokument te skanuar
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
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Artikujt {role === 'depot_worker' && '(caktoni kategorine dhe sasine)'}
            </p>
            {loading ? (
              <div className="text-center py-6"><Loader2 className="w-5 h-5 animate-spin text-teal-600 inline" /></div>
            ) : items.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 p-5 text-center text-xs text-gray-400">
                AI nuk gjeti artikuj. Mund t'i shtoni manualisht gjate verifikimit ne stok.
              </div>
            ) : (
              <div className="space-y-2">
                {items.map((it) => (
                  <div key={it.id} className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs text-gray-600 flex-1 break-words">{it.notes}</p>
                      {it.auto_matched && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700 flex-shrink-0">
                          <Sparkles className="w-2.5 h-2.5" />
                          {it.match_type === 'sku' ? 'SKU' : it.match_type === 'product_name' ? 'Produkt' : 'Kategori'}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-6 gap-2">
                      <select
                        value={it.product_id || ''}
                        onChange={(e) => {
                          const prod = products.find((p) => p.id === e.target.value);
                          updateItem(it.id, {
                            product_id: e.target.value || null,
                            category_id: prod?.category_id ?? it.category_id,
                            auto_matched: false,
                          });
                        }}
                        className="col-span-3 bg-white border border-gray-200 rounded-lg px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                      >
                        <option value="">-- Produkti --</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ''}</option>
                        ))}
                      </select>
                      <select
                        value={it.category_id || ''}
                        onChange={(e) => updateItem(it.id, { category_id: e.target.value || null, auto_matched: false })}
                        className="col-span-2 bg-white border border-gray-200 rounded-lg px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                      >
                        <option value="">-- Kategoria --</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={0}
                        value={it.quantity}
                        onChange={(e) => updateItem(it.id, { quantity: parseInt(e.target.value) || 0 })}
                        className="bg-white border border-gray-200 rounded-lg px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                        placeholder="Sasia"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      {['good', 'damaged', 'repaired'].map((c) => (
                        <button
                          key={c}
                          onClick={() => updateItem(it.id, { condition: c })}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border ${
                            it.condition === c
                              ? 'bg-teal-600 text-white border-teal-600'
                              : 'bg-white text-gray-600 border-gray-200'
                          }`}
                        >
                          {c === 'good' ? 'I mire' : c === 'damaged' ? 'Me defekt' : 'I riparuar'}
                        </button>
                      ))}
                    </div>
                  </div>
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

        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-5 py-3 flex items-center justify-end gap-2">
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
          {role === 'company_admin' && !showRejectReason && (
            <button
              onClick={handleApprove}
              disabled={!!saving}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700 disabled:opacity-50"
            >
              {saving === 'approve' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Warehouse className="w-4 h-4" />}
              Dergo te depo per stok
            </button>
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
