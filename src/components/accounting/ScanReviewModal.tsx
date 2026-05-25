import { useEffect, useMemo, useState } from 'react';
import {
  X,
  Building2,
  BadgeCheck,
  Save,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  ShoppingCart,
  Receipt,
  Briefcase,
  FileText,
  Sparkles,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';

type DocKind = 'purchase' | 'expense' | 'investment' | 'sale';
type RoutingDecision = 'auto_saved' | 'pending_confirmation' | 'new_company_required';

interface Candidate {
  id: string;
  name: string;
  score: number;
  vat_number: string | null;
  contact_type: string;
}

interface ScanRow {
  id: string;
  company_id: string;
  status: string;
  detected_type: string | null;
  file_name: string;
  extracted_json: Record<string, unknown> | null;
  routing_decision: RoutingDecision | null;
  match_confidence: number | null;
  suggested_contact_name: string | null;
  suggested_contact_vat: string | null;
  suggested_contact_tax: string | null;
  suggested_contact_email: string | null;
  suggested_contact_phone: string | null;
  suggested_contact_address: string | null;
  suggested_contact_city: string | null;
  suggested_contact_postal_code: string | null;
  suggested_contact_country: string | null;
  suggested_contact_iban: string | null;
  suggested_contact_bic: string | null;
}

interface Props {
  scan: ScanRow;
  onClose: () => void;
  onSaved: () => void;
}

const KIND_META: Record<DocKind, { label: string; icon: typeof ShoppingCart; color: string }> = {
  purchase: { label: 'Blerje', icon: ShoppingCart, color: 'text-teal-700 bg-teal-50 border-teal-200' },
  expense: { label: 'Shpenzim', icon: Receipt, color: 'text-amber-700 bg-amber-50 border-amber-200' },
  investment: { label: 'Investim', icon: Briefcase, color: 'text-slate-700 bg-slate-50 border-slate-200' },
  sale: { label: 'Shitje', icon: FileText, color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
};

function deriveKind(scan: ScanRow): DocKind {
  const t = (scan.detected_type || (scan.extracted_json as { document_nature_guess?: string })?.document_nature_guess || 'expense') as string;
  if (t === 'purchase' || t === 'expense' || t === 'investment' || t === 'sale') return t;
  return 'expense';
}

export default function ScanReviewModal({ scan, onClose, onSaved }: Props) {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const extracted = (scan.extracted_json ?? {}) as Record<string, unknown>;
  const routing = (extracted._routing ?? {}) as { candidates?: Candidate[]; matched_contact_id?: string | null; match_reason?: string };
  const initialKind = deriveKind(scan);
  const [kind, setKind] = useState<DocKind>(initialKind);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(routing.matched_contact_id ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const counterpartyName = (extracted.supplier_name as string) || (extracted.customer_name as string) || '';
  const initialForm = useMemo(() => ({
    name: scan.suggested_contact_name || counterpartyName,
    vat_number: scan.suggested_contact_vat || (extracted.supplier_vat as string) || '',
    tax_number: scan.suggested_contact_tax || '',
    email: scan.suggested_contact_email || '',
    phone: scan.suggested_contact_phone || '',
    address: scan.suggested_contact_address || '',
    city: scan.suggested_contact_city || '',
    postal_code: scan.suggested_contact_postal_code || '',
    country: scan.suggested_contact_country || '',
    iban: scan.suggested_contact_iban || (extracted.supplier_iban as string) || '',
    bic: scan.suggested_contact_bic || '',
  }), [scan, counterpartyName, extracted]);
  const [form, setForm] = useState(initialForm);

  useEffect(() => { setForm(initialForm); }, [initialForm]);

  const decision = scan.routing_decision ?? 'pending_confirmation';
  const needsNewCompany = decision === 'new_company_required' && !selectedContactId;

  const total = typeof extracted.total === 'number' ? (extracted.total as number) : 0;
  const subtotal = typeof extracted.subtotal === 'number' ? (extracted.subtotal as number) : 0;
  const vatAmount = typeof extracted.vat_amount === 'number' ? (extracted.vat_amount as number) : 0;
  const invoiceNumber = (extracted.invoice_number as string) || '';
  const invoiceDate = (extracted.invoice_date as string) || new Date().toISOString().slice(0, 10);
  const dueDate = (extracted.due_date as string) || '';
  const currency = (extracted.currency as string) || 'EUR';

  async function resolveContactId(): Promise<string | null> {
    if (selectedContactId) return selectedContactId;
    if (!form.name.trim()) {
      setError(t('accounting.contacts.companyNameRequired') || 'Emri i kompanise eshte i detyrueshem');
      return null;
    }
    const contactType = kind === 'sale' ? 'customer' : 'supplier';
    const { data: existing } = await supabase
      .from('acc_contacts')
      .select('id')
      .eq('company_id', scan.company_id)
      .eq('name', form.name.trim())
      .maybeSingle();
    if (existing?.id) return existing.id as string;

    const { data: created, error: insErr } = await supabase
      .from('acc_contacts')
      .insert({
        company_id: scan.company_id,
        name: form.name.trim(),
        contact_type: contactType,
        vat_number: form.vat_number.trim(),
        tax_number: form.tax_number.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        city: form.city.trim(),
        postal_code: form.postal_code.trim(),
        country: form.country.trim(),
        iban: form.iban.trim(),
        bic: form.bic.trim(),
        source_document_id: scan.id,
        auto_created_at: new Date().toISOString(),
        is_active: true,
      })
      .select('id')
      .maybeSingle();
    if (insErr) {
      setError(insErr.message);
      return null;
    }
    return (created?.id as string) ?? null;
  }

  async function handleConfirm() {
    if (!profile?.company_id) return;
    setSaving(true);
    setError(null);
    try {
      const contactId = await resolveContactId();
      if (!contactId) { setSaving(false); return; }

      let linkedType = kind;
      let linkedId: string | null = null;

      if (kind === 'purchase') {
        const { data, error: e } = await supabase
          .from('acc_purchases')
          .insert({
            company_id: scan.company_id,
            contact_id: contactId,
            purchase_number: invoiceNumber,
            purchase_date: invoiceDate,
            due_date: dueDate || null,
            subtotal,
            vat_amount: vatAmount,
            total,
            currency,
            status: 'received',
            notes: `Nga skanimi: ${scan.file_name}`,
          })
          .select('id')
          .maybeSingle();
        if (e) throw e;
        linkedId = data?.id as string;
      } else if (kind === 'sale') {
        const { data, error: e } = await supabase
          .from('acc_invoices')
          .insert({
            company_id: scan.company_id,
            contact_id: contactId,
            invoice_number: invoiceNumber,
            invoice_date: invoiceDate,
            due_date: dueDate || null,
            subtotal,
            vat_amount: vatAmount,
            total,
            currency,
            status: 'sent',
            notes: `Nga skanimi: ${scan.file_name}`,
          })
          .select('id')
          .maybeSingle();
        if (e) throw e;
        linkedId = data?.id as string;
      } else if (kind === 'investment') {
        const { data, error: e } = await supabase
          .from('acc_fixed_assets')
          .insert({
            company_id: scan.company_id,
            name: (extracted.notes as string) || invoiceNumber || scan.file_name,
            acquisition_date: invoiceDate,
            acquisition_cost: total,
            status: 'active',
          })
          .select('id')
          .maybeSingle();
        if (e) throw e;
        linkedId = data?.id as string;
        linkedType = 'investment';
      } else {
        const { data, error: e } = await supabase
          .from('acc_transactions')
          .insert({
            company_id: scan.company_id,
            contact_id: contactId,
            transaction_date: invoiceDate,
            type: 'expense',
            amount: total,
            currency,
            description: invoiceNumber ? `Shpenzim #${invoiceNumber}` : `Shpenzim nga ${form.name}`,
          })
          .select('id')
          .maybeSingle();
        if (e) throw e;
        linkedId = data?.id as string;
      }

      await supabase
        .from('acc_scanned_documents')
        .update({
          status: 'saved',
          chosen_type: kind,
          linked_entity_type: linkedType,
          linked_entity_id: linkedId,
          routing_decision: 'auto_saved',
          updated_at: new Date().toISOString(),
        })
        .eq('id', scan.id);

      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ndodhi nje gabim');
    } finally {
      setSaving(false);
    }
  }

  const KindIcon = KIND_META[kind].icon;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col">
        <div className="flex items-start justify-between p-5 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{t('accounting.scanReview.confirmDocument')}</h2>
            <p className="text-sm text-slate-500 mt-0.5 truncate max-w-md">{scan.file_name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Lloji i dokumentit</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(Object.keys(KIND_META) as DocKind[]).map((k) => {
                const meta = KIND_META[k];
                const Icon = meta.icon;
                const active = k === kind;
                return (
                  <button
                    key={k}
                    onClick={() => setKind(k)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${active ? `${meta.color} ring-2 ring-offset-1 ring-teal-400` : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                  >
                    <Icon className="w-4 h-4" />
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <Stat label="Numri" value={invoiceNumber || '-'} />
            <Stat label="Data" value={invoiceDate || '-'} />
            <Stat label="Totali" value={total > 0 ? `${total.toFixed(2)} ${currency}` : '-'} strong />
            <Stat label="TVSH" value={vatAmount > 0 ? `${vatAmount.toFixed(2)} ${currency}` : '-'} />
          </div>

          {routing.candidates && routing.candidates.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Kontakte te ngjashem</p>
              <div className="space-y-2">
                {routing.candidates.map((c) => {
                  const active = selectedContactId === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelectedContactId(active ? null : c.id)}
                      className={`w-full flex items-center justify-between gap-3 p-3 rounded-xl border text-left transition-all ${active ? 'bg-teal-50 border-teal-400 ring-2 ring-teal-200' : 'bg-white border-slate-200 hover:border-slate-300'}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${active ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                          {active ? <CheckCircle2 className="w-5 h-5" /> : <Building2 className="w-5 h-5" />}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 truncate">{c.name}</p>
                          <p className="text-xs text-slate-500 truncate">{c.vat_number || c.contact_type}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 flex-shrink-0">
                        <BadgeCheck className="w-3.5 h-3.5" />
                        {Math.round(c.score * 100)}%
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {!selectedContactId && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-teal-600" />
                <p className="font-semibold text-slate-800 text-sm">
                  {needsNewCompany ? 'Kompani e re' : 'Krijo kompani te re nga ky dokument'}
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Emri i kompanise *" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} />
                <Field label="Nr. TVSH" value={form.vat_number} onChange={(v) => setForm((f) => ({ ...f, vat_number: v }))} />
                <Field label="Nr. Tatimor" value={form.tax_number} onChange={(v) => setForm((f) => ({ ...f, tax_number: v }))} />
                <Field label="Email" value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} />
                <Field label="Telefon" value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} />
                <Field label="IBAN" value={form.iban} onChange={(v) => setForm((f) => ({ ...f, iban: v }))} />
                <Field label="Adresa" value={form.address} onChange={(v) => setForm((f) => ({ ...f, address: v }))} className="sm:col-span-2" />
                <Field label="Qyteti" value={form.city} onChange={(v) => setForm((f) => ({ ...f, city: v }))} />
                <Field label="Kodi postar" value={form.postal_code} onChange={(v) => setForm((f) => ({ ...f, postal_code: v }))} />
              </div>
            </div>
          )}

          {routing.match_reason && (
            <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-3">
              <span className="font-semibold text-slate-700">Arsyeja: </span>{routing.match_reason}
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}
        </div>

        <div className="p-5 border-t border-slate-200 flex items-center justify-between gap-3 bg-slate-50">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <KindIcon className="w-4 h-4" />
            Do te ruhet si <span className="font-semibold text-slate-700">{KIND_META[kind].label}</span>
          </div>
          <button
            onClick={handleConfirm}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-teal-600 text-white font-semibold hover:bg-teal-700 disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {selectedContactId ? 'Ruaj dokumentin' : 'Ruaj kompanine dhe dokumentin'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-2.5">
      <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{label}</p>
      <p className={`mt-0.5 truncate ${strong ? 'text-slate-900 font-bold' : 'text-slate-700 font-medium'}`}>{value}</p>
    </div>
  );
}

function Field({ label, value, onChange, className = '' }: { label: string; value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
      />
    </label>
  );
}
