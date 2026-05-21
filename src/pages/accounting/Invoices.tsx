import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, X, AlertTriangle, Loader2, CreditCard as Edit2, Printer, ChevronDown, Trash2, FileText, FileCode2, Eye, Truck, PackageCheck, PackageOpen, PackageX, Mail, Send, Bell } from 'lucide-react';
import DocumentPreviewModal from '../../components/accounting/DocumentPreviewModal';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import type {
  AccInvoice,
  AccInvoiceItem,
  AccInvoiceStatus,
  AccInvoiceType,
  AccCurrency,
  AccContact,
  AccProduct,
  AccBankAccount,
} from '../../types/accounting';
import { UNITS, formatCurrency, ACC_CURRENCIES } from '../../types/accounting';
import { useCountryVatRates } from '../../hooks/useCountryVatRates';
import { useCompliance } from '../../hooks/useCompliance';
import { taxAuthority } from '../../lib/complianceEngine';
import { exportXRechnung } from '../../utils/germanCompliance';

type TabFilter = 'all' | AccInvoiceStatus;

interface ItemForm {
  id: string;
  product_id: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  vat_rate: number;
  line_discount: number;
  line_total: number;
}

interface InvoiceForm {
  invoice_type: AccInvoiceType;
  currency: AccCurrency;
  bank_account_id: string;
  contact_id: string;
  invoice_date: string;
  due_date: string;
  discount: number;
  notes: string;
  items: ItemForm[];
}

function emptyItem(defaultVatRate: number = 0): ItemForm {
  return {
    id: crypto.randomUUID(),
    product_id: '',
    description: '',
    quantity: 1,
    unit: 'pcs',
    unit_price: 0,
    vat_rate: defaultVatRate,
    line_discount: 0,
    line_total: 0,
  };
}

const emptyForm: InvoiceForm = {
  invoice_type: 'invoice',
  currency: 'EUR',
  bank_account_id: '',
  contact_id: '',
  invoice_date: new Date().toISOString().slice(0, 10),
  due_date: '',
  discount: 0,
  notes: '',
  items: [emptyItem()],
};

const STATUS_COLORS: Record<AccInvoiceStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  sent: 'bg-blue-100 text-blue-700',
  paid: 'bg-emerald-100 text-emerald-700',
  partial: 'bg-amber-100 text-amber-700',
  overdue: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-200 text-gray-500',
};

const STATUS_LABELS: Record<AccInvoiceStatus, string> = {
  draft: 'Draft',
  sent: 'Derguar',
  paid: 'Paguar',
  partial: 'Pjeserisht',
  overdue: 'Vonuar',
  cancelled: 'Anuluar',
};

type DeliveryStatus = 'none' | 'pending' | 'assigned' | 'in_transit' | 'delivered' | 'cancelled';

const DELIVERY_BADGES: Record<DeliveryStatus, { label: string; className: string }> = {
  none: { label: 'Pa dergese', className: 'bg-slate-100 text-slate-500' },
  pending: { label: 'Ne logjistike', className: 'bg-amber-100 text-amber-700' },
  assigned: { label: 'Caktuar shoferi', className: 'bg-sky-100 text-sky-700' },
  in_transit: { label: 'Ne transit', className: 'bg-blue-100 text-blue-700' },
  delivered: { label: 'Dorezuar', className: 'bg-emerald-100 text-emerald-700' },
  cancelled: { label: 'Anuluar', className: 'bg-slate-200 text-slate-500' },
};

const TAB_FILTERS: { key: TabFilter; label: string }[] = [
  { key: 'all', label: 'Te gjitha' },
  { key: 'draft', label: 'Draft' },
  { key: 'sent', label: 'Derguar' },
  { key: 'paid', label: 'Paguar' },
  { key: 'partial', label: 'Pjeserisht' },
  { key: 'overdue', label: 'Vonuar' },
  { key: 'cancelled', label: 'Anuluar' },
];

function calcLineTotal(item: ItemForm): number {
  const gross = item.quantity * item.unit_price;
  const discounted = gross - (gross * item.line_discount) / 100;
  return Math.round(discounted * 100) / 100;
}

export default function Invoices() {
  const { profile, session } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { rates: vatRates, standardRate: defaultVat } = useCountryVatRates();
  const { ctx: complianceCtx } = useCompliance();
  const complianceAuthority = taxAuthority(complianceCtx);
  const [deliveryPrompt, setDeliveryPrompt] = useState<AccInvoice | null>(null);
  const [creatingDeliveryNote, setCreatingDeliveryNote] = useState(false);

  const [invoices, setInvoices] = useState<AccInvoice[]>([]);
  const [stockStatus, setStockStatus] = useState<Record<string, 'moved' | 'pending' | 'missing'>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [activeTab, setActiveTab] = useState<TabFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState<'' | AccCurrency>('');

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<InvoiceForm>({ ...emptyForm, items: [emptyItem()] });

  const [contacts, setContacts] = useState<AccContact[]>([]);
  const [products, setProducts] = useState<AccProduct[]>([]);
  const [bankAccounts, setBankAccounts] = useState<AccBankAccount[]>([]);
  const [contactSearch, setContactSearch] = useState('');
  const [showContactDropdown, setShowContactDropdown] = useState(false);

  const [emailInvoice, setEmailInvoice] = useState<AccInvoice | null>(null);
  const [emailTo, setEmailTo] = useState('');
  const [emailLocale, setEmailLocale] = useState<'sq' | 'de' | 'en' | 'fr'>('sq');
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const [statusDropdownId, setStatusDropdownId] = useState<string | null>(null);
  const [previewInvoice, setPreviewInvoice] = useState<AccInvoice | null>(null);
  const [previewItems, setPreviewItems] = useState<AccInvoiceItem[]>([]);

  async function openPreview(invoice: AccInvoice) {
    setPreviewInvoice(invoice);
    const { data } = await supabase
      .from('acc_invoice_items')
      .select('*')
      .eq('invoice_id', invoice.id)
      .order('created_at');
    setPreviewItems((data as AccInvoiceItem[]) ?? []);
  }

  useEffect(() => {
    if (profile?.company_id) {
      fetchInvoices();
    }
  }, [profile?.company_id]);


  async function fetchInvoices() {
    try {
      setLoading(true);
      setError(null);
      const { data, error: err } = await supabase
        .from('acc_invoices')
        .select('*, contact:acc_contacts(name), delivery_note:delivery_notes!acc_invoices_delivery_note_fk(id, note_number)')
        .eq('company_id', profile!.company_id!)
        .order('created_at', { ascending: false });
      if (err) throw err;
      const invs = (data ?? []) as AccInvoice[];
      setInvoices(invs);

      const sentIds = invs.filter((i) => i.status !== 'draft' && i.status !== 'cancelled' && i.invoice_type === 'invoice').map((i) => i.id);
      if (sentIds.length > 0) {
        const { data: dns } = await supabase
          .from('delivery_notes')
          .select('id, acc_invoice_id, status, stock_posted')
          .in('acc_invoice_id', sentIds);
        const map: Record<string, 'moved' | 'pending' | 'missing'> = {};
        for (const id of sentIds) {
          const dn = (dns ?? []).find((d: { acc_invoice_id: string; stock_posted: boolean | null }) => d.acc_invoice_id === id);
          if (!dn) {
            map[id] = 'missing';
          } else if (dn.stock_posted) {
            map[id] = 'moved';
          } else {
            map[id] = 'pending';
          }
        }
        setStockStatus(map);
      } else {
        setStockStatus({});
      }
    } catch (err: any) {
      setError(err.message || t('common.errorLoading'));
    } finally {
      setLoading(false);
    }
  }

  async function fetchFormData() {
    if (!profile?.company_id) return;
    const companyId = profile.company_id;
    const [contactsRes, productsRes, bankRes] = await Promise.all([
      supabase
        .from('acc_contacts')
        .select('*')
        .eq('company_id', companyId)
        .in('contact_type', ['customer', 'both'])
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('acc_products')
        .select('*')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('acc_bank_accounts')
        .select('*')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('name'),
    ]);
    setContacts(contactsRes.data ?? []);
    setProducts(productsRes.data ?? []);
    setBankAccounts(bankRes.data ?? []);
  }

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: invoices.length };
    for (const inv of invoices) {
      counts[inv.status] = (counts[inv.status] || 0) + 1;
    }
    return counts;
  }, [invoices]);

  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      if (activeTab !== 'all' && inv.status !== activeTab) return false;
      if (currencyFilter && inv.currency !== currencyFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const haystack = `${inv.invoice_number} ${inv.contact?.name ?? ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [invoices, activeTab, searchQuery, currencyFilter]);

  const runningTotals = useMemo(() => {
    const totals: Partial<Record<AccCurrency, number>> = {};
    for (const inv of filteredInvoices) {
      if (inv.status !== 'cancelled') {
        totals[inv.currency] = (totals[inv.currency] ?? 0) + inv.total;
      }
    }
    return totals;
  }, [filteredInvoices]);

  const filteredContacts = useMemo(() => {
    if (!contactSearch.trim()) return contacts;
    const q = contactSearch.toLowerCase();
    return contacts.filter((c) => c.name.toLowerCase().includes(q));
  }, [contacts, contactSearch]);

  const formSubtotal = useMemo(() => {
    return form.items.reduce((sum, item) => sum + calcLineTotal(item), 0);
  }, [form.items]);

  const formVatGroups = useMemo(() => {
    const groups: Record<number, number> = {};
    for (const item of form.items) {
      const lt = calcLineTotal(item);
      const vatAmount = (lt * item.vat_rate) / 100;
      if (item.vat_rate > 0) {
        groups[item.vat_rate] = (groups[item.vat_rate] || 0) + vatAmount;
      }
    }
    return groups;
  }, [form.items]);

  const formVatTotal = useMemo(() => {
    return Object.values(formVatGroups).reduce((s, v) => s + v, 0);
  }, [formVatGroups]);

  const formDiscountAmount = useMemo(() => {
    return (formSubtotal * form.discount) / 100;
  }, [formSubtotal, form.discount]);

  const formGrandTotal = useMemo(() => {
    return Math.round((formSubtotal - formDiscountAmount + formVatTotal) * 100) / 100;
  }, [formSubtotal, formDiscountAmount, formVatTotal]);

  function openAdd() {
    setEditingId(null);
    setForm({ ...emptyForm, items: [emptyItem(defaultVat)] });
    setContactSearch('');
    fetchFormData();
    setShowModal(true);
  }

  async function openEdit(invoice: AccInvoice) {
    setEditingId(invoice.id);
    await fetchFormData();

    const { data: items } = await supabase
      .from('acc_invoice_items')
      .select('*')
      .eq('invoice_id', invoice.id)
      .order('created_at');

    const mappedItems: ItemForm[] = (items ?? []).map((it: AccInvoiceItem) => ({
      id: it.id,
      product_id: it.product_id || '',
      description: it.description,
      quantity: it.quantity,
      unit: it.unit,
      unit_price: it.unit_price,
      vat_rate: it.vat_rate,
      line_discount: it.line_discount,
      line_total: it.line_total,
    }));

    setForm({
      invoice_type: invoice.invoice_type,
      currency: invoice.currency,
      bank_account_id: invoice.bank_account_id || '',
      contact_id: invoice.contact_id || '',
      invoice_date: invoice.invoice_date,
      due_date: invoice.due_date || '',
      discount: invoice.discount,
      notes: invoice.notes,
      items: mappedItems.length > 0 ? mappedItems : [emptyItem(defaultVat)],
    });

    const selectedContact = contacts.find((c) => c.id === invoice.contact_id);
    setContactSearch(selectedContact?.name || '');
    setShowModal(true);
  }

  function updateItem(idx: number, field: keyof ItemForm, value: string | number) {
    setForm((prev) => {
      const items = [...prev.items];
      items[idx] = { ...items[idx], [field]: value };
      items[idx].line_total = calcLineTotal(items[idx]);
      return { ...prev, items };
    });
  }

  function selectProduct(idx: number, productId: string) {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    setForm((prev) => {
      const items = [...prev.items];
      items[idx] = {
        ...items[idx],
        product_id: product.id,
        description: product.name,
        unit: product.unit,
        unit_price: product.price_net,
        vat_rate: product.vat_rate,
      };
      items[idx].line_total = calcLineTotal(items[idx]);
      return { ...prev, items };
    });
  }

  function addItem() {
    setForm((prev) => ({ ...prev, items: [...prev.items, emptyItem(defaultVat)] }));
  }

  function removeItem(idx: number) {
    if (form.items.length <= 1) return;
    setForm((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));
  }

  async function handleSave() {
    if (!form.contact_id) {
      setError('Zgjidhni nje klient');
      return;
    }
    if (form.items.every((it) => !it.description.trim())) {
      setError('Shtoni te pakten nje artikull');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const companyId = profile!.company_id!;

      const subtotal = formSubtotal;
      const vatAmount = formVatTotal;
      const total = formGrandTotal;
      let insertedInvoice: AccInvoice | null = null;

      if (editingId) {
        const { error: updateErr } = await supabase
          .from('acc_invoices')
          .update({
            invoice_type: form.invoice_type,
            currency: form.currency,
            bank_account_id: form.bank_account_id || null,
            contact_id: form.contact_id || null,
            invoice_date: form.invoice_date,
            due_date: form.due_date || null,
            discount: form.discount,
            notes: form.notes,
            subtotal,
            vat_amount: vatAmount,
            total,
          })
          .eq('id', editingId);
        if (updateErr) throw updateErr;

        await supabase.from('acc_invoice_items').delete().eq('invoice_id', editingId);

        const itemsPayload = form.items
          .filter((it) => it.description.trim())
          .map((it) => ({
            invoice_id: editingId,
            product_id: it.product_id || null,
            description: it.description,
            quantity: it.quantity,
            unit: it.unit,
            unit_price: it.unit_price,
            vat_rate: it.vat_rate,
            line_discount: it.line_discount,
            line_total: calcLineTotal(it),
          }));

        if (itemsPayload.length > 0) {
          const { error: itemsErr } = await supabase.from('acc_invoice_items').insert(itemsPayload);
          if (itemsErr) throw itemsErr;
        }
      } else {
        let invoiceNumber = '';
        try {
          const { data: rpcData } = await supabase.rpc('get_next_acc_number', {
            p_company_id: companyId,
            p_prefix: 'RE',
          });
          invoiceNumber = rpcData || `INV-${Date.now()}`;
        } catch {
          invoiceNumber = `INV-${Date.now()}`;
        }

        const { data: newInvoice, error: insertErr } = await supabase
          .from('acc_invoices')
          .insert({
            company_id: companyId,
            created_by: session!.user.id,
            invoice_type: form.invoice_type,
            invoice_number: invoiceNumber,
            currency: form.currency,
            bank_account_id: form.bank_account_id || null,
            contact_id: form.contact_id || null,
            invoice_date: form.invoice_date,
            due_date: form.due_date || null,
            status: 'draft' as AccInvoiceStatus,
            discount: form.discount,
            notes: form.notes,
            subtotal,
            vat_amount: vatAmount,
            total,
          })
          .select('*, contact:acc_contacts(name)')
          .single();
        if (insertErr) throw insertErr;
        insertedInvoice = newInvoice as AccInvoice;

        const itemsPayload = form.items
          .filter((it) => it.description.trim())
          .map((it) => ({
            invoice_id: newInvoice.id,
            product_id: it.product_id || null,
            description: it.description,
            quantity: it.quantity,
            unit: it.unit,
            unit_price: it.unit_price,
            vat_rate: it.vat_rate,
            line_discount: it.line_discount,
            line_total: calcLineTotal(it),
          }));

        if (itemsPayload.length > 0) {
          const { error: itemsErr } = await supabase.from('acc_invoice_items').insert(itemsPayload);
          if (itemsErr) throw itemsErr;
        }
      }

      const wasNew = !editingId;

      setShowModal(false);
      setEditingId(null);
      await fetchInvoices();

      if (wasNew && insertedInvoice) {
        setDeliveryPrompt(insertedInvoice);
      }
    } catch (err: any) {
      setError(err.message || t('common.errorSaving'));
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(invoice: AccInvoice, newStatus: AccInvoiceStatus) {
    try {
      setError(null);
      setStatusDropdownId(null);

      // Route draft → sent through the email modal so the customer actually
      // receives the invoice. The send-invoice-email edge function flips
      // status to 'sent' and stamps sent_at on success.
      if (newStatus === 'sent' && invoice.status === 'draft') {
        setEmailInvoice(invoice);
        setEmailTo(invoice.contact?.email || '');
        // Seed the locale from the invoice's language_code so a German
        // customer gets the German template by default. Operator can
        // still flip it in the modal.
        const lang = (invoice as { language_code?: string }).language_code;
        if (lang === 'sq' || lang === 'de' || lang === 'en' || lang === 'fr') {
          setEmailLocale(lang);
        }
        setEmailSent(false);
        return;
      }

      const { error: err } = await supabase
        .from('acc_invoices')
        .update({ status: newStatus })
        .eq('id', invoice.id);
      if (err) throw err;

      if (newStatus === 'paid') {
        // Convert to EUR before persisting so the dashboard's revenue
        // tile can sum cross-currency invoices without lying. Falls
        // back to 1 if the invoice was already in EUR or has no rate.
        const fx = Number(
          (invoice as { exchange_rate_to_eur?: number }).exchange_rate_to_eur ??
          (invoice as { exchange_rate?: number }).exchange_rate ?? 1
        );
        const amountEur = Number(invoice.total ?? 0) * (fx > 0 ? fx : 1);
        await supabase.from('acc_transactions').insert({
          company_id: profile!.company_id!,
          transaction_type: 'income',
          contact_id: invoice.contact_id,
          invoice_id: invoice.id,
          bank_account_id: invoice.bank_account_id,
          amount: amountEur,
          currency: 'EUR',
          description: `Pagese per faturen ${invoice.invoice_number}`,
          transaction_date: new Date().toISOString().slice(0, 10),
          payment_method: 'bank_transfer',
          reference_number: invoice.invoice_number,
          notes: invoice.currency && invoice.currency !== 'EUR'
            ? `Origjinali: ${invoice.total} ${invoice.currency} @ ${fx}`
            : '',
          created_by: session?.user.id || null,
        });
      }

      await fetchInvoices();
    } catch (err: any) {
      setError(err.message || t('common.error'));
    }
  }


  async function handleXRechnung(invoice: AccInvoice) {
    try {
      if (!profile?.company_id) return;
      const [{ data: items }, { data: contact }, { data: company }] = await Promise.all([
        supabase.from('acc_invoice_items').select('*').eq('invoice_id', invoice.id).order('created_at'),
        invoice.contact_id
          ? supabase.from('acc_contacts').select('*').eq('id', invoice.contact_id).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from('companies').select('name, vat_number, tax_number, address, city, postal_code, country, email').eq('id', profile.company_id).maybeSingle(),
      ]);
      const fullInvoice = { ...invoice, items: (items as AccInvoiceItem[]) ?? [], contact: (contact as AccContact) ?? undefined };
      exportXRechnung(fullInvoice, company ?? { name: 'Company' });
    } catch (err: any) {
      setError(err.message || 'Gabim ne eksport XRechnung');
    }
  }

  function handlePrintPreview(invoice: AccInvoice) {
    const base = typeof window !== 'undefined' && window.location.pathname.startsWith('/company') ? '/company' : '/accounting';
    navigate(`${base}/invoices/${invoice.id}/print`);
  }

  async function createLinkedDeliveryNote(invoice: AccInvoice) {
    if (!profile?.company_id) return;
    try {
      setCreatingDeliveryNote(true);
      setError(null);
      const companyId = profile.company_id;

      const { data: items } = await supabase
        .from('acc_invoice_items')
        .select('*')
        .eq('invoice_id', invoice.id)
        .order('created_at');

      const { data: contact } = invoice.contact_id
        ? await supabase
            .from('acc_contacts')
            .select('id, name, address, city, postal_code, country')
            .eq('id', invoice.contact_id)
            .maybeSingle()
        : { data: null };

      const shippingAddress = contact
        ? [contact.address, [contact.postal_code, contact.city].filter(Boolean).join(' '), contact.country].filter(Boolean).join(', ')
        : '';

      let noteNumber = '';
      try {
        const { data: rpcData } = await supabase.rpc('get_next_acc_number', {
          p_company_id: companyId,
          p_prefix: 'LS',
        });
        noteNumber = rpcData || `LS-${Date.now()}`;
      } catch {
        noteNumber = `LS-${Date.now()}`;
      }

      const { data: newNote, error: noteErr } = await supabase
        .from('acc_delivery_notes')
        .insert({
          company_id: companyId,
          created_by: profile.id,
          contact_id: invoice.contact_id || null,
          note_number: noteNumber,
          note_date: invoice.invoice_date,
          status: 'draft',
          direction: 'outgoing',
          shipping_address: shippingAddress,
          notes: `Lidhur me faturen ${invoice.invoice_number}`,
          invoice_id: invoice.id,
        })
        .select()
        .single();
      if (noteErr) throw noteErr;

      if (items && items.length > 0 && newNote) {
        const itemsPayload = items.map((it: any) => ({
          delivery_note_id: newNote.id,
          product_id: it.product_id || null,
          description: it.description,
          quantity: it.quantity,
          unit: it.unit,
          unit_price: it.unit_price,
          vat_rate: it.vat_rate,
          line_total: it.line_total,
        }));
        await supabase.from('acc_delivery_note_items').insert(itemsPayload);
      }

      if (contact) {
        await supabase.from('delivery_notes').insert({
          company_id: companyId,
          created_by: profile.id,
          note_number: noteNumber,
          type: 'delivery',
          status: 'draft',
          partner_id: contact.id,
          partner_name: contact.name,
          delivery_address: shippingAddress,
          notes: `Lidhur me faturen ${invoice.invoice_number}`,
        });
      }

      setDeliveryPrompt(null);
      navigate(`/accounting/delivery-notes`);
    } catch (err: any) {
      setError(err.message || 'Gabim gjate krijimit te fletedergeses');
    } finally {
      setCreatingDeliveryNote(false);
    }
  }

  function getStatusActions(status: AccInvoiceStatus): { label: string; value: AccInvoiceStatus }[] {
    switch (status) {
      case 'draft':
        return [{ label: 'Dergo', value: 'sent' }];
      case 'sent':
        return [
          { label: 'Sheno si Paguar', value: 'paid' },
          { label: 'Pjeserisht', value: 'partial' },
          { label: 'Vonuar', value: 'overdue' },
          { label: 'Anulo', value: 'cancelled' },
        ];
      case 'partial':
        return [
          { label: 'Sheno si Paguar', value: 'paid' },
          { label: 'Vonuar', value: 'overdue' },
          { label: 'Anulo', value: 'cancelled' },
        ];
      case 'overdue':
        return [
          { label: 'Sheno si Paguar', value: 'paid' },
          { label: 'Anulo', value: 'cancelled' },
        ];
      default:
        return [];
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-12 h-12 text-emerald-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Faturat</h1>
          <p className="text-gray-500 mt-1">Menaxhoni faturat e shitjes</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={typeof window !== 'undefined' && window.location.pathname.startsWith('/company') ? '/company/invoices/new' : '/accounting/invoices/new'}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-semibold shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Fature EU (e re)
          </a>
          <button
            onClick={openAdd}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium"
          >
            Modeli klasik
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-red-700 text-sm">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="flex items-center gap-1 px-4 pt-4 overflow-x-auto">
          {TAB_FILTERS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
                activeTab === tab.key
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {tab.label}
              {(statusCounts[tab.key] || 0) > 0 && (
                <span
                  className={`inline-flex items-center justify-center px-2 py-0.5 text-xs font-semibold rounded-full ${
                    activeTab === tab.key ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {statusCounts[tab.key] || 0}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 px-4 py-4 border-t border-gray-50">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('accounting.invoices.searchPlaceholder')}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
            />
          </div>
          <select
            value={currencyFilter}
            onChange={(e) => setCurrencyFilter(e.target.value as '' | AccCurrency)}
            className="px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm bg-white"
          >
            <option value="">Te gjitha monedhat</option>
            {ACC_CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {filteredInvoices.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 py-16 text-center">
          <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <p className="text-gray-500 text-sm">Nuk u gjet asnje fature</p>
          <p className="text-gray-400 text-xs mt-1">Krijoni faturen e pare per te filluar</p>
        </div>
      ) : (
        <>
          <div className="hidden lg:block bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Nr. Fatures</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Klienti</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Data</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Afati</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Monedha</th>
                    <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Totali</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Statusi</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Fletedergesa</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Dergesa</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Stok i levizur</th>
                    <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Veprime</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredInvoices.map((invoice) => (
                    <tr key={invoice.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <span className="text-sm font-bold text-gray-900">{invoice.invoice_number}</span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{invoice.contact?.name || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{invoice.invoice_date}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{invoice.due_date || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{invoice.currency}</td>
                      <td className="px-6 py-4 text-sm font-semibold text-gray-900 text-right">
                        {formatCurrency(invoice.total, invoice.currency)}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[invoice.status]}`}
                        >
                          {STATUS_LABELS[invoice.status]}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {invoice.delivery_note?.note_number ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-teal-50 text-teal-700 text-xs font-semibold">
                            #{invoice.delivery_note.note_number}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {(() => {
                          const ds = (invoice.delivery_status ?? 'none') as DeliveryStatus;
                          const cfg = DELIVERY_BADGES[ds] ?? DELIVERY_BADGES.none;
                          return (
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.className}`}
                            >
                              <Truck className="w-3 h-3" />
                              {cfg.label}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-6 py-4">
                        {(() => {
                          if (invoice.invoice_type !== 'invoice' || invoice.status === 'draft' || invoice.status === 'cancelled') {
                            return <span className="text-xs text-gray-400">-</span>;
                          }
                          const s = stockStatus[invoice.id];
                          if (s === 'moved') {
                            return (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-700">
                                <PackageCheck className="w-3 h-3" />
                                Stoku i levizur
                              </span>
                            );
                          }
                          if (s === 'missing') {
                            return (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700" title="Nuk ekziston fletedergese e lidhur">
                                <PackageX className="w-3 h-3" />
                                Pa fletedergese
                              </span>
                            );
                          }
                          return (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                              <PackageOpen className="w-3 h-3" />
                              Fature derguar, malli ne pritje
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-1 relative">
                          <button
                            onClick={() => openPreview(invoice)}
                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Preview"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openEdit(invoice)}
                            className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            title="Ndrysho"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          {getStatusActions(invoice.status).length > 0 && (
                            <div className="relative">
                              <button
                                onClick={() =>
                                  setStatusDropdownId(statusDropdownId === invoice.id ? null : invoice.id)
                                }
                                className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                                title="Ndrysho statusin"
                              >
                                <ChevronDown className="w-4 h-4" />
                              </button>
                              {statusDropdownId === invoice.id && (
                                <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20 min-w-[160px]">
                                  {getStatusActions(invoice.status).map((action) => (
                                    <button
                                      key={action.value}
                                      onClick={() => handleStatusChange(invoice, action.value)}
                                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                                    >
                                      {action.label}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                          <button
                            onClick={() => handleXRechnung(invoice)}
                            className="p-2 text-gray-400 hover:text-teal-700 hover:bg-teal-50 rounded-lg transition-colors"
                            title="Eksporto XRechnung (XML)"
                          >
                            <FileCode2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handlePrintPreview(invoice)}
                            className="p-2 text-gray-400 hover:text-slate-700 hover:bg-slate-50 rounded-lg transition-colors"
                            title="Printo"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          {invoice.status !== 'draft' && invoice.status !== 'cancelled' && (
                            <button
                              onClick={() => {
                                setEmailInvoice(invoice);
                                setEmailTo(invoice.contact?.email || '');
                                const lng = (invoice as { language_code?: string }).language_code;
                                if (lng === 'sq' || lng === 'de' || lng === 'en' || lng === 'fr') setEmailLocale(lng);
                                setEmailSent(false);
                              }}
                              className="p-2 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                              title="Dergo me email"
                            >
                              <Mail className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="border-t border-gray-100 px-6 py-3 flex items-center justify-end gap-6">
              {Object.entries(runningTotals).map(([cur, amount]) =>
                amount && amount > 0 ? (
                  <span key={cur} className="text-sm font-semibold text-gray-700">
                    Totali {cur}: {formatCurrency(amount, cur as AccCurrency)}
                  </span>
                ) : null
              )}
            </div>
          </div>

          <div className="lg:hidden space-y-3">
            {filteredInvoices.map((invoice) => (
              <div key={invoice.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-sm font-bold text-gray-900">{invoice.invoice_number}</p>
                    <p className="text-sm text-gray-600 mt-0.5">{invoice.contact?.name || '-'}</p>
                  </div>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[invoice.status]}`}
                  >
                    {STATUS_LABELS[invoice.status]}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">{invoice.invoice_date}</span>
                  <span className="font-semibold text-gray-900">
                    {formatCurrency(invoice.total, invoice.currency)}
                  </span>
                </div>
                {invoice.invoice_type === 'invoice' && invoice.status !== 'draft' && invoice.status !== 'cancelled' && (
                  <div className="mt-2">
                    {(() => {
                      const s = stockStatus[invoice.id];
                      if (s === 'moved') {
                        return (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-700">
                            <PackageCheck className="w-3 h-3" />
                            Stoku i levizur
                          </span>
                        );
                      }
                      if (s === 'missing') {
                        return (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                            <PackageX className="w-3 h-3" />
                            Pa fletedergese
                          </span>
                        );
                      }
                      return (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                          <PackageOpen className="w-3 h-3" />
                          Malli ne pritje
                        </span>
                      );
                    })()}
                  </div>
                )}
                <div className="flex items-center justify-end gap-1 mt-3 pt-3 border-t border-gray-50">
                  <button
                    onClick={() => openPreview(invoice)}
                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => openEdit(invoice)}
                    className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handlePrintPreview(invoice)}
                    className="p-2 text-gray-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
                  >
                    <Printer className="w-4 h-4" />
                  </button>
                  {invoice.status !== 'draft' && invoice.status !== 'cancelled' && (
                    <button
                      onClick={() => {
                        setEmailInvoice(invoice);
                        setEmailTo(invoice.contact?.email || '');
                        setEmailSent(false);
                      }}
                      className="p-2 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                    >
                      <Mail className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center justify-end gap-6">
              {Object.entries(runningTotals).map(([cur, amount]) =>
                amount && amount > 0 ? (
                  <span key={cur} className="text-sm font-semibold text-gray-700">
                    {cur}: {formatCurrency(amount, cur as AccCurrency)}
                  </span>
                ) : null
              )}
            </div>
          </div>
        </>
      )}

      {previewInvoice && (
        <DocumentPreviewModal
          title={`Fature ${previewInvoice.invoice_number}`}
          subtitle={previewInvoice.invoice_type === 'credit_note' ? 'Note Krediti' : previewInvoice.invoice_type === 'proforma' ? 'Proforme' : 'Fature dalese'}
          statusLabel={STATUS_LABELS[previewInvoice.status]}
          statusClass={STATUS_COLORS[previewInvoice.status]}
          accentColor="teal"
          fields={[
            { label: 'Klienti', value: previewInvoice.contact?.name },
            { label: 'Data', value: previewInvoice.invoice_date },
            { label: 'Afati', value: previewInvoice.due_date },
            { label: 'Monedha', value: previewInvoice.currency },
          ]}
          items={previewItems.map((it) => ({
            description: it.description,
            quantity: it.quantity,
            unit: it.unit,
            unit_price: it.unit_price,
            vat_rate: it.vat_rate,
            line_total: it.line_total,
          }))}
          totals={[
            { label: 'Nentotali', value: formatCurrency(previewInvoice.subtotal, previewInvoice.currency) },
            { label: 'TVSH', value: formatCurrency(previewInvoice.vat_amount, previewInvoice.currency) },
            { label: 'Totali', value: formatCurrency(previewInvoice.total, previewInvoice.currency), strong: true },
          ]}
          notes={previewInvoice.notes || undefined}
          documentUrl={(previewInvoice as any).document_url || undefined}
          documentMime={(previewInvoice as any).document_mime || undefined}
          onClose={() => { setPreviewInvoice(null); setPreviewItems([]); }}
          onPrint={() => handlePrintPreview(previewInvoice)}
        />
      )}


      {deliveryPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => !creatingDeliveryNote && setDeliveryPrompt(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-teal-50 rounded-xl">
                  <Truck className="w-6 h-6 text-teal-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Krijo Fletedergese?</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Fatura {deliveryPrompt.invoice_number} u ruajt me sukses.</p>
                </div>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed">
                Deshironi te krijoni automatikisht nje fletedergese per kete fature? Fletedergesa do te lidhet me faturen, do te kete te njejtat artikuj dhe mund ti dergohet shoferit ose puntoreve te depos per ekzekutimin e dergeses.
              </p>
              <p className="text-xs text-gray-500 mt-3 italic">
                Shenim: Vetem fletedergesa mund ti dergohet shoferit/depos. Fatura eshte dokument financiar dhe nuk del nga moduli i kontabilitetit.
              </p>
            </div>
            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
              <button
                onClick={() => setDeliveryPrompt(null)}
                disabled={creatingDeliveryNote}
                className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-50"
              >
                Jo, me vone
              </button>
              <button
                onClick={() => createLinkedDeliveryNote(deliveryPrompt)}
                disabled={creatingDeliveryNote}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50"
              >
                {creatingDeliveryNote ? <Loader2 className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />}
                Po, Krijo Fletedergese
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-start justify-center min-h-screen px-4 pt-8 pb-20">
            <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={() => setShowModal(false)} />
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between p-6 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900">
                  {editingId ? 'Ndrysho Faturen' : 'Krijo Fature te Re'}
                </h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              {complianceCtx?.country_code && (
                <div className="px-6 py-2 bg-emerald-50 border-b border-emerald-100 text-xs text-emerald-800">
                  Faturim sipas: {complianceCtx.country_name || complianceCtx.country_code}
                  {complianceAuthority?.name ? ` — ${complianceAuthority.name}` : ''}
                </div>
              )}

              <div className="p-6 space-y-6 overflow-y-auto flex-1">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Lloji i fatures</label>
                    <select
                      value={form.invoice_type}
                      onChange={(e) => setForm({ ...form, invoice_type: e.target.value as AccInvoiceType })}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm bg-white"
                    >
                      <option value="invoice">Fature</option>
                      <option value="credit_note">Note Kreditimi</option>
                      <option value="proforma">Proforma</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Monedha</label>
                    <select
                      value={form.currency}
                      onChange={(e) => setForm({ ...form, currency: e.target.value as AccCurrency })}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm bg-white"
                    >
                      {ACC_CURRENCIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Llogaria bankare</label>
                    <select
                      value={form.bank_account_id}
                      onChange={(e) => setForm({ ...form, bank_account_id: e.target.value })}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm bg-white"
                    >
                      <option value="">Zgjidhni llogarine</option>
                      {bankAccounts.map((ba) => (
                        <option key={ba.id} value={ba.id}>
                          {ba.name} ({ba.iban})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="relative">
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Klienti *</label>
                    <input
                      type="text"
                      value={contactSearch}
                      onChange={(e) => {
                        setContactSearch(e.target.value);
                        setShowContactDropdown(true);
                        if (!e.target.value.trim()) {
                          setForm({ ...form, contact_id: '' });
                        }
                      }}
                      onFocus={() => setShowContactDropdown(true)}
                      placeholder={t('companyAdmin.manualEmail.searchClient')}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                    />
                    {showContactDropdown && filteredContacts.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 max-h-48 overflow-y-auto z-30">
                        {filteredContacts.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => {
                              setForm({ ...form, contact_id: c.id });
                              setContactSearch(c.name);
                              setShowContactDropdown(false);
                            }}
                            className={`w-full text-left px-4 py-2.5 text-sm hover:bg-emerald-50 transition-colors ${
                              form.contact_id === c.id ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-gray-700'
                            }`}
                          >
                            <span>{c.name}</span>
                            {c.city && <span className="text-gray-400 ml-2 text-xs">{c.city}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Data e fatures</label>
                    <input
                      type="date"
                      value={form.invoice_date}
                      onChange={(e) => setForm({ ...form, invoice_date: e.target.value })}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Afati i pageses</label>
                    <input
                      type="date"
                      value={form.due_date}
                      onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                    />
                  </div>
                </div>

                <div className="border-t border-gray-100 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-700">Artikujt</h3>
                    <button
                      onClick={addItem}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Shto rresht
                    </button>
                  </div>

                  <div className="space-y-3">
                    {form.items.map((item, idx) => (
                      <div key={item.id} className="bg-gray-50 rounded-xl p-4 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                          <div className="sm:col-span-5">
                            <label className="block text-xs font-medium text-gray-500 mb-1">Produkti / Pershkrimi</label>
                            <div className="space-y-2">
                              <select
                                value={item.product_id}
                                onChange={(e) => {
                                  if (e.target.value) {
                                    selectProduct(idx, e.target.value);
                                  } else {
                                    updateItem(idx, 'product_id', '');
                                  }
                                }}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm bg-white"
                              >
                                <option value="">Zgjidhni produktin ose shkruani</option>
                                {products.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.image_url ? '📦 ' : ''}{p.name} - {formatCurrency(p.price_net)}
                                  </option>
                                ))}
                              </select>
                              <input
                                type="text"
                                value={item.description}
                                onChange={(e) => updateItem(idx, 'description', e.target.value)}
                                placeholder={t('accounting.invoices.itemDescription')}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                              />
                            </div>
                          </div>
                          <div className="sm:col-span-1">
                            <label className="block text-xs font-medium text-gray-500 mb-1">Sasia</label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.quantity}
                              onChange={(e) => updateItem(idx, 'quantity', parseFloat(e.target.value) || 0)}
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                            />
                          </div>
                          <div className="sm:col-span-1">
                            <label className="block text-xs font-medium text-gray-500 mb-1">Njesia</label>
                            <select
                              value={item.unit}
                              onChange={(e) => updateItem(idx, 'unit', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm bg-white"
                            >
                              {UNITS.map((u) => (
                                <option key={u.value} value={u.value}>{u.label}</option>
                              ))}
                            </select>
                          </div>
                          <div className="sm:col-span-1">
                            <label className="block text-xs font-medium text-gray-500 mb-1">Cmimi</label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.unit_price}
                              onChange={(e) => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                            />
                          </div>
                          <div className="sm:col-span-1">
                            <label className="block text-xs font-medium text-gray-500 mb-1">TVSH</label>
                            <select
                              value={item.vat_rate}
                              onChange={(e) => updateItem(idx, 'vat_rate', Number(e.target.value))}
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm bg-white"
                            >
                              {vatRates.map((v) => (
                                <option key={`${v.rate_type}-${v.value}`} value={v.value}>{v.label}</option>
                              ))}
                            </select>
                          </div>
                          <div className="sm:col-span-1">
                            <label className="block text-xs font-medium text-gray-500 mb-1">Zbritje %</label>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.01"
                              value={item.line_discount}
                              onChange={(e) => updateItem(idx, 'line_discount', parseFloat(e.target.value) || 0)}
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                            />
                          </div>
                          <div className="sm:col-span-2 flex items-end gap-2">
                            <div className="flex-1">
                              <label className="block text-xs font-medium text-gray-500 mb-1">Totali</label>
                              <div className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-semibold text-gray-900">
                                {formatCurrency(calcLineTotal(item), form.currency)}
                              </div>
                            </div>
                            {form.items.length > 1 && (
                              <button
                                onClick={() => removeItem(idx)}
                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors mb-0.5"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t border-gray-100 pt-4">
                  <div className="flex flex-col items-end gap-2">
                    <div className="w-full max-w-xs space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">Nentotali:</span>
                        <span className="font-medium text-gray-900">{formatCurrency(formSubtotal, form.currency)}</span>
                      </div>
                      {Object.entries(formVatGroups).map(([rate, amount]) => (
                        <div key={rate} className="flex items-center justify-between text-sm">
                          <span className="text-gray-500">TVSH {rate}%:</span>
                          <span className="font-medium text-gray-900">{formatCurrency(amount, form.currency)}</span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500">Zbritje:</span>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={form.discount}
                            onChange={(e) => setForm({ ...form, discount: parseFloat(e.target.value) || 0 })}
                            className="w-16 px-2 py-1 border border-gray-200 rounded text-xs text-center focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                          <span className="text-gray-400 text-xs">%</span>
                        </div>
                        <span className="font-medium text-red-600">-{formatCurrency(formDiscountAmount, form.currency)}</span>
                      </div>
                      <div className="border-t border-gray-200 pt-2 flex items-center justify-between">
                        <span className="text-sm font-semibold text-gray-700">Totali:</span>
                        <span className="text-lg font-bold text-emerald-700">{formatCurrency(formGrandTotal, form.currency)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t border-gray-100 pt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Shenime</label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm resize-none"
                    placeholder={t('accounting.invoices.extraNotes')}
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-100">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Anulo
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingId ? 'Ruaj Ndryshimet' : 'Krijo Faturen'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {statusDropdownId && (
        <div className="fixed inset-0 z-10" onClick={() => setStatusDropdownId(null)} />
      )}

      {/* Email Send Modal */}
      {emailInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => { if (!emailSending) setEmailInvoice(null); }} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-5 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Send className="w-5 h-5 text-teal-600" />
                Dergo faturen me Email
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                {emailInvoice.invoice_number} - {formatCurrency(emailInvoice.total, emailInvoice.currency)}
              </p>
            </div>
            <div className="p-5 space-y-4">
              {emailSent ? (
                <div className="text-center py-6">
                  <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Mail className="w-6 h-6 text-emerald-600" />
                  </div>
                  <p className="text-lg font-semibold text-gray-900">Email u dergua!</p>
                  <p className="text-sm text-gray-500 mt-1">Fatura PDF u dergua te {emailTo}</p>
                  {emailInvoice.sent_at && (
                    <p className="text-xs text-gray-400 mt-2">
                      Dergimi i pare: {new Date(emailInvoice.sent_at).toLocaleString('de-DE')}
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email i klientit *</label>
                    <input
                      type="email"
                      value={emailTo}
                      onChange={(e) => setEmailTo(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                      placeholder="email@shembull.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Gjuha e email-it</label>
                    <select
                      value={emailLocale}
                      onChange={(e) => setEmailLocale(e.target.value as 'sq' | 'de' | 'en' | 'fr')}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                    >
                      <option value="sq">Shqip</option>
                      <option value="de">Gjermanisht</option>
                      <option value="en">Anglisht</option>
                      <option value="fr">Frengjisht</option>
                    </select>
                  </div>
                  {emailInvoice.sent_at && (
                    <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                      <Bell className="w-4 h-4 flex-shrink-0" />
                      Kjo fature eshte derguar me pare me {new Date(emailInvoice.sent_at).toLocaleDateString('de-DE')}
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100">
              <button
                onClick={() => setEmailInvoice(null)}
                className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                {emailSent ? 'Mbyll' : 'Anulo'}
              </button>
              {!emailSent && (
                <button
                  onClick={async () => {
                    if (!emailTo.trim() || !emailInvoice) return;
                    setEmailSending(true);
                    try {
                      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-invoice-email`;
                      const resp = await fetch(apiUrl, {
                        method: 'POST',
                        headers: {
                          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
                          'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                          invoice_id: emailInvoice.id,
                          recipients: [emailTo.trim()],
                          locale: emailLocale,
                        }),
                      });
                      if (resp.ok) {
                        setEmailSent(true);
                        await fetchInvoices();
                      } else {
                        const err = await resp.json().catch(() => ({}));
                        setError(err.error || 'Dergimi i email-it deshtoi');
                        setEmailInvoice(null);
                      }
                    } catch (e: any) {
                      setError(e.message || 'Gabim gjate dergimit');
                      setEmailInvoice(null);
                    } finally {
                      setEmailSending(false);
                    }
                  }}
                  disabled={emailSending || !emailTo.trim()}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50"
                >
                  {emailSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Dergo me PDF
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
