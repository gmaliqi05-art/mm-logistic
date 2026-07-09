import { useEffect, useMemo, useState } from 'react';
import { X, Loader2, Plus, Trash2, ArrowDownLeft, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { qualityClassFor } from '../../utils/epalClassification';
import type { StockCondition } from '../../types';

interface Props {
  companyId: string;
  depotId: string;
  createdById: string;
  onClose: () => void;
  onCreated: () => void;
}

interface Contact { id: string; name: string }
interface Product { id: string; name: string; category_id: string | null }
interface SourceNote { id: string; note_number: string; document_number: string | null; partner_name: string | null; partner_id: string | null; created_at: string }
interface Line { product_id: string; quantity: string; condition: 'good' | 'damaged' }

const emptyLine: Line = { product_id: '', quantity: '', condition: 'damaged' };

function ts(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/**
 * Register a return / reclamation from a partner. It is created as an incoming
 * pickup linked to the original delivery and immediately confirmed, so the
 * existing stock trigger adds the returned pallets to depot stock and the
 * pallet-account trigger reduces what the partner holds.
 */
export default function ReturnModal({ companyId, depotId, createdById, onClose, onCreated }: Props) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sourceNotes, setSourceNotes] = useState<SourceNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [partnerId, setPartnerId] = useState('');
  const [partnerName, setPartnerName] = useState('');
  const [originalNoteId, setOriginalNoteId] = useState('');
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState<Line[]>([{ ...emptyLine }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [cRes, pRes, nRes] = await Promise.all([
        supabase.from('acc_contacts').select('id, name').eq('company_id', companyId).eq('is_active', true).order('name'),
        supabase.from('category_products').select('id, name, category_id').eq('company_id', companyId).eq('is_active', true).order('name'),
        supabase.from('delivery_notes').select('id, note_number, document_number, partner_name, partner_id, created_at').eq('company_id', companyId).eq('type', 'delivery').eq('is_return', false).order('created_at', { ascending: false }).limit(100),
      ]);
      if (cancelled) return;
      setContacts((cRes.data as Contact[]) ?? []);
      setProducts((pRes.data as Product[]) ?? []);
      setSourceNotes((nRes.data as SourceNote[]) ?? []);
      setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, [companyId]);

  const productById = useMemo(() => {
    const m = new Map<string, Product>();
    for (const p of products) m.set(p.id, p);
    return m;
  }, [products]);

  async function pickOriginal(noteId: string) {
    setOriginalNoteId(noteId);
    const src = sourceNotes.find((n) => n.id === noteId);
    if (src) {
      setPartnerId(src.partner_id ?? '');
      setPartnerName(src.partner_name ?? '');
    }
    if (!noteId) return;
    const { data } = await supabase
      .from('delivery_note_items')
      .select('category_product_id, quantity, condition')
      .eq('delivery_note_id', noteId);
    const prefill: Line[] = ((data ?? []) as { category_product_id: string | null; quantity: number; condition: string }[])
      .filter((i) => i.category_product_id)
      .map((i) => ({ product_id: i.category_product_id as string, quantity: String(i.quantity ?? ''), condition: i.condition === 'good' ? 'good' : 'damaged' }));
    if (prefill.length) setLines(prefill);
  }

  function updateLine(idx: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  async function submit() {
    setError(null);
    const rows = lines
      .map((l) => ({ ...l, qty: parseInt(l.quantity || '0', 10) || 0 }))
      .filter((l) => l.product_id && l.qty > 0);
    if (!partnerName && !partnerId) { setError('Zgjidhni kompaninë që po kthen mallin.'); return; }
    if (rows.length === 0) { setError('Shtoni të paktën një produkt me sasi.'); return; }

    setSaving(true);
    try {
      const { data: note, error: nErr } = await supabase
        .from('delivery_notes')
        .insert({
          company_id: companyId,
          created_by: createdById,
          assigned_depot_id: depotId,
          note_number: `KTHIM-${ts()}`,
          type: 'pickup',
          status: 'sent',
          is_return: true,
          return_of_delivery_note_id: originalNoteId || null,
          partner_id: partnerId || null,
          partner_name: partnerName || '',
          notes: reason || 'Kthim / reklamacion',
          pallet_type: 'EPAL',
        })
        .select('id')
        .single();
      if (nErr) throw nErr;

      const itemsPayload = rows.map((l) => {
        const prod = productById.get(l.product_id);
        return {
          delivery_note_id: note.id,
          category_id: prod?.category_id ?? null,
          category_product_id: l.product_id,
          quantity: l.qty,
          condition: l.condition,
          intended_action: 'stock' as const,
          quality_class: qualityClassFor(l.condition as StockCondition),
        };
      });
      const { error: iErr } = await supabase.from('delivery_note_items').insert(itemsPayload);
      if (iErr) throw iErr;

      // Confirm so the returned pallets are posted to depot stock now.
      const { error: cErr } = await supabase
        .from('delivery_notes')
        .update({ status: 'confirmed', updated_at: new Date().toISOString() })
        .eq('id', note.id);
      if (cErr) throw cErr;

      setSuccess(true);
      setTimeout(() => { onCreated(); onClose(); }, 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-lg max-h-[95dvh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
              <ArrowDownLeft className="w-4 h-4" />
            </span>
            <h2 className="text-base font-bold text-slate-900">Krijo Kthim / Reklamacion</h2>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        {loading ? (
          <div className="p-10 flex justify-center"><Loader2 className="w-5 h-5 text-slate-400 animate-spin" /></div>
        ) : (
          <div className="px-4 py-3 space-y-3 overflow-y-auto flex-1">
            <label className="block">
              <span className="text-[11px] uppercase tracking-wide text-slate-500">Fletëdërgesa origjinale (opsionale)</span>
              <select
                value={originalNoteId}
                onChange={(e) => void pickOriginal(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="">Zgjidhni fletëdërgesën…</option>
                {sourceNotes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.document_number || n.note_number} · {n.partner_name || '—'} · {new Date(n.created_at).toLocaleDateString()}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-[11px] uppercase tracking-wide text-slate-500">Kompania që kthen</span>
              <select
                value={partnerId}
                onChange={(e) => { setPartnerId(e.target.value); setPartnerName(contacts.find((c) => c.id === e.target.value)?.name ?? ''); }}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="">{partnerName || 'Zgjidhni kompaninë…'}</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>

            <div className="space-y-2">
              <span className="text-[11px] uppercase tracking-wide text-slate-500">Produktet e kthyera</span>
              {lines.map((l, idx) => (
                <div key={idx} className="flex items-center gap-1.5">
                  <select
                    value={l.product_id}
                    onChange={(e) => updateLine(idx, { product_id: e.target.value })}
                    className="flex-1 min-w-0 px-2 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="">Produkti…</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <input
                    type="number" min={0} inputMode="numeric" placeholder="0"
                    value={l.quantity}
                    onChange={(e) => updateLine(idx, { quantity: e.target.value })}
                    className="w-16 px-2 py-2 rounded-lg border border-slate-300 text-sm text-center focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <select
                    value={l.condition}
                    onChange={(e) => updateLine(idx, { condition: e.target.value as 'good' | 'damaged' })}
                    className="w-24 px-1 py-2 rounded-lg border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="damaged">I dëmtuar</option>
                    <option value="good">I mirë</option>
                  </select>
                  <button
                    onClick={() => setLines((prev) => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)}
                    className="p-1.5 text-slate-400 hover:text-rose-500 flex-shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => setLines((prev) => [...prev, { ...emptyLine }])}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border-2 border-dashed border-slate-300 text-slate-500 text-sm hover:border-amber-400 hover:text-amber-600"
              >
                <Plus className="w-4 h-4" /> Shto produkt
              </button>
            </div>

            <label className="block">
              <span className="text-[11px] uppercase tracking-wide text-slate-500">Arsyeja (opsionale)</span>
              <input
                type="text" value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="p.sh. defekt, klasë tjetër, dërguar gabimisht"
                className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </label>

            {error && (
              <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 px-3 py-2 rounded-lg flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {error}
              </div>
            )}
            {success && (
              <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-lg flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> Kthimi u regjistrua dhe u shtua në stok
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg text-slate-700 hover:bg-slate-100">Anulo</button>
          <button
            onClick={submit}
            disabled={saving || loading}
            className="px-4 py-2 text-sm rounded-lg bg-amber-600 text-white font-medium hover:bg-amber-700 disabled:opacity-60 inline-flex items-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Regjistro kthimin
          </button>
        </div>
      </div>
    </div>
  );
}
