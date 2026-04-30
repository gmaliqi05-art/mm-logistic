import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Plus, Trash2, Save, Send, Download, Printer, Loader2, CheckCircle2,
  AlertCircle, Sparkles, Copy, ShieldCheck, Languages, Palette, Building2,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import InvoiceTemplate, { type InvoicePreviewData } from '../../components/accounting/InvoiceTemplate';
import {
  buildVatBreakdown, computeVatRegime, formatInvoiceNumber, normalizeVat,
  UN_ECE_UNITS, VAT_CATEGORIES, validateVatFormat,
  type EuCountry, type EuVatRate,
} from '../../utils/euCompliance';

type Layout = 'modern' | 'classic' | 'minimal';
type Lang = 'en' | 'de' | 'fr' | 'sq';

interface Item {
  id: string;
  description: string;
  product_code: string;
  quantity: number;
  unit_code: string;
  unit_price: number;
  vat_rate: number;
  vat_category: string;
  discount_amount: number;
}

interface Company {
  id: string;
  name: string;
  address?: string | null;
  postal_code?: string | null;
  city?: string | null;
  country?: string | null;
  vat_number?: string | null;
  tax_number?: string | null;
  email?: string | null;
  phone?: string | null;
  logo_url?: string | null;
}

interface Contact {
  id: string;
  name: string;
  address?: string | null;
  postal_code?: string | null;
  city?: string | null;
  country?: string | null;
  vat_number?: string | null;
  email?: string | null;
  contact_type?: string | null;
}

interface BankAccount {
  id: string;
  name: string;
  iban: string;
  bic: string;
  bank_name: string;
  is_default: boolean;
}

const CURRENCIES = ['EUR', 'CHF', 'USD', 'GBP', 'PLN', 'SEK', 'DKK', 'CZK', 'HUF', 'RON', 'BGN'];

function newItem(): Item {
  return {
    id: crypto.randomUUID(),
    description: '',
    product_code: '',
    quantity: 1,
    unit_code: 'H87',
    unit_price: 0,
    vat_rate: 19,
    vat_category: 'S',
    discount_amount: 0,
  };
}

export default function InvoiceBuilder() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { id: invoiceId } = useParams<{ id: string }>();
  const isEdit = Boolean(invoiceId && invoiceId !== 'new');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viesStatus, setViesStatus] = useState<'idle' | 'loading' | 'valid' | 'invalid'>('idle');

  const [company, setCompany] = useState<Company | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [countries, setCountries] = useState<EuCountry[]>([]);
  const [vatRates, setVatRates] = useState<EuVatRate[]>([]);

  const [invoiceType, setInvoiceType] = useState<'invoice' | 'credit_note' | 'proforma'>('invoice');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [language, setLanguage] = useState<Lang>('en');
  const [contactId, setContactId] = useState<string>('');
  const [bankId, setBankId] = useState<string>('');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentTermsDays, setPaymentTermsDays] = useState(14);
  const [notes, setNotes] = useState('');
  const [buyerVatOverride, setBuyerVatOverride] = useState('');
  const [items, setItems] = useState<Item[]>([newItem()]);

  const [layout, setLayout] = useState<Layout>('modern');
  const [primaryColor, setPrimaryColor] = useState('#0f766e');

  const dirtyRef = useRef(false);
  const invoiceDbIdRef = useRef<string | null>(isEdit ? invoiceId ?? null : null);

  useEffect(() => { bootstrap(); }, [profile?.company_id]);

  async function bootstrap() {
    if (!profile?.company_id) return;
    setLoading(true);
    const [{ data: co }, { data: cs }, { data: bs }, { data: countryRows }, { data: rates }] = await Promise.all([
      supabase.from('companies').select('*').eq('id', profile.company_id).maybeSingle(),
      supabase.from('acc_contacts').select('id, name, address, postal_code, city, country, vat_number, email, contact_type')
        .eq('company_id', profile.company_id).eq('is_active', true).order('name'),
      supabase.from('acc_bank_accounts').select('id, name, iban, bic, bank_name, is_default')
        .eq('company_id', profile.company_id).eq('is_active', true),
      supabase.from('eu_countries').select('*').order('name'),
      supabase.from('eu_vat_rates').select('*').order('rate', { ascending: false }),
    ]);

    setCompany((co as Company) ?? null);
    setContacts((cs as Contact[]) ?? []);
    setBanks((bs as BankAccount[]) ?? []);
    setCountries((countryRows as EuCountry[]) ?? []);
    setVatRates((rates as EuVatRate[]) ?? []);

    const defaultBank = ((bs as BankAccount[]) ?? []).find((b) => b.is_default) ?? ((bs as BankAccount[]) ?? [])[0];
    if (defaultBank) setBankId(defaultBank.id);

    if (isEdit && invoiceId) {
      await loadExisting(invoiceId);
    } else {
      await generateNextNumber(profile.company_id, 'invoice');
    }
    setLoading(false);
  }

  async function loadExisting(id: string) {
    const { data: inv } = await supabase.from('acc_invoices').select('*').eq('id', id).maybeSingle();
    const { data: its } = await supabase.from('acc_invoice_items').select('*').eq('invoice_id', id).order('created_at');
    if (inv) {
      type Inv = { invoice_type: string; invoice_number: string; invoice_date: string; due_date: string; delivery_date: string | null;
        currency: string; language_code: string; contact_id: string | null; bank_account_id: string | null;
        payment_reference: string; payment_terms_days: number; notes: string; buyer_vat_number: string | null; };
      const i = inv as unknown as Inv;
      setInvoiceType((i.invoice_type as 'invoice' | 'credit_note' | 'proforma') ?? 'invoice');
      setInvoiceNumber(i.invoice_number ?? '');
      setInvoiceDate(i.invoice_date ?? new Date().toISOString().slice(0, 10));
      setDueDate(i.due_date ?? '');
      setDeliveryDate(i.delivery_date ?? '');
      setCurrency(i.currency ?? 'EUR');
      setLanguage(((i.language_code ?? 'en') as Lang));
      setContactId(i.contact_id ?? '');
      setBankId(i.bank_account_id ?? '');
      setPaymentReference(i.payment_reference ?? '');
      setPaymentTermsDays(i.payment_terms_days ?? 14);
      setNotes(i.notes ?? '');
      setBuyerVatOverride(i.buyer_vat_number ?? '');
    }
    if (its && its.length) {
      type It = { id: string; description: string; product_code: string; quantity: number;
        unit_code: string; unit_price: number; vat_rate: number; vat_category: string; discount_amount: number; };
      setItems((its as unknown as It[]).map((r) => ({
        id: r.id,
        description: r.description ?? '',
        product_code: r.product_code ?? '',
        quantity: Number(r.quantity ?? 1),
        unit_code: r.unit_code ?? 'H87',
        unit_price: Number(r.unit_price ?? 0),
        vat_rate: Number(r.vat_rate ?? 0),
        vat_category: r.vat_category ?? 'S',
        discount_amount: Number(r.discount_amount ?? 0),
      })));
    }
  }

  async function generateNextNumber(companyId: string, docType: string) {
    const year = new Date().getFullYear();
    const { data: seq } = await supabase
      .from('acc_invoice_sequences')
      .select('*')
      .eq('company_id', companyId)
      .eq('doc_type', docType)
      .eq('year', year)
      .maybeSingle();
    if (seq) {
      const s = seq as { prefix: string; format_mask: string; current_number: number };
      const next = (s.current_number ?? 0) + 1;
      setInvoiceNumber(formatInvoiceNumber(s.format_mask, s.prefix, year, next));
    } else {
      const prefix = docType === 'credit_note' ? 'CN-' : docType === 'proforma' ? 'PF-' : 'INV-';
      setInvoiceNumber(formatInvoiceNumber('{prefix}{year}-{number:0000}', prefix, year, 1));
    }
  }

  const contact = useMemo(() => contacts.find((c) => c.id === contactId) ?? null, [contacts, contactId]);
  const bank = useMemo(() => banks.find((b) => b.id === bankId) ?? null, [banks, bankId]);

  const availableVatRates = useMemo(() => {
    const code = contact?.country ?? company?.country ?? '';
    const inList = vatRates.filter((r) => r.country_code === code);
    const uniq = [...new Set(inList.map((r) => Number(r.rate)))].sort((a, b) => b - a);
    return uniq.length ? uniq : [0, 7, 19];
  }, [vatRates, contact?.country, company?.country]);

  const buyerVat = buyerVatOverride || contact?.vat_number || '';
  const vatCheck = useMemo(() => validateVatFormat(buyerVat), [buyerVat]);

  const regime = useMemo(() => computeVatRegime({
    sellerCountry: company?.country ?? '',
    buyerCountry: contact?.country ?? vatCheck.country ?? '',
    buyerVatValid: vatCheck.valid,
    isGoods: true,
  }), [company?.country, contact?.country, vatCheck]);

  const totals = useMemo(() => {
    const processed = items.map((it) => {
      const gross = it.quantity * it.unit_price;
      const net = Math.max(0, gross - it.discount_amount);
      return { net, vat_rate: it.vat_rate, vat_category: it.vat_category };
    });
    const subtotal = processed.reduce((s, it) => s + it.net, 0);
    const discount = items.reduce((s, it) => s + (it.discount_amount || 0), 0);
    const breakdown = regime.regime === 'domestic' ? buildVatBreakdown(processed) : [];
    const vat_total = breakdown.reduce((s, b) => s + b.vat, 0);
    const total = subtotal + vat_total;
    return { subtotal, discount, vat_total, total, vat_breakdown: breakdown };
  }, [items, regime.regime]);

  const preview: InvoicePreviewData = useMemo(() => ({
    layout, primaryColor, logoUrl: company?.logo_url ?? null, language,
    seller: {
      name: company?.name ?? '',
      address: company?.address ?? '',
      postal_code: company?.postal_code ?? '',
      city: company?.city ?? '',
      country: company?.country ?? '',
      vat_number: company?.vat_number ?? '',
      tax_number: company?.tax_number ?? '',
      email: company?.email ?? '',
      phone: company?.phone ?? '',
      iban: bank?.iban ?? '',
      bic: bank?.bic ?? '',
      bank_name: bank?.bank_name ?? '',
    },
    buyer: {
      name: contact?.name ?? '',
      address: contact?.address ?? '',
      postal_code: contact?.postal_code ?? '',
      city: contact?.city ?? '',
      country: contact?.country ?? '',
      vat_number: buyerVat,
    },
    invoice: {
      number: invoiceNumber, date: invoiceDate, due_date: dueDate, delivery_date: deliveryDate,
      currency, notes, payment_reference: paymentReference, type: invoiceType,
      legal_text: regime.legalText[language] ?? regime.legalText.en ?? '',
    },
    items: items.map((it) => ({
      description: it.description,
      product_code: it.product_code,
      quantity: it.quantity,
      unit_code: it.unit_code,
      unit_price: it.unit_price,
      vat_rate: it.vat_rate,
      discount_amount: it.discount_amount,
      line_total: Math.max(0, it.quantity * it.unit_price - it.discount_amount),
    })),
    totals,
  }), [layout, primaryColor, company, bank, contact, buyerVat, invoiceNumber, invoiceDate, dueDate,
      deliveryDate, currency, notes, paymentReference, invoiceType, regime, language, items, totals]);

  function updateItem(id: string, patch: Partial<Item>) {
    dirtyRef.current = true;
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }
  function addItem() { dirtyRef.current = true; setItems((prev) => [...prev, newItem()]); }
  function duplicateItem(id: string) {
    dirtyRef.current = true;
    setItems((prev) => {
      const src = prev.find((i) => i.id === id);
      if (!src) return prev;
      return [...prev, { ...src, id: crypto.randomUUID() }];
    });
  }
  function removeItem(id: string) {
    dirtyRef.current = true;
    setItems((prev) => (prev.length === 1 ? prev : prev.filter((i) => i.id !== id)));
  }

  useEffect(() => { dirtyRef.current = true; }, [invoiceType, invoiceNumber, invoiceDate, dueDate, deliveryDate,
    currency, language, contactId, bankId, paymentReference, paymentTermsDays, notes, buyerVatOverride]);

  useEffect(() => {
    const t = setInterval(() => { if (dirtyRef.current && !saving) save(true); }, 15000);
    return () => clearInterval(t);
  });

  async function validateViesNow() {
    if (!buyerVat) { setViesStatus('idle'); return; }
    if (!vatCheck.valid) { setViesStatus('invalid'); return; }
    setViesStatus('loading');
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/validate-vat-number`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ vat: normalizeVat(buyerVat) }),
      });
      const j = await res.json();
      setViesStatus(j?.valid ? 'valid' : 'invalid');
    } catch {
      setViesStatus(vatCheck.valid ? 'valid' : 'invalid');
    }
  }

  async function save(silent = false): Promise<string | null> {
    if (!profile?.company_id) return null;
    if (!silent) setSaving(true);
    setError(null);
    try {
      const payload = {
        company_id: profile.company_id,
        created_by: profile.id,
        invoice_type: invoiceType,
        invoice_number: invoiceNumber,
        invoice_date: invoiceDate || new Date().toISOString().slice(0, 10),
        due_date: dueDate || null,
        delivery_date: deliveryDate || null,
        status: 'draft',
        contact_id: contactId || null,
        bank_account_id: bankId || null,
        currency,
        language_code: language,
        notes,
        payment_reference: paymentReference,
        payment_terms_days: paymentTermsDays,
        buyer_vat_number: buyerVat,
        seller_vat_number: company?.vat_number ?? '',
        reverse_charge: regime.regime === 'reverse_charge',
        intra_community_supply: regime.regime === 'intra_community_supply',
        subtotal: totals.subtotal,
        vat_amount: totals.vat_total,
        discount: totals.discount,
        total: totals.total,
      };

      let id = invoiceDbIdRef.current;
      if (id) {
        const { error: ue } = await supabase.from('acc_invoices').update(payload).eq('id', id);
        if (ue) throw ue;
      } else {
        const { data, error: ie } = await supabase.from('acc_invoices').insert(payload).select('id').maybeSingle();
        if (ie) throw ie;
        id = (data?.id as string) ?? null;
        invoiceDbIdRef.current = id;
      }

      if (id) {
        await supabase.from('acc_invoice_items').delete().eq('invoice_id', id);
        if (items.length) {
          const rows = items.map((it) => ({
            invoice_id: id,
            description: it.description,
            product_code: it.product_code,
            quantity: it.quantity,
            unit: 'pcs',
            unit_code: it.unit_code,
            unit_price: it.unit_price,
            vat_rate: it.vat_rate,
            vat_category: it.vat_category,
            line_discount: 0,
            discount_amount: it.discount_amount,
            line_total: Math.max(0, it.quantity * it.unit_price - it.discount_amount),
          }));
          const { error: iie } = await supabase.from('acc_invoice_items').insert(rows);
          if (iie) throw iie;
        }
      }
      dirtyRef.current = false;
      setSavedAt(new Date());
      return id;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ruajtja deshtoi');
      return null;
    } finally {
      if (!silent) setSaving(false);
    }
  }

  async function finalizeAndSend() {
    const id = await save(false);
    if (!id) return;
    const year = new Date().getFullYear();
    await supabase.rpc('noop').catch(() => {});
    const { data: seq } = await supabase
      .from('acc_invoice_sequences')
      .select('*')
      .eq('company_id', profile!.company_id!)
      .eq('doc_type', invoiceType)
      .eq('year', year)
      .maybeSingle();
    if (seq) {
      const s = seq as { id: string; current_number: number };
      await supabase.from('acc_invoice_sequences').update({ current_number: (s.current_number ?? 0) + 1, updated_at: new Date().toISOString() }).eq('id', s.id);
    } else {
      await supabase.from('acc_invoice_sequences').insert({
        company_id: profile!.company_id!,
        doc_type: invoiceType,
        year,
        prefix: invoiceType === 'credit_note' ? 'CN-' : invoiceType === 'proforma' ? 'PF-' : 'INV-',
        current_number: 1,
        format_mask: '{prefix}{year}-{number:0000}',
      });
    }
    await supabase.from('acc_invoices').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', id);
    navigate('/accounting/invoices');
  }

  function printPreview() {
    window.print();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-20 print:pb-0">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link to="/accounting/invoices" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="w-4 h-4" /> Kthehu
        </Link>
        <div className="flex items-center gap-2">
          {savedAt && !dirtyRef.current && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
              <CheckCircle2 className="w-3.5 h-3.5" /> Ruajtur {new Date(savedAt).toLocaleTimeString()}
            </span>
          )}
          <button onClick={() => save()} disabled={saving} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Ruaj draft
          </button>
          <button onClick={printPreview} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm font-semibold hover:bg-slate-50">
            <Printer className="w-4 h-4" /> Printo
          </button>
          <button onClick={finalizeAndSend} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-teal-600 text-white text-sm font-bold hover:bg-teal-700">
            <Send className="w-4 h-4" /> Finalizo
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2 print:hidden">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-5 print:block">
        {/* Form */}
        <div className="space-y-5 print:hidden">
          <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <Building2 className="w-4 h-4 text-teal-600" /> Cilesimet themelore
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Lloji">
                <select value={invoiceType} onChange={(e) => setInvoiceType(e.target.value as 'invoice' | 'credit_note' | 'proforma')} className={selectCls}>
                  <option value="invoice">Fatura</option>
                  <option value="credit_note">Notes krediti</option>
                  <option value="proforma">Proforma</option>
                </select>
              </Field>
              <Field label="Nr. i fatures">
                <input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Data"><input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className={inputCls} /></Field>
              <Field label="Afati i pageses"><input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} /></Field>
              <Field label="Data e furnizimit"><input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className={inputCls} /></Field>
              <Field label="Monedha">
                <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={selectCls}>
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label={<><Languages className="w-3 h-3 inline" /> Gjuha</>}>
                <select value={language} onChange={(e) => setLanguage(e.target.value as Lang)} className={selectCls}>
                  <option value="en">English</option>
                  <option value="de">Deutsch</option>
                  <option value="fr">Francais</option>
                  <option value="sq">Shqip</option>
                </select>
              </Field>
              <Field label="Dite pageses">
                <input type="number" min={0} value={paymentTermsDays} onChange={(e) => setPaymentTermsDays(Number(e.target.value))} className={inputCls} />
              </Field>
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <h3 className="font-bold text-slate-800 text-sm">Klienti</h3>
            <Field label="Kontakti">
              <select value={contactId} onChange={(e) => setContactId(e.target.value)} className={selectCls}>
                <option value="">Zgjidh kontakt...</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{c.country ? ` — ${c.country}` : ''}</option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
              <Field label="Nr. TVSH i bleresit">
                <input
                  value={buyerVatOverride}
                  onChange={(e) => { setBuyerVatOverride(e.target.value.toUpperCase()); setViesStatus('idle'); }}
                  onBlur={validateViesNow}
                  placeholder={contact?.vat_number ?? 'p.sh. DE123456789'}
                  className={inputCls}
                />
              </Field>
              <button onClick={validateViesNow} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-white border border-slate-200 text-xs font-semibold hover:bg-slate-50">
                <ShieldCheck className="w-3.5 h-3.5" /> Verifiko
              </button>
            </div>
            {buyerVat && (
              <div className="flex items-center gap-2 text-xs">
                {viesStatus === 'loading' && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500" />}
                {viesStatus === 'valid' && <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="w-3.5 h-3.5" /> VIES: valid</span>}
                {viesStatus === 'invalid' && <span className="inline-flex items-center gap-1 text-red-700"><AlertCircle className="w-3.5 h-3.5" /> VIES: i pavlefshem ose format i gabuar</span>}
                {viesStatus === 'idle' && (
                  <span className={`inline-flex items-center gap-1 ${vatCheck.valid ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {vatCheck.valid ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                    Format: {vatCheck.valid ? `OK (${vatCheck.country})` : 'jo-standard'}
                  </span>
                )}
              </div>
            )}
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600">
              <div className="font-semibold text-slate-700 mb-1">Regjimi i TVSH-se</div>
              <RegimeBadge regime={regime.regime} />
              {regime.legalText[language] && (
                <div className="mt-2 italic">{regime.legalText[language]}</div>
              )}
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-sm">Artikujt</h3>
              <button onClick={addItem} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700">
                <Plus className="w-3.5 h-3.5" /> Shto
              </button>
            </div>
            <div className="space-y-2">
              {items.map((it) => {
                const lineTotal = Math.max(0, it.quantity * it.unit_price - it.discount_amount);
                return (
                  <div key={it.id} className="rounded-lg border border-slate-200 p-3 bg-slate-50/50">
                    <div className="grid grid-cols-12 gap-2">
                      <div className="col-span-12">
                        <input placeholder="Pershkrimi" value={it.description} onChange={(e) => updateItem(it.id, { description: e.target.value })} className={inputCls} />
                      </div>
                      <input placeholder="Kodi" value={it.product_code} onChange={(e) => updateItem(it.id, { product_code: e.target.value })} className={`${inputCls} col-span-3`} />
                      <input type="number" step="0.001" placeholder="Sasia" value={it.quantity} onChange={(e) => updateItem(it.id, { quantity: Number(e.target.value) })} className={`${inputCls} col-span-2`} />
                      <select value={it.unit_code} onChange={(e) => updateItem(it.id, { unit_code: e.target.value })} className={`${selectCls} col-span-2`}>
                        {UN_ECE_UNITS.map((u) => <option key={u.code} value={u.code}>{u.code}</option>)}
                      </select>
                      <input type="number" step="0.01" placeholder="Cmimi" value={it.unit_price} onChange={(e) => updateItem(it.id, { unit_price: Number(e.target.value) })} className={`${inputCls} col-span-3`} />
                      <select value={it.vat_rate} onChange={(e) => updateItem(it.id, { vat_rate: Number(e.target.value) })} className={`${selectCls} col-span-2`}>
                        {availableVatRates.map((r) => <option key={r} value={r}>{r}%</option>)}
                      </select>

                      <select value={it.vat_category} onChange={(e) => updateItem(it.id, { vat_category: e.target.value })} className={`${selectCls} col-span-4`}>
                        {VAT_CATEGORIES.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.label}</option>)}
                      </select>
                      <input type="number" step="0.01" placeholder="Zbritje (shume)" value={it.discount_amount} onChange={(e) => updateItem(it.id, { discount_amount: Number(e.target.value) })} className={`${inputCls} col-span-3`} />
                      <div className="col-span-3 flex items-center justify-end text-sm font-bold text-slate-800">
                        {lineTotal.toFixed(2)} {currency}
                      </div>
                      <div className="col-span-2 flex items-center justify-end gap-1">
                        <button onClick={() => duplicateItem(it.id)} title="Dyfisho" className="p-1.5 rounded hover:bg-slate-200 text-slate-500">
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => removeItem(it.id)} title="Fshij" className="p-1.5 rounded hover:bg-red-100 text-red-500 disabled:opacity-30" disabled={items.length === 1}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <h3 className="font-bold text-slate-800 text-sm">Pagesa dhe shenime</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Llogaria bankare">
                <select value={bankId} onChange={(e) => setBankId(e.target.value)} className={selectCls}>
                  <option value="">Pa llogari</option>
                  {banks.map((b) => <option key={b.id} value={b.id}>{b.name} — {b.iban}</option>)}
                </select>
              </Field>
              <Field label="Referenca e pageses">
                <input value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Shenime" full>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={`${inputCls} resize-none`} />
              </Field>
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <Palette className="w-4 h-4 text-teal-600" /> Modeli
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {(['modern', 'classic', 'minimal'] as Layout[]).map((l) => (
                <button key={l} onClick={() => setLayout(l)}
                  className={`p-3 rounded-lg border-2 text-xs font-semibold capitalize transition-all ${
                    layout === l ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                  }`}>
                  {l}
                </button>
              ))}
            </div>
            <Field label="Ngjyra primare">
              <div className="flex items-center gap-2">
                <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="w-10 h-10 rounded border border-slate-200" />
                <input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className={inputCls} />
              </div>
            </Field>
          </section>
        </div>

        {/* Preview */}
        <div className="lg:sticky lg:top-4 self-start print:static">
          <div className="bg-slate-100 rounded-xl p-4 overflow-auto max-h-[calc(100vh-120px)] print:p-0 print:bg-white print:max-h-none">
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-3 print:hidden">
              <Sparkles className="w-3.5 h-3.5 text-teal-600" /> Parashikimi ne kohe reale (A4)
            </div>
            <div className="origin-top-left scale-[0.68] lg:scale-[0.8] xl:scale-[0.9] print:scale-100 print:transform-none">
              <InvoiceTemplate data={preview} />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500 print:hidden">
            <div>Subtotal: <span className="font-bold text-slate-900">{totals.subtotal.toFixed(2)} {currency}</span></div>
            <div>TVSH: <span className="font-bold text-slate-900">{totals.vat_total.toFixed(2)} {currency}</span></div>
            <div>Totali: <span className="font-bold text-emerald-700">{totals.total.toFixed(2)} {currency}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputCls = 'w-full text-sm px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500';
const selectCls = inputCls;

function Field({ label, children, full = false }: { label: React.ReactNode; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={`block ${full ? 'col-span-2' : ''}`}>
      <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">{label}</span>
      {children}
    </label>
  );
}

function RegimeBadge({ regime }: { regime: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    domestic: { label: 'Vendore (TVSH normale)', cls: 'bg-slate-100 text-slate-700' },
    intra_community_supply: { label: 'Brenda BE-se (e perjashtuar)', cls: 'bg-emerald-100 text-emerald-700' },
    reverse_charge: { label: 'Reverse charge', cls: 'bg-amber-100 text-amber-800' },
    export: { label: 'Eksport jashte BE', cls: 'bg-teal-100 text-teal-700' },
    not_applicable: { label: 'Papercaktuar', cls: 'bg-slate-100 text-slate-500' },
  };
  const m = map[regime] ?? map.not_applicable;
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold ${m.cls}`}>{m.label}</span>;
}
