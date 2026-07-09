import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  ArrowLeft, Plus, Trash2, Save, Send, Printer, Loader2, CheckCircle2,
  AlertCircle, Copy, ShieldCheck, Languages, Building2, Eye, X,
  FileText, Truck, Pencil, UserPlus,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import InvoiceTemplate, { type InvoicePreviewData } from '../../components/accounting/InvoiceTemplate';
import {
  buildVatBreakdown, computeVatRegime, normalizeVat,
  UN_ECE_UNITS, VAT_CATEGORIES, validateVatFormat,
  type EuCountry, type EuVatRate,
} from '../../utils/euCompliance';
import { formatCurrency, type AccCurrency, type VatTreatment, type LineType, type ClearingModel } from '../../types/accounting';
import { defaultVatTreatmentFor, vatTreatmentNoteKey } from '../../utils/vatTreatment';

type Lang = 'en' | 'de' | 'fr' | 'sq';

function detectLanguageFromCountry(country?: string | null): Lang {
  if (!country) return 'en';
  const c = country.toUpperCase().trim();
  if (['DE', 'AT', 'CH'].includes(c)) return 'de';
  if (['FR', 'BE', 'LU'].includes(c)) return 'fr';
  if (['AL', 'XK', 'MK'].includes(c)) return 'sq';
  return 'en';
}

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
  vat_treatment: VatTreatment;
  line_type: LineType | null;
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
  website?: string | null;
  logo_url?: string | null;
  legal_form?: string | null;
  commercial_register?: string | null;
  registration_court?: string | null;
  invoice_footer_text?: string | null;
  invoice_header_note?: string | null;
}

interface Contact {
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
  iban?: string | null;
  bic?: string | null;
  bank_name?: string | null;
  payment_days?: number | null;
  contact_type?: string | null;
  clearing_model?: ClearingModel | null;
}

interface BankAccount {
  id: string;
  name: string;
  iban: string;
  bic: string;
  bank_name: string;
  is_default: boolean;
}

interface CatalogItem {
  id: string;
  source: 'accounting' | 'stock';
  name: string;
  description: string | null;
  sku: string | null;
  unit: string | null;
  price_net: number;
  vat_rate: number;
}

function mapUnitToUnece(unit: string | null | undefined): string {
  if (!unit) return 'H87';
  const u = unit.toLowerCase().trim();
  const map: Record<string, string> = {
    pc: 'H87', pcs: 'H87', piece: 'H87', cope: 'H87', stk: 'H87', stueck: 'H87', st: 'H87', ea: 'H87',
    kg: 'KGM', g: 'GRM', t: 'TNE', ton: 'TNE',
    l: 'LTR', liter: 'LTR', litre: 'LTR', ml: 'MLT',
    m: 'MTR', meter: 'MTR', metre: 'MTR', cm: 'CMT', mm: 'MMT', km: 'KMT',
    m2: 'MTK', 'm²': 'MTK', sqm: 'MTK',
    m3: 'MTQ', 'm³': 'MTQ', cbm: 'MTQ',
    h: 'HUR', hour: 'HUR', ore: 'HUR',
    day: 'DAY', ditw: 'DAY', dite: 'DAY',
    pkg: 'XPP', pack: 'XPP', paketim: 'XPP', box: 'XBX', carton: 'XCT',
    set: 'SET', service: 'HUR',
  };
  if (map[u]) return map[u];
  const upper = unit.toUpperCase().trim();
  if (['H87', 'KGM', 'LTR', 'MTR', 'HUR', 'XPP', 'MTK', 'MTQ', 'TNE', 'XBX', 'XCT', 'SET', 'DAY', 'GRM', 'MLT', 'CMT', 'MMT', 'KMT'].includes(upper)) return upper;
  return 'H87';
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
    vat_treatment: 'standard',
    line_type: null,
  };
}

export default function InvoiceBuilder() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { id: invoiceId } = useParams<{ id: string }>();
  const isEdit = Boolean(invoiceId && invoiceId !== 'new');
  const listPath = location.pathname.startsWith('/company') ? '/company/invoices' : '/accounting/invoices';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [finalized, setFinalized] = useState(false);
  const [viesStatus, setViesStatus] = useState<'idle' | 'loading' | 'valid' | 'invalid'>('idle');

  const [company, setCompany] = useState<Company | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [, setCountries] = useState<EuCountry[]>([]);
  const [vatRates, setVatRates] = useState<EuVatRate[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);

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
  const [vatOverride, setVatOverride] = useState<'auto' | 'apply' | 'exempt'>('auto');
  const [paymentTermsDays, setPaymentTermsDays] = useState(14);
  const [notes, setNotes] = useState('');
  const [buyerVatOverride, setBuyerVatOverride] = useState('');
  // GoBD: a finalized invoice (status other than draft/cancelled) is locked —
  // it cannot be edited in place, only viewed/printed or corrected via a
  // credit note. The DB enforces this too (trg_acc_invoices_immutability).
  const [locked, setLocked] = useState(false);
  const [items, setItems] = useState<Item[]>([newItem()]);
  const [deliveryNoteId, setDeliveryNoteId] = useState<string | null>(null);
  const [deliveryNoteNumber, setDeliveryNoteNumber] = useState<string>('');
  const [deliveryNoteSearch, setDeliveryNoteSearch] = useState('');
  const [deliveryNoteResults, setDeliveryNoteResults] = useState<Array<{ id: string; note_number: string; document_number: string | null; partner_name: string | null; type: string; delivered_at: string | null; partner_id: string | null }>>([]);
  const [deliveryNoteSearchOpen, setDeliveryNoteSearchOpen] = useState(false);
  const [deliveryNotePartner, setDeliveryNotePartner] = useState<string>('');
  const [deliveryNoteDate, setDeliveryNoteDate] = useState<string>('');
  const [editingContact, setEditingContact] = useState(false);
  const [newContactForm, setNewContactForm] = useState<Partial<Contact> & { name: string }>({ name: '' });
  const [savingContact, setSavingContact] = useState(false);

  const [languageAutoSet, setLanguageAutoSet] = useState(false);
  const [clientPrices, setClientPrices] = useState<Map<string, number>>(new Map());
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [emailRecipient, setEmailRecipient] = useState('');
  const [emailCc, setEmailCc] = useState('');
  const [emailLocale, setEmailLocale] = useState<'sq' | 'de' | 'en'>('sq');
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [autoSendEnabled, setAutoSendEnabled] = useState(false);
  const [defaultEmailLocale, setDefaultEmailLocale] = useState<'sq' | 'de' | 'en'>('sq');

  const dirtyRef = useRef(false);
  const invoiceDbIdRef = useRef<string | null>(isEdit ? invoiceId ?? null : null);

  useEffect(() => { bootstrap(); }, [profile?.company_id]);

  useEffect(() => {
    if (!contactId || !profile?.company_id) {
      setClientPrices(new Map());
      return;
    }
    supabase
      .from('acc_client_prices')
      .select('product_id, product_source, custom_price_net')
      .eq('company_id', profile.company_id)
      .eq('contact_id', contactId)
      .eq('is_active', true)
      .then(({ data }) => {
        const map = new Map<string, number>();
        for (const row of (data ?? []) as any[]) {
          map.set(`${row.product_source}:${row.product_id}`, Number(row.custom_price_net));
        }
        setClientPrices(map);
      });
    const contact = contacts.find(c => c.id === contactId);
    if (contact?.email) setEmailRecipient(contact.email);
  }, [contactId]);

  async function bootstrap() {
    if (!profile?.company_id) return;
    setLoading(true);
    const [{ data: co }, { data: cs }, { data: bs }, { data: countryRows }, { data: rates }, { data: accProds }, { data: catProds }, { data: emailSettings }] = await Promise.all([
      supabase.from('companies').select('*').eq('id', profile.company_id).maybeSingle(),
      supabase.from('acc_contacts').select('id, name, address, postal_code, city, country, vat_number, tax_number, email, phone, iban, bic, bank_name, payment_days, contact_type, clearing_model')
        .eq('company_id', profile.company_id).eq('is_active', true).order('name'),
      supabase.from('acc_bank_accounts').select('id, name, iban, bic, bank_name, is_default')
        .eq('company_id', profile.company_id).eq('is_active', true),
      supabase.from('eu_countries').select('*').order('name'),
      supabase.from('eu_vat_rates').select('*').order('rate', { ascending: false }),
      supabase.from('acc_products').select('id, name, description, sku, unit, price_net, vat_rate, is_active')
        .eq('company_id', profile.company_id).eq('is_active', true).order('name'),
      supabase.from('category_products').select('id, name, description, sku, unit, price_net, vat_rate, is_active')
        .eq('company_id', profile.company_id).eq('is_active', true).order('name'),
      supabase.from('company_email_settings').select('auto_send_on_finalize, default_locale')
        .eq('company_id', profile.company_id).maybeSingle(),
    ]);

    const merged: CatalogItem[] = [];
    const seen = new Set<string>();
    const pushRow = (r: any, source: 'accounting' | 'stock') => {
      const key = `${(r.sku ?? '').toLowerCase().trim()}|${(r.name ?? '').toLowerCase().trim()}`;
      if (seen.has(key)) return;
      seen.add(key);
      merged.push({
        id: r.id, source,
        name: r.name ?? '', description: r.description ?? null, sku: r.sku ?? null,
        unit: r.unit ?? null,
        price_net: Number(r.price_net ?? 0),
        vat_rate: Number(r.vat_rate ?? 19),
      });
    };
    ((accProds as any[]) ?? []).forEach((r) => pushRow(r, 'accounting'));
    ((catProds as any[]) ?? []).forEach((r) => pushRow(r, 'stock'));
    merged.sort((a, b) => a.name.localeCompare(b.name));
    setCatalog(merged);

    setCompany((co as Company) ?? null);
    setContacts((cs as Contact[]) ?? []);
    setBanks((bs as BankAccount[]) ?? []);
    setCountries((countryRows as EuCountry[]) ?? []);
    setVatRates((rates as EuVatRate[]) ?? []);

    const defaultBank = ((bs as BankAccount[]) ?? []).find((b) => b.is_default) ?? ((bs as BankAccount[]) ?? [])[0];
    if (defaultBank) setBankId(defaultBank.id);

    if (!languageAutoSet && !isEdit && co) {
      const detectedLang = detectLanguageFromCountry((co as Company).country);
      setLanguage(detectedLang);
      setLanguageAutoSet(true);
    }

    if (emailSettings) {
      setAutoSendEnabled(!!(emailSettings as any).auto_send_on_finalize);
      const loc = (emailSettings as any).default_locale;
      if (loc === 'sq' || loc === 'de' || loc === 'en') setDefaultEmailLocale(loc);
    }

    if (isEdit && invoiceId) {
      await loadExisting(invoiceId);
    } else {
      await generateNextNumber(profile.company_id, 'invoice');
      const params = new URLSearchParams(location.search);
      const dnId = params.get('delivery_note_id');
      if (dnId) await prefillFromDeliveryNote(dnId);
    }
    setLoading(false);
  }

  async function prefillFromDeliveryNote(dnId: string) {
    const { data: dn } = await supabase
      .from('delivery_notes')
      .select('id, note_number, document_number, reference_number, partner_id, partner_name, type, delivered_at, notes, acc_invoice_id, ai_extracted_json')
      .eq('id', dnId)
      .maybeSingle();
    if (!dn) return;
    setDeliveryNoteId(dn.id as string);
    const ext = (dn.ai_extracted_json as any) || {};
    const resolvedDocNumber = (dn.document_number as string) || ext.document_number || ext.invoice_number || (dn.reference_number as string) || (dn.note_number as string) || '';
    setDeliveryNoteNumber(resolvedDocNumber);
    setDeliveryNotePartner((dn.partner_name as string) || '');
    setDeliveryNoteDate(dn.delivered_at ? String(dn.delivered_at).slice(0, 10) : '');
    if (dn.partner_id) setContactId(dn.partner_id as string);
    if (dn.delivered_at) setDeliveryDate(String(dn.delivered_at).slice(0, 10));

    const { data: dnItems } = await supabase
      .from('delivery_note_items')
      .select('quantity, notes, category:product_categories(name), category_product:category_products(name, sku, price_net, vat_rate, unit)')
      .eq('delivery_note_id', dnId);
    if (dnItems && dnItems.length) {
      // If the contact has clearing_model='exchange', pallet lines auto-default
      // to vat_treatment='sachdarlehen' so the operator does not have to
      // remember the legal carve-out (BMF v. 05.11.2013). Operator can
      // override per line.
      const contact = contacts.find((c) => c.id === contactId);
      const clearing: ClearingModel = contact?.clearing_model ?? 'deposit';
      const isPalletDescription = (s: string) => /palet|pallet/i.test(s);
      const rows: Item[] = (dnItems as any[]).map((r) => {
        const description = (r.category_product?.name || r.category?.name || r.notes || 'Artikull').trim();
        const lineType: LineType | null = isPalletDescription(description) ? 'pallet_exchange' : null;
        return {
          id: crypto.randomUUID(),
          description,
          product_code: r.category_product?.sku || '',
          quantity: Number(r.quantity ?? 1),
          unit_code: mapUnitToUnece(r.category_product?.unit || 'cope'),
          unit_price: Number(r.category_product?.price_net ?? 0),
          vat_rate: Number(r.category_product?.vat_rate ?? 19),
          vat_category: 'S',
          discount_amount: 0,
          vat_treatment: defaultVatTreatmentFor(clearing, lineType),
          line_type: lineType,
        };
      });
      setItems(rows);
    }
    setNotes((prev) => prev || `Sipas fletedergeses Nr. ${resolvedDocNumber}`);
  }

  async function searchDeliveryNotes(query: string) {
    if (!profile?.company_id || !query.trim()) {
      setDeliveryNoteResults([]);
      return;
    }
    const q = query.trim();
    const { data } = await supabase
      .from('delivery_notes')
      .select('id, note_number, document_number, partner_name, partner_id, type, delivered_at, acc_invoice_id')
      .eq('company_id', profile.company_id)
      .eq('type', 'delivery')
      .in('status', ['delivered', 'confirmed'])
      .is('acc_invoice_id', null)
      .or(`note_number.ilike.%${q}%,partner_name.ilike.%${q}%,document_number.ilike.%${q}%`)
      .order('created_at', { ascending: false })
      .limit(10);
    setDeliveryNoteResults((data as any[]) ?? []);
  }

  async function saveNewContact() {
    if (!profile?.company_id || !newContactForm.name.trim()) return;
    setSavingContact(true);
    try {
      const { data, error: err } = await supabase
        .from('acc_contacts')
        .insert({
          company_id: profile.company_id,
          name: newContactForm.name.trim(),
          contact_type: newContactForm.contact_type || 'customer',
          address: newContactForm.address || '',
          postal_code: newContactForm.postal_code || '',
          city: newContactForm.city || '',
          country: newContactForm.country || '',
          vat_number: newContactForm.vat_number || '',
          tax_number: newContactForm.tax_number || '',
          email: newContactForm.email || '',
          phone: newContactForm.phone || '',
          is_active: true,
        })
        .select('id, name, address, postal_code, city, country, vat_number, tax_number, email, phone, iban, bic, bank_name, payment_days, contact_type')
        .maybeSingle();
      if (err) throw err;
      if (data) {
        setContacts((prev) => [...prev, data as Contact].sort((a, b) => a.name.localeCompare(b.name)));
        setContactId(data.id);
        setNewContactForm({ name: '' });
        setEditingContact(false);
      }
    } catch (e) {
      setError((e as Error).message || 'Regjistrimi deshtoi');
    } finally {
      setSavingContact(false);
    }
  }

  async function updateExistingContact(fields: Partial<Contact>) {
    if (!contactId) return;
    setSavingContact(true);
    try {
      const { error: err } = await supabase
        .from('acc_contacts')
        .update(fields)
        .eq('id', contactId);
      if (err) throw err;
      setContacts((prev) => prev.map((c) => c.id === contactId ? { ...c, ...fields } : c));
      setEditingContact(false);
    } catch (e) {
      setError((e as Error).message || 'Ruajtja deshtoi');
    } finally {
      setSavingContact(false);
    }
  }

  function addTransportLine() {
    setItems((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        description: 'Kosto transporti',
        product_code: 'TRANSPORT',
        quantity: 1,
        unit_code: 'H87',
        unit_price: 0,
        vat_rate: 19,
        vat_category: 'S',
        discount_amount: 0,
        // BMF v. 05.11.2013: handling and transport fees stay taxable
        // even when the pallet swap itself is Sachdarlehen.
        vat_treatment: 'standard',
        line_type: 'transport',
      },
    ]);
  }

  async function loadExisting(id: string) {
    const { data: inv } = await supabase.from('acc_invoices').select('*').eq('id', id).maybeSingle();
    const { data: its } = await supabase.from('acc_invoice_items').select('*').eq('invoice_id', id).order('created_at');
    if (inv) {
      type Inv = { invoice_type: string; invoice_number: string; invoice_date: string; due_date: string; delivery_date: string | null;
        currency: string; language_code: string; contact_id: string | null; bank_account_id: string | null;
        payment_reference: string; payment_terms_days: number; notes: string; buyer_vat_number: string | null; };
      const i = inv as unknown as Inv;
      const st = (inv as { status?: string }).status ?? 'draft';
      setLocked(st !== 'draft' && st !== 'cancelled');
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
      const persisted = (i as { vat_override?: string }).vat_override;
      setVatOverride(persisted === 'apply' || persisted === 'exempt' ? persisted : 'auto');
      // Load linked delivery note info
      const dnId = (inv as any).delivery_note_id;
      if (dnId) {
        setDeliveryNoteId(dnId);
        const { data: dn } = await supabase
          .from('delivery_notes')
          .select('note_number, document_number, partner_name, delivered_at')
          .eq('id', dnId)
          .maybeSingle();
        if (dn) {
          setDeliveryNoteNumber((dn.document_number as string) || (dn.note_number as string) || '');
          setDeliveryNotePartner((dn.partner_name as string) || '');
          setDeliveryNoteDate(dn.delivered_at ? String(dn.delivered_at).slice(0, 10) : '');
        }
      }
    }
    if (its && its.length) {
      type It = { id: string; description: string; product_code: string; quantity: number;
        unit_code: string; unit_price: number; vat_rate: number; vat_category: string; discount_amount: number;
        vat_treatment?: VatTreatment | null; line_type?: LineType | null; };
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
        vat_treatment: (r.vat_treatment ?? 'standard') as VatTreatment,
        line_type: (r.line_type ?? null) as LineType | null,
      })));
    }
  }

  async function generateNextNumber(companyId: string, docType: string) {
    const year = new Date().getFullYear();
    let prefix: string;
    if (docType === 'credit_note') prefix = 'CN';
    else if (docType === 'proforma') prefix = 'PF';
    else {
      const { data: settings } = await supabase
        .from('acc_company_settings')
        .select('invoice_prefix')
        .eq('company_id', companyId)
        .maybeSingle();
      prefix = ((settings as { invoice_prefix?: string } | null)?.invoice_prefix || 'RE').replace(/-+$/, '');
    }
    const { data: seq } = await supabase
      .from('acc_invoice_sequences')
      .select('current_number')
      .eq('company_id', companyId)
      .eq('prefix', prefix)
      .eq('year', year)
      .maybeSingle();
    const next = ((seq as { current_number?: number } | null)?.current_number ?? 0) + 1;
    setInvoiceNumber(`${prefix}-${year}-${String(next).padStart(4, '0')}`);
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

  const autoRegime = useMemo(() => computeVatRegime({
    sellerCountry: company?.country ?? '',
    buyerCountry: contact?.country ?? vatCheck.country ?? '',
    buyerVatValid: vatCheck.valid,
    isGoods: true,
  }), [company?.country, contact?.country, vatCheck]);

  // `effectiveRegime` honours the manual override. The auto-detected
  // regime stays visible to the operator (so they understand the law),
  // but the override wins for the actual totals + persisted flags.
  const effectiveRegime = useMemo(() => {
    if (vatOverride === 'apply') {
      return { regime: 'domestic' as const, legalText: {} as Record<string, string> };
    }
    if (vatOverride === 'exempt') {
      return { regime: 'export' as const, legalText: autoRegime.legalText };
    }
    return autoRegime;
  }, [vatOverride, autoRegime]);
  const regime = effectiveRegime;

  const totals = useMemo(() => {
    const processed = items.map((it) => {
      const gross = it.quantity * it.unit_price;
      const net = Math.max(0, gross - it.discount_amount);
      // When the operator forces "exempt", zero out the VAT rate for
      // every line so the breakdown is consistent with the regime.
      const rate = vatOverride === 'exempt' ? 0 : it.vat_rate;
      return { net, vat_rate: rate, vat_category: it.vat_category, vat_treatment: it.vat_treatment };
    });
    const subtotal = processed.reduce((s, it) => s + it.net, 0);
    const discount = items.reduce((s, it) => s + (it.discount_amount || 0), 0);
    const breakdown = effectiveRegime.regime === 'domestic' ? buildVatBreakdown(processed) : [];
    const vat_total = breakdown.reduce((s, b) => s + b.vat, 0);
    const total = subtotal + vat_total;
    return { subtotal, discount, vat_total, total, vat_breakdown: breakdown };
  }, [items, effectiveRegime.regime, vatOverride]);

  const preview: InvoicePreviewData = useMemo(() => ({
    logoUrl: company?.logo_url ?? null, language,
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
      vat_treatment: it.vat_treatment,
      line_type: it.line_type,
    })),
    totals,
  }), [company, bank, contact, buyerVat, invoiceNumber, invoiceDate, dueDate,
      deliveryDate, currency, notes, paymentReference, invoiceType, regime, language, items, totals]);

  function updateItem(id: string, patch: Partial<Item>) {
    dirtyRef.current = true;
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }
  function selectProductForItem(itemId: string, product: CatalogItem) {
    dirtyRef.current = true;
    setItems((prev) => prev.map((it) => {
      if (it.id !== itemId) return it;
      const desc = [product.name, product.description].filter(Boolean).join(' — ');
      const clientKey = `${product.source}:${product.id}`;
      const clientPrice = clientPrices.get(clientKey);
      return {
        ...it,
        description: desc || product.name || it.description,
        product_code: product.sku ?? it.product_code,
        unit_code: mapUnitToUnece(product.unit),
        unit_price: clientPrice ?? (product.price_net || it.unit_price),
        vat_rate: product.vat_rate ?? it.vat_rate,
        quantity: it.quantity > 0 ? it.quantity : 1,
      };
    }));
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
    currency, language, contactId, bankId, paymentReference, paymentTermsDays, notes, buyerVatOverride, vatOverride]);

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
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
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
    // GoBD: never re-save (and never downgrade to draft) a finalized invoice.
    // Applies to auto-save too, so a stale dirty flag can't mutate an issued
    // document. The DB blocks this as well; this keeps the UX clean.
    if (locked) return invoiceDbIdRef.current;
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
        vat_override: vatOverride === 'auto' ? null : vatOverride,
        subtotal: totals.subtotal,
        vat_amount: totals.vat_total,
        discount: totals.discount,
        total: totals.total,
        delivery_note_id: deliveryNoteId,
        linked_document_number: deliveryNoteNumber || null,
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
            vat_treatment: it.vat_treatment,
            line_type: it.line_type,
          }));
          const { error: iie } = await supabase.from('acc_invoice_items').insert(rows);
          if (iie) throw iie;
        }
      }
      if (id && deliveryNoteId) {
        await supabase
          .from('delivery_notes')
          .update({ acc_invoice_id: id, invoiced_at: new Date().toISOString() })
          .eq('id', deliveryNoteId);
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
    if (locked) return;
    const id = await save(false);
    if (!id) return;

    // Reserve the official invoice_number atomically via the RPC.
    let prefix: string;
    if (invoiceType === 'credit_note') prefix = 'CN';
    else if (invoiceType === 'proforma') prefix = 'PF';
    else {
      const { data: settings } = await supabase
        .from('acc_company_settings')
        .select('invoice_prefix')
        .eq('company_id', profile!.company_id!)
        .maybeSingle();
      prefix = ((settings as { invoice_prefix?: string } | null)?.invoice_prefix || 'RE').replace(/-+$/, '');
    }
    const { data: officialNumber, error: numErr } = await supabase
      .rpc('get_next_acc_number', { p_company_id: profile!.company_id!, p_prefix: prefix });
    if (numErr || !officialNumber) {
      setError(t('accounting.invoices.numberingFailed') || 'Numerimi i fatures deshtoi');
      return;
    }
    setInvoiceNumber(officialNumber as string);

    // Persist the locked-in invoice_number but DO NOT flip status to
    // 'sent' here — that flag must reflect actual delivery. The edge
    // function below sets status + sent_at on a successful send; if the
    // operator skips auto-send, the invoice stays draft so they can
    // retry from the email modal.
    const { error: numErr2 } = await supabase
      .from('acc_invoices')
      .update({ invoice_number: officialNumber as string })
      .eq('id', id);
    if (numErr2) {
      setError(numErr2.message || 'Dergimi deshtoi');
      return;
    }
    setFinalized(true);

    const selectedContact = contacts.find(c => c.id === contactId);
    if (autoSendEnabled && selectedContact?.email) {
      setEmailSending(true);
      try {
        const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-invoice-email`;
        const resp = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            invoice_id: id,
            recipients: [selectedContact.email],
            locale: defaultEmailLocale,
          }),
        });
        // The edge function returns 202 even when the provider rejects,
        // so trust the body's `ok` flag, not the HTTP status.
        const sendResult = await resp.json().catch(() => ({} as { ok?: boolean }));
        if (resp.ok && sendResult.ok !== false) {
          setEmailSent(true);
          setEmailRecipient(selectedContact.email);
          setShowEmailDialog(true);
        } else {
          setShowEmailDialog(true);
          setEmailRecipient(selectedContact.email ?? '');
        }
      } catch {
        setShowEmailDialog(true);
        setEmailRecipient(selectedContact.email ?? '');
      } finally {
        setEmailSending(false);
      }
    } else {
      setEmailRecipient(selectedContact?.email ?? '');
      setShowEmailDialog(true);
    }
  }

  function printPreview() {
    setShowPreview(true);
    setTimeout(() => window.print(), 120);
  }

  useEffect(() => {
    if (!showPreview) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowPreview(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showPreview]);

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
        <Link to={listPath} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="w-4 h-4" /> {t('common.back')}
        </Link>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {savedAt && !dirtyRef.current && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
              <CheckCircle2 className="w-3.5 h-3.5" /> {t('accounting.invoiceBuilder.saved')} {new Date(savedAt).toLocaleTimeString()}
            </span>
          )}
          {!locked && (
            <button onClick={() => save()} disabled={saving} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {t('accounting.invoiceBuilder.saveDraft')}
            </button>
          )}
          <button onClick={() => setShowPreview(true)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm font-semibold hover:bg-slate-50">
            <Eye className="w-4 h-4" /> {t('accounting.invoiceBuilder.preview')}
          </button>
          <button onClick={printPreview} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm font-semibold hover:bg-slate-50">
            <Printer className="w-4 h-4" /> {t('accounting.invoiceBuilder.print')}
          </button>
          {!locked && (
            <button onClick={finalizeAndSend} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-teal-600 text-white text-sm font-bold hover:bg-teal-700">
              <Send className="w-4 h-4" /> {t('accounting.invoiceBuilder.finalize')}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2 print:hidden">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {locked && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800 flex items-center gap-2 print:hidden">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {t('accounting.invoiceBuilder.lockedBanner') || 'Kjo fature eshte leshuar dhe nuk mund te ndryshohet (GoBD). Per korrigjim, krijoni nje nota kreditit.'}
        </div>
      )}

      <div className="max-w-5xl mx-auto print:max-w-none print:mx-0">
        {/* Form */}
        <div className="space-y-5 print:hidden">
          <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <Building2 className="w-4 h-4 text-teal-600" /> {t('accounting.invoiceBuilder.sectionBasic')}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('accounting.invoiceBuilder.docType')}>
                <select value={invoiceType} onChange={(e) => setInvoiceType(e.target.value as 'invoice' | 'credit_note' | 'proforma')} className={selectCls}>
                  <option value="invoice">{t('accounting.invoiceBuilder.docTypeInvoice')}</option>
                  <option value="credit_note">{t('accounting.invoiceBuilder.docTypeCreditNote')}</option>
                  <option value="proforma">{t('accounting.invoiceBuilder.docTypeProforma')}</option>
                </select>
              </Field>
              <Field label={t('accounting.invoiceBuilder.invoiceNumber')}>
                <input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} className={inputCls} />
              </Field>
              <Field label={t('accounting.invoiceBuilder.date')}><input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className={inputCls} /></Field>
              <Field label={t('accounting.invoiceBuilder.dueDate')}><input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} /></Field>
              <Field label={t('accounting.invoiceBuilder.supplyDate')}><input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className={inputCls} /></Field>
              <Field label={t('accounting.invoiceBuilder.currency')}>
                <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={selectCls}>
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label={<><Languages className="w-3 h-3 inline" /> {t('accounting.invoiceBuilder.language')}</>}>
                <select value={language} onChange={(e) => setLanguage(e.target.value as Lang)} className={selectCls}>
                  <option value="en">English</option>
                  <option value="de">Deutsch</option>
                  <option value="fr">Francais</option>
                  <option value="sq">Shqip</option>
                </select>
              </Field>
              <Field label={t('accounting.invoiceBuilder.paymentTermsDays')}>
                <input type="number" min={0} value={paymentTermsDays} onChange={(e) => setPaymentTermsDays(Number(e.target.value))} className={inputCls} />
              </Field>
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5"><Truck className="w-4 h-4 text-teal-600" /> Fletedergesa e lidhur</h3>
              {deliveryNoteId && (
                <button
                  onClick={() => { setDeliveryNoteId(null); setDeliveryNoteNumber(''); }}
                  className="text-xs text-red-600 hover:text-red-800"
                >
                  Shkeput
                </button>
              )}
            </div>
            {deliveryNoteId ? (
              <div className="rounded-lg bg-teal-50 border border-teal-200 p-3 space-y-1">
                <div className="flex items-center gap-2 text-sm text-teal-900">
                  <FileText className="w-4 h-4 text-teal-600 flex-shrink-0" />
                  <span>{t('accounting.invoiceBuilder.deliveryNote')} <span className="font-bold text-teal-800">#{deliveryNoteNumber || '-'}</span></span>
                </div>
                {(deliveryNotePartner || deliveryNoteDate) && (
                  <div className="flex items-center gap-3 text-xs text-teal-700 pl-6">
                    {deliveryNotePartner && <span>{t('accounting.invoiceBuilder.partner')}: <span className="font-semibold">{deliveryNotePartner}</span></span>}
                    {deliveryNoteDate && <span>{t('accounting.invoiceBuilder.date')}: <span className="font-semibold">{deliveryNoteDate}</span></span>}
                  </div>
                )}
              </div>
            ) : (
              <div className="relative">
                <input
                  value={deliveryNoteSearch}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDeliveryNoteSearch(v);
                    setDeliveryNoteSearchOpen(true);
                    searchDeliveryNotes(v);
                  }}
                  onFocus={() => setDeliveryNoteSearchOpen(true)}
                  placeholder={t('accounting.invoiceBuilder.searchDeliveryNote')}
                  className={inputCls}
                />
                {deliveryNoteSearchOpen && deliveryNoteResults.length > 0 && (
                  <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {deliveryNoteResults.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={async () => {
                          await prefillFromDeliveryNote(r.id);
                          setDeliveryNoteSearch('');
                          setDeliveryNoteResults([]);
                          setDeliveryNoteSearchOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
                      >
                        <div className="text-sm font-semibold text-slate-900">
                          #{r.document_number || r.note_number}
                          {r.document_number && r.document_number !== r.note_number && (
                            <span className="ml-1.5 text-xs font-normal text-slate-400">({r.note_number})</span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500">
                          {r.partner_name || t('accounting.invoiceBuilder.noPartner')} • {r.type === 'pickup' ? t('accounting.invoiceBuilder.pickup') : t('accounting.invoiceBuilder.delivery')}
                          {r.delivered_at ? ` • ${String(r.delivered_at).slice(0, 10)}` : ''}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-xs text-slate-500 mt-1">{t('accounting.invoiceBuilder.deliveryNoteOptional')}</p>
              </div>
            )}
          </section>

          {/* Seller info */}
          <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-teal-600" /> {t('accounting.invoiceBuilder.sellerSection')}
              </h3>
              <Link to="/company/settings" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-teal-700">
                <Pencil className="w-3 h-3" /> {t('common.edit')}
              </Link>
            </div>
            {company && (
              <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                <InfoRow label={t('accounting.invoiceBuilder.companyName')} value={company.name} />
                {company.address && <InfoRow label={t('accounting.invoiceBuilder.companyAddress')} value={`${company.address}${company.postal_code ? ', ' + company.postal_code : ''} ${company.city || ''}`} />}
                {company.country && <InfoRow label={t('accounting.invoiceBuilder.country')} value={company.country} />}
                {company.vat_number && <InfoRow label={t('accounting.invoiceBuilder.vatNumber')} value={company.vat_number} />}
                {company.tax_number && <InfoRow label={t('accounting.invoiceBuilder.taxNumber')} value={company.tax_number} />}
                {company.legal_form && <InfoRow label={t('accounting.invoiceBuilder.legalForm')} value={company.legal_form} />}
                {company.commercial_register && <InfoRow label={t('accounting.invoiceBuilder.commercialRegister')} value={company.commercial_register} />}
                {company.email && <InfoRow label="Email" value={company.email} />}
                {company.phone && <InfoRow label={t('accounting.invoiceBuilder.phone')} value={company.phone} />}
                {bank && <InfoRow label="IBAN" value={bank.iban} />}
                {bank && bank.bic && <InfoRow label="BIC" value={bank.bic} />}
                {bank && bank.bank_name && <InfoRow label={t('accounting.invoiceBuilder.bankName')} value={bank.bank_name} />}
              </div>
            )}
            {company && !company.vat_number && (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
                <AlertCircle className="w-3.5 h-3.5" /> {t('accounting.invoiceBuilder.missingVat')}
              </div>
            )}
          </section>

          {/* Buyer section */}
          <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-sm">{t('accounting.invoiceBuilder.buyerSection')}</h3>
              {contact && !editingContact && (
                <button onClick={() => { setEditingContact(true); setNewContactForm(contact as any); }} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-teal-700">
                  <Pencil className="w-3 h-3" /> {t('common.edit')}
                </button>
              )}
            </div>

            {/* Contact selector */}
            <Field label={t('accounting.invoiceBuilder.contact')}>
              <select value={contactId} onChange={(e) => { setContactId(e.target.value); setEditingContact(false); }} className={selectCls}>
                <option value="">{t('accounting.invoiceBuilder.pickContact')}</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{c.country ? ` — ${c.country}` : ''}</option>
                ))}
              </select>
            </Field>

            {/* Existing contact - full data card */}
            {contact && !editingContact && (
              <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                <InfoRow label={t('accounting.invoiceBuilder.companyName')} value={contact.name} />
                {contact.address && <InfoRow label={t('accounting.invoiceBuilder.companyAddress')} value={`${contact.address}${contact.postal_code ? ', ' + contact.postal_code : ''} ${contact.city || ''}`} />}
                {contact.country && <InfoRow label={t('accounting.invoiceBuilder.country')} value={contact.country} />}
                {contact.vat_number && <InfoRow label={t('accounting.invoiceBuilder.vatNumber')} value={contact.vat_number} />}
                {contact.tax_number && <InfoRow label={t('accounting.invoiceBuilder.taxNumber')} value={contact.tax_number} />}
                {contact.email && <InfoRow label="Email" value={contact.email} />}
                {contact.phone && <InfoRow label={t('accounting.invoiceBuilder.phone')} value={contact.phone} />}
                {contact.iban && <InfoRow label="IBAN" value={contact.iban} />}
                {contact.payment_days && <InfoRow label={t('accounting.invoiceBuilder.paymentDays')} value={`${contact.payment_days} ${t('accounting.invoiceBuilder.days')}`} />}
              </div>
            )}

            {/* Edit existing contact form */}
            {contact && editingContact && (
              <div className="rounded-lg border border-teal-200 bg-teal-50/30 p-3 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Field label={t('accounting.invoiceBuilder.companyName')}><input value={newContactForm.name || ''} onChange={(e) => setNewContactForm((p) => ({ ...p, name: e.target.value }))} className={inputCls} /></Field>
                  <Field label={t('accounting.invoiceBuilder.country')}><input value={newContactForm.country || ''} onChange={(e) => setNewContactForm((p) => ({ ...p, country: e.target.value }))} className={inputCls} /></Field>
                  <Field label={t('accounting.invoiceBuilder.companyAddress')}><input value={newContactForm.address || ''} onChange={(e) => setNewContactForm((p) => ({ ...p, address: e.target.value }))} className={inputCls} /></Field>
                  <Field label={t('accounting.invoiceBuilder.city')}><input value={newContactForm.city || ''} onChange={(e) => setNewContactForm((p) => ({ ...p, city: e.target.value }))} className={inputCls} /></Field>
                  <Field label={t('accounting.invoiceBuilder.postalCode')}><input value={newContactForm.postal_code || ''} onChange={(e) => setNewContactForm((p) => ({ ...p, postal_code: e.target.value }))} className={inputCls} /></Field>
                  <Field label={t('accounting.invoiceBuilder.vatNumber')}><input value={newContactForm.vat_number || ''} onChange={(e) => setNewContactForm((p) => ({ ...p, vat_number: e.target.value.toUpperCase() }))} className={inputCls} /></Field>
                  <Field label="Email"><input type="email" value={newContactForm.email || ''} onChange={(e) => setNewContactForm((p) => ({ ...p, email: e.target.value }))} className={inputCls} /></Field>
                  <Field label={t('accounting.invoiceBuilder.phone')}><input value={newContactForm.phone || ''} onChange={(e) => setNewContactForm((p) => ({ ...p, phone: e.target.value }))} className={inputCls} /></Field>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button onClick={() => updateExistingContact(newContactForm)} disabled={savingContact} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 disabled:opacity-60">
                    {savingContact ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} {t('accounting.invoiceBuilder.saveChanges')}
                  </button>
                  <button onClick={() => setEditingContact(false)} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100">{t('common.cancel')}</button>
                </div>
              </div>
            )}

            {/* No contact selected - offer to register new */}
            {!contactId && !editingContact && (
              <button
                onClick={() => { setEditingContact(true); setNewContactForm({ name: '', contact_type: 'customer' }); }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-50 w-full justify-center"
              >
                <UserPlus className="w-3.5 h-3.5" /> {t('accounting.invoiceBuilder.registerNewClient')}
              </button>
            )}

            {/* New contact registration form */}
            {!contactId && editingContact && (
              <div className="rounded-lg border border-sky-200 bg-sky-50/30 p-3 space-y-2">
                <p className="text-xs font-semibold text-slate-700">{t('accounting.invoiceBuilder.registerNewClient')}</p>
                <div className="grid grid-cols-2 gap-2">
                  <Field label={t('accounting.invoiceBuilder.companyNameRequired')}><input value={newContactForm.name || ''} onChange={(e) => setNewContactForm((p) => ({ ...p, name: e.target.value }))} placeholder={t('accounting.invoiceBuilder.companyNamePlaceholder')} className={inputCls} /></Field>
                  <Field label={t('accounting.invoiceBuilder.country')}><input value={newContactForm.country || ''} onChange={(e) => setNewContactForm((p) => ({ ...p, country: e.target.value }))} placeholder="DE" className={inputCls} /></Field>
                  <Field label={t('accounting.invoiceBuilder.companyAddress')}><input value={newContactForm.address || ''} onChange={(e) => setNewContactForm((p) => ({ ...p, address: e.target.value }))} className={inputCls} /></Field>
                  <Field label={t('accounting.invoiceBuilder.city')}><input value={newContactForm.city || ''} onChange={(e) => setNewContactForm((p) => ({ ...p, city: e.target.value }))} className={inputCls} /></Field>
                  <Field label={t('accounting.invoiceBuilder.postalCode')}><input value={newContactForm.postal_code || ''} onChange={(e) => setNewContactForm((p) => ({ ...p, postal_code: e.target.value }))} className={inputCls} /></Field>
                  <Field label={t('accounting.invoiceBuilder.vatNumber')}><input value={newContactForm.vat_number || ''} onChange={(e) => setNewContactForm((p) => ({ ...p, vat_number: e.target.value.toUpperCase() }))} placeholder="DE123456789" className={inputCls} /></Field>
                  <Field label="Email"><input type="email" value={newContactForm.email || ''} onChange={(e) => setNewContactForm((p) => ({ ...p, email: e.target.value }))} className={inputCls} /></Field>
                  <Field label={t('accounting.invoiceBuilder.phone')}><input value={newContactForm.phone || ''} onChange={(e) => setNewContactForm((p) => ({ ...p, phone: e.target.value }))} className={inputCls} /></Field>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button onClick={saveNewContact} disabled={savingContact || !newContactForm.name.trim()} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 text-white text-xs font-semibold hover:bg-sky-700 disabled:opacity-60">
                    {savingContact ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />} {t('accounting.invoiceBuilder.saveClient')}
                  </button>
                  <button onClick={() => setEditingContact(false)} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100">{t('common.cancel')}</button>
                </div>
              </div>
            )}

            {/* VAT override */}
            <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
              <Field label={t('accounting.invoiceBuilder.buyerVat')}>
                <input
                  value={buyerVatOverride}
                  onChange={(e) => { setBuyerVatOverride(e.target.value.toUpperCase()); setViesStatus('idle'); }}
                  onBlur={validateViesNow}
                  placeholder={contact?.vat_number ?? 'p.sh. DE123456789'}
                  className={inputCls}
                />
              </Field>
              <button onClick={validateViesNow} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-white border border-slate-200 text-xs font-semibold hover:bg-slate-50">
                <ShieldCheck className="w-3.5 h-3.5" /> {t('accounting.invoiceBuilder.verify')}
              </button>
            </div>
            {buyerVat && (
              <div className="flex items-center gap-2 text-xs">
                {viesStatus === 'loading' && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500" />}
                {viesStatus === 'valid' && <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="w-3.5 h-3.5" /> VIES: valid</span>}
                {viesStatus === 'invalid' && <span className="inline-flex items-center gap-1 text-red-700"><AlertCircle className="w-3.5 h-3.5" /> VIES: i pavlefshem ose format i gabuar</span>}
                {viesStatus === 'idle' && buyerVat && (
                  <span className={`inline-flex items-center gap-1 ${vatCheck.valid ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {vatCheck.valid ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                    Format: {vatCheck.valid ? `OK (${vatCheck.country})` : 'jo-standard'}
                  </span>
                )}
              </div>
            )}
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold text-slate-700">{t('accounting.invoiceBuilder.vatRegime')}</div>
                <RegimeBadge regime={regime.regime} />
              </div>
              {vatOverride === 'auto' && autoRegime.regime !== 'domestic' && autoRegime.regime !== 'not_applicable' && (
                <div className="text-[11px] text-slate-500">
                  Auto: {autoRegime.regime === 'intra_community_supply'
                    ? 'shitje brenda BE-se, e perjashtuar nga TVSH (kerkohet VAT i vlefshem i bleresit)'
                    : autoRegime.regime === 'export'
                    ? 'eksport jashte BE-se, pa TVSH'
                    : 'reverse charge — bleresi paguan TVSH-ne'}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[10px] uppercase tracking-wider text-slate-500 mr-1">{t('accounting.invoiceBuilder.manual')}:</span>
                <VatOverrideBtn current={vatOverride} value="auto"   label={t('accounting.invoiceBuilder.vatAuto')}      onClick={setVatOverride} />
                <VatOverrideBtn current={vatOverride} value="apply"  label={t('accounting.invoiceBuilder.vatApply')}     onClick={setVatOverride} />
                <VatOverrideBtn current={vatOverride} value="exempt" label={t('accounting.invoiceBuilder.vatExempt')}    onClick={setVatOverride} />
              </div>
              {regime.legalText[language] && (
                <div className="italic text-[11px] mt-1">{regime.legalText[language]}</div>
              )}
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-sm">{t('accounting.invoiceBuilder.items')}</h3>
              <div className="flex items-center gap-2">
                <button onClick={addTransportLine} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-sky-50 border border-sky-200 text-sky-700 text-xs font-semibold hover:bg-sky-100">
                  <Truck className="w-3.5 h-3.5" /> {t('accounting.invoiceBuilder.transportCost')}
                </button>
                <button onClick={addItem} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700">
                  <Plus className="w-3.5 h-3.5" /> {t('accounting.invoiceBuilder.addItem')}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {items.map((it) => {
                const lineTotal = Math.max(0, it.quantity * it.unit_price - it.discount_amount);
                return (
                  <div key={it.id} className="rounded-lg border border-slate-200 p-3 bg-slate-50/50 space-y-2">
                    <div className="grid grid-cols-12 gap-2">
                      <div className="col-span-12">
                        <span className="block text-[10px] uppercase tracking-wider text-slate-400 font-medium mb-0.5">{t('accounting.invoiceBuilder.description')}</span>
                        <ProductAutocomplete
                          value={it.description}
                          catalog={catalog}
                          onChange={(v) => updateItem(it.id, { description: v })}
                          onSelect={(p) => selectProductForItem(it.id, p)}
                          inputCls={inputCls}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-12 gap-2">
                      <div className="col-span-3">
                        <span className="block text-[10px] uppercase tracking-wider text-slate-400 font-medium mb-0.5">{t('accounting.invoiceBuilder.code')}</span>
                        <input value={it.product_code} onChange={(e) => updateItem(it.id, { product_code: e.target.value })} className={inputCls} />
                      </div>
                      <div className="col-span-2">
                        <span className="block text-[10px] uppercase tracking-wider text-slate-400 font-medium mb-0.5">{t('accounting.invoiceBuilder.quantity')}</span>
                        <input type="number" step="0.001" value={it.quantity} onChange={(e) => updateItem(it.id, { quantity: Number(e.target.value) })} className={inputCls} />
                      </div>
                      <div className="col-span-2">
                        <span className="block text-[10px] uppercase tracking-wider text-slate-400 font-medium mb-0.5">{t('accounting.invoiceBuilder.unit')}</span>
                        <select value={it.unit_code} onChange={(e) => updateItem(it.id, { unit_code: e.target.value })} className={selectCls}>
                          {UN_ECE_UNITS.map((u) => <option key={u.code} value={u.code}>{u.code}</option>)}
                        </select>
                      </div>
                      <div className="col-span-3">
                        <span className="block text-[10px] uppercase tracking-wider text-slate-400 font-medium mb-0.5">{t('accounting.invoiceBuilder.netPrice')}</span>
                        <input type="number" step="0.01" value={it.unit_price} onChange={(e) => updateItem(it.id, { unit_price: Number(e.target.value) })} className={inputCls} />
                      </div>
                      <div className="col-span-2">
                        <span className="block text-[10px] uppercase tracking-wider text-slate-400 font-medium mb-0.5">{t('common.tvsh2')}</span>
                        <select value={it.vat_rate} onChange={(e) => updateItem(it.id, { vat_rate: Number(e.target.value) })} className={selectCls}>
                          {availableVatRates.map((r) => <option key={r} value={r}>{r}%</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-12 gap-2">
                      <div className="col-span-4">
                        <span className="block text-[10px] uppercase tracking-wider text-slate-400 font-medium mb-0.5">{t('accounting.invoiceBuilder.vatCategory')}</span>
                        <select value={it.vat_category} onChange={(e) => updateItem(it.id, { vat_category: e.target.value })} className={selectCls}>
                          {VAT_CATEGORIES.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.label}</option>)}
                        </select>
                      </div>
                      <div className="col-span-3">
                        <span className="block text-[10px] uppercase tracking-wider text-slate-400 font-medium mb-0.5">{t('accounting.invoiceBuilder.discount')}</span>
                        <input type="number" step="0.01" value={it.discount_amount} onChange={(e) => updateItem(it.id, { discount_amount: Number(e.target.value) })} className={inputCls} />
                      </div>
                      <div className="col-span-3">
                        <span className="block text-[10px] uppercase tracking-wider text-slate-400 font-medium mb-0.5 text-right">{t('accounting.invoiceBuilder.total')}</span>
                        <div className="flex items-center justify-end h-[34px] text-sm font-bold text-slate-800">
                          {formatCurrency(lineTotal, currency as AccCurrency)}
                        </div>
                      </div>
                      <div className="col-span-2 flex flex-col items-end">
                        <span className="block text-[10px] uppercase tracking-wider text-slate-400 font-medium mb-0.5">{t('accounting.invoiceBuilder.actions')}</span>
                        <div className="flex items-center gap-1 h-[34px]">
                          <button onClick={() => duplicateItem(it.id)} title={t('accounting.invoiceBuilder.duplicate')} className="p-1.5 rounded hover:bg-slate-200 text-slate-500">
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => removeItem(it.id)} title={t('common.delete')} className="p-1.5 rounded hover:bg-red-100 text-red-500 disabled:opacity-30" disabled={items.length === 1}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                    {/* Tausch/Pfand: per-line VAT treatment + line type. Hidden behind
                        a thin row so it does not clutter the daily flow but is always
                        accessible for German operators who need Sachdarlehen. */}
                    <div className="grid grid-cols-12 gap-2 pt-1">
                      <div className="col-span-6">
                        <span className="block text-[10px] uppercase tracking-wider text-slate-400 font-medium mb-0.5">{t('accounting.vatTreatment.label')}</span>
                        <select value={it.vat_treatment} onChange={(e) => updateItem(it.id, { vat_treatment: e.target.value as VatTreatment })} className={selectCls}>
                          <option value="standard">{t('accounting.vatTreatment.labels.standard')}</option>
                          <option value="reverse_charge">{t('accounting.vatTreatment.labels.reverse_charge')}</option>
                          <option value="exempt">{t('accounting.vatTreatment.labels.exempt')}</option>
                          <option value="sachdarlehen">{t('accounting.vatTreatment.labels.sachdarlehen')}</option>
                          <option value="schadenersatz">{t('accounting.vatTreatment.labels.schadenersatz')}</option>
                        </select>
                      </div>
                      <div className="col-span-6">
                        <span className="block text-[10px] uppercase tracking-wider text-slate-400 font-medium mb-0.5">{t('accounting.lineType.label')}</span>
                        <select value={it.line_type ?? ''} onChange={(e) => updateItem(it.id, { line_type: (e.target.value || null) as LineType | null })} className={selectCls}>
                          <option value="">—</option>
                          <option value="goods">{t('accounting.lineType.goods')}</option>
                          <option value="transport">{t('accounting.lineType.transport')}</option>
                          <option value="handling">{t('accounting.lineType.handling')}</option>
                          <option value="pallet_deposit">{t('accounting.lineType.pallet_deposit')}</option>
                          <option value="pallet_exchange">{t('accounting.lineType.pallet_exchange')}</option>
                          <option value="repair">{t('accounting.lineType.repair')}</option>
                          <option value="other">{t('accounting.lineType.other')}</option>
                        </select>
                      </div>
                    </div>
                    {it.vat_treatment !== 'standard' && vatTreatmentNoteKey(it.vat_treatment) && (
                      <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1">
                        {t(vatTreatmentNoteKey(it.vat_treatment) as string)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <h3 className="font-bold text-slate-800 text-sm">{t('accounting.invoiceBuilder.paymentSection')}</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('accounting.invoiceBuilder.bankAccount')}>
                <select value={bankId} onChange={(e) => setBankId(e.target.value)} className={selectCls}>
                  <option value="">{t('accounting.invoiceBuilder.noAccount')}</option>
                  {banks.map((b) => <option key={b.id} value={b.id}>{b.name} — {b.iban}</option>)}
                </select>
              </Field>
              <Field label={t('accounting.invoiceBuilder.paymentReference')}>
                <input value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} className={inputCls} />
              </Field>
              <Field label={t('accounting.invoiceBuilder.notes')} full>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={`${inputCls} resize-none`} placeholder={t('accounting.invoiceBuilder.notesPlaceholder')} />
                {deliveryNoteId && deliveryNoteNumber && (
                  <p className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-1">
                    <FileText className="w-3 h-3" />
                    {t('accounting.invoiceBuilder.referenceDeliveryNote')} <span className="font-semibold">{deliveryNoteNumber}</span>
                    {deliveryNoteDate && <span> ({deliveryNoteDate})</span>}
                  </p>
                )}
              </Field>
            </div>
          </section>

        </div>

        {/* Totals summary (visible in form) */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 text-sm print:hidden">
          <div>{t('accounting.invoiceBuilder.subtotal')}: <span className="font-bold text-slate-900">{formatCurrency(totals.subtotal, currency as AccCurrency)}</span></div>
          <div>{t('accounting.invoiceBuilder.vat')}: <span className="font-bold text-slate-900">{formatCurrency(totals.vat_total, currency as AccCurrency)}</span></div>
          <div>{t('accounting.invoiceBuilder.total')}: <span className="font-bold text-emerald-700 text-base">{formatCurrency(totals.total, currency as AccCurrency)}</span></div>
          <button onClick={() => setShowPreview(true)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-teal-600 text-white text-sm font-bold hover:bg-teal-700">
            <Eye className="w-4 h-4" /> {t('accounting.invoiceBuilder.preview')}
          </button>
        </div>
      </div>

      {/* Email Send Dialog */}
      {showEmailDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 print:hidden">
          <div className="fixed inset-0 bg-black/50" onClick={() => { if (!emailSending) setShowEmailDialog(false); }} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-5 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Send className="w-5 h-5 text-teal-600" />
                {t('accounting.invoiceBuilder.sendByEmail')}
              </h3>
              <p className="text-sm text-gray-500 mt-1">{t('accounting.invoiceBuilder.sendByEmailHint')}</p>
            </div>
            <div className="p-5 space-y-4">
              {emailSent ? (
                <div className="text-center py-6">
                  <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                  <p className="text-lg font-semibold text-gray-900">{t('accounting.invoiceBuilder.emailSent')}</p>
                  <p className="text-sm text-gray-500 mt-1">{t('accounting.invoiceBuilder.emailSentTo')} {emailRecipient}</p>
                </div>
              ) : (
                <>
                  <div>
                    <label htmlFor="invoice-email-client" className="block text-sm font-medium text-gray-700 mb-1">{t('accounting.invoiceBuilder.clientEmail')} *</label>
                    <input
                      id="invoice-email-client"
                      type="email"
                      value={emailRecipient}
                      onChange={(e) => setEmailRecipient(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                      placeholder={t('common.emailExampleAlias')}
                    />
                  </div>
                  <div>
                    <label htmlFor="invoice-email-cc" className="block text-sm font-medium text-gray-700 mb-1">{t('accounting.invoiceBuilder.ccOptional')}</label>
                    <input
                      id="invoice-email-cc"
                      type="text"
                      value={emailCc}
                      onChange={(e) => setEmailCc(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                      placeholder={t('common.emailListExample')}
                    />
                  </div>
                  <div>
                    <label htmlFor="invoice-email-locale" className="block text-sm font-medium text-gray-700 mb-1">{t('accounting.invoiceBuilder.emailLanguage')}</label>
                    <select
                      id="invoice-email-locale"
                      value={emailLocale}
                      onChange={(e) => setEmailLocale(e.target.value as 'sq' | 'de' | 'en')}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                    >
                      <option value="sq">Shqip</option>
                      <option value="de">Deutsch</option>
                      <option value="en">English</option>
                    </select>
                  </div>
                </>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100">
              {emailSent ? (
                <>
                  <button
                    onClick={() => { setShowEmailDialog(false); setShowPreview(true); }}
                    className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                  >
                    {t('accounting.invoiceBuilder.viewInvoice')}
                  </button>
                  <button
                    onClick={() => navigate(listPath)}
                    className="px-4 py-2.5 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700"
                  >
                    {t('accounting.invoiceBuilder.goToList')}
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => { setShowEmailDialog(false); setShowPreview(true); }}
                    className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                  >
                    {t('accounting.invoiceBuilder.skipSend')}
                  </button>
                  <button
                    onClick={async () => {
                      if (!emailRecipient.trim()) return;
                      setEmailSending(true);
                      try {
                        const recipients = [emailRecipient.trim()];
                        if (emailCc.trim()) {
                          recipients.push(...emailCc.split(',').map(e => e.trim()).filter(Boolean));
                        }
                        const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-invoice-email`;
                        const resp = await fetch(apiUrl, {
                          method: 'POST',
                          headers: {
                            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
                            'Content-Type': 'application/json',
                            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                          },
                          body: JSON.stringify({
                            invoice_id: invoiceDbIdRef.current,
                            recipients,
                            locale: emailLocale,
                          }),
                        });
                        if (resp.ok) {
                          setEmailSent(true);
                        } else {
                          const err = await resp.json().catch(() => ({}));
                          setError(err.error || 'Dergimi i email-it deshtoi');
                        }
                      } catch (e) {
                        setError((e as Error).message || 'Gabim gjate dergimit');
                      } finally {
                        setEmailSending(false);
                      }
                    }}
                    disabled={emailSending || !emailRecipient.trim()}
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50"
                  >
                    {emailSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    {t('accounting.invoiceBuilder.sendPdf')}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {showPreview && (
        <>
        {/* Print only the invoice, reliably, even from inside this fixed modal
            (mobile browsers otherwise print blank). Everything is hidden except
            the .invoice-print-area, which is lifted to the page origin. */}
        <style>{`
          @media print {
            body * { visibility: hidden !important; }
            .invoice-print-area, .invoice-print-area * { visibility: visible !important; }
            .invoice-print-area { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; box-shadow: none !important; border-radius: 0 !important; }
            @page { size: A4; margin: 10mm; }
          }
        `}</style>
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex flex-col print:static print:bg-white print:backdrop-blur-0">
          <div className="flex items-center justify-between gap-3 px-4 py-3 bg-white border-b border-slate-200 print:hidden">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center flex-shrink-0">
                <Eye className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-900 truncate">
                  {finalized ? t('accounting.invoiceBuilder.invoiceCreated') : t('accounting.invoiceBuilder.preview')}
                </div>
                <div className="text-xs text-slate-500 truncate">{invoiceNumber}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm font-semibold hover:bg-slate-50">
                <Printer className="w-4 h-4" /> {t('accounting.invoiceBuilder.print')}
              </button>
              {finalized && (
                <button onClick={() => navigate(listPath)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-teal-600 text-white text-sm font-bold hover:bg-teal-700">
                  {t('accounting.invoiceBuilder.goToList')}
                </button>
              )}
              <button
                onClick={() => setShowPreview(false)}
                aria-label={t('common.close')}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div
            className="flex-1 overflow-auto p-4 md:p-8 print:p-0 print:overflow-visible"
            onClick={(e) => { if (e.target === e.currentTarget) setShowPreview(false); }}
          >
            {/* Fixed A4-ish width so the outer container scrolls left/right on a
                phone instead of clipping the invoice. */}
            <div className="invoice-print-area mx-auto w-[210mm] max-w-none bg-white shadow-xl rounded-lg overflow-hidden print:shadow-none print:rounded-none print:w-auto print:max-w-none">
              <InvoiceTemplate data={preview} />
            </div>
          </div>
        </div>
        </>
      )}
    </div>
  );
}

const inputCls = 'w-full text-sm px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500';
const selectCls = inputCls;

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2 py-0.5">
      <span className="text-slate-500 font-medium w-20 flex-shrink-0">{label}:</span>
      <span className="text-slate-800 font-medium">{value}</span>
    </div>
  );
}

function Field({ label, children, full = false }: { label: React.ReactNode; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={`block ${full ? 'col-span-2' : ''}`}>
      <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">{label}</span>
      {children}
    </label>
  );
}

function VatOverrideBtn({ current, value, label, onClick }: {
  current: 'auto' | 'apply' | 'exempt';
  value: 'auto' | 'apply' | 'exempt';
  label: string;
  onClick: (v: 'auto' | 'apply' | 'exempt') => void;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
        active
          ? 'bg-teal-600 text-white shadow-sm'
          : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
      }`}
    >
      {label}
    </button>
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

function ProductAutocomplete({ value, onChange, onSelect, catalog, inputCls }: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (p: CatalogItem) => void;
  catalog: CatalogItem[];
  inputCls: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(() => {
    if (!catalog.length) return [] as CatalogItem[];
    const q = value.trim().toLowerCase();
    if (!q) return catalog.slice(0, 20);
    const terms = q.split(/\s+/);
    return catalog.filter((p) => {
      const hay = `${p.name} ${p.description ?? ''} ${p.sku ?? ''}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    }).slice(0, 20);
  }, [catalog, value]);

  useEffect(() => {
    function onDocDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, []);

  function pick(p: CatalogItem) {
    onSelect(p);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') {
      if (suggestions[activeIdx]) { e.preventDefault(); pick(suggestions[activeIdx]); }
    }
    else if (e.key === 'Escape') { setOpen(false); }
  }

  const showDropdown = open && suggestions.length > 0;

  return (
    <div ref={wrapRef} className="relative">
      <input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActiveIdx(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={catalog.length ? t('common.descriptionSearchCatalog') : t('common.description')}
        autoComplete="off"
        role="combobox"
        aria-expanded={showDropdown}
        aria-autocomplete="list"
        className={inputCls}
      />
      {showDropdown && (
        <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-72 overflow-auto">
          {suggestions.map((p, idx) => (
            <button
              type="button"
              key={`${p.source}-${p.id}`}
              onMouseDown={(e) => { e.preventDefault(); pick(p); }}
              onMouseEnter={() => setActiveIdx(idx)}
              className={`w-full text-left px-3 py-2 text-sm flex items-start gap-3 border-b border-slate-100 last:border-0 ${idx === activeIdx ? 'bg-teal-50' : 'hover:bg-slate-50'}`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-900 truncate">{p.name || '(pa emer)'}</span>
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${p.source === 'stock' ? 'bg-emerald-100 text-emerald-700' : 'bg-teal-100 text-teal-700'}`}>
                    {p.source === 'stock' ? 'Stoku' : 'Kontabiliteti'}
                  </span>
                </div>
                {(p.description || p.sku) && (
                  <div className="text-xs text-slate-500 truncate">
                    {p.sku && <span className="font-mono">{p.sku}</span>}
                    {p.sku && p.description ? ' · ' : ''}
                    {p.description ?? ''}
                  </div>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-sm font-bold text-slate-800">{formatCurrency(p.price_net, 'EUR')}</div>
                <div className="text-[10px] text-slate-500">{p.unit ?? 'pc'} · TVSH {p.vat_rate}%</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
