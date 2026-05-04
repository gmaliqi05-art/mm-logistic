import { useState, useEffect, useMemo } from 'react';
import { Plus, Search, X, AlertTriangle, Loader2, CreditCard as Edit2, Trash2, ShoppingCart, CheckCircle, CreditCard, Ban, FileText, ScanLine, Eye } from 'lucide-react';
import DocumentPreviewModal from '../../components/accounting/DocumentPreviewModal';
import ScanDocumentModal from '../../components/accounting/ScanDocumentModal';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import type {
  AccPurchase,
  AccPurchaseStatus,
  AccContact,
  AccProduct,
  AccBankAccount,
  AccCurrency,
} from '../../types/accounting';
import { VAT_RATES, UNITS, formatCurrency, ACC_CURRENCIES } from '../../types/accounting';

type TabFilter = 'all' | AccPurchaseStatus;

interface PurchaseItemForm {
  id?: string;
  product_id: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  vat_rate: number;
  line_total: number;
}

interface PurchaseForm {
  contact_id: string;
  purchase_date: string;
  due_date: string;
  external_invoice_number: string;
  currency: AccCurrency;
  bank_account_id: string;
  notes: string;
  items: PurchaseItemForm[];
}

const emptyItem: PurchaseItemForm = {
  product_id: '',
  description: '',
  quantity: 1,
  unit: 'pcs',
  unit_price: 0,
  vat_rate: 19,
  line_total: 0,
};

const emptyForm: PurchaseForm = {
  contact_id: '',
  purchase_date: new Date().toISOString().split('T')[0],
  due_date: '',
  external_invoice_number: '',
  currency: 'EUR',
  bank_account_id: '',
  notes: '',
  items: [{ ...emptyItem }],
};

function calcLineTotal(qty: number, price: number, vat: number): number {
  return qty * price * (1 + vat / 100);
}

export default function Purchases() {
  const { profile } = useAuth();
  const { t } = useTranslation();

  const [purchases, setPurchases] = useState<AccPurchase[]>([]);
  const [contacts, setContacts] = useState<AccContact[]>([]);
  const [products, setProducts] = useState<AccProduct[]>([]);
  const [bankAccounts, setBankAccounts] = useState<AccBankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<AccPurchase | null>(null);
  const [form, setForm] = useState<PurchaseForm>(emptyForm);

  const [activeTab, setActiveTab] = useState<TabFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCurrency, setFilterCurrency] = useState<string>('');
  const [scanOpen, setScanOpen] = useState(false);
  const [previewPurchase, setPreviewPurchase] = useState<AccPurchase | null>(null);

  function statusBadge(status: AccPurchaseStatus) {
    const map: Record<AccPurchaseStatus, { bg: string; label: string }> = {
      draft: { bg: 'bg-gray-100 text-gray-700', label: t('accounting.purchases.statusDraft') },
      received: { bg: 'bg-blue-100 text-blue-700', label: t('accounting.purchases.statusReceived') },
      paid: { bg: 'bg-emerald-100 text-emerald-700', label: t('accounting.purchases.statusPaid') },
      overdue: { bg: 'bg-red-100 text-red-700', label: t('accounting.purchases.statusOverdue') },
      cancelled: { bg: 'bg-gray-200 text-gray-500', label: t('accounting.purchases.statusCancelled') },
    };
    const badge = map[status];
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.bg}`}>
        {badge.label}
      </span>
    );
  }

  useEffect(() => {
    if (profile?.company_id) fetchData();
  }, [profile?.company_id]);

  async function fetchData() {
    try {
      setLoading(true);
      setError(null);
      const companyId = profile!.company_id!;

      const [purchasesRes, contactsRes, productsRes, bankRes] = await Promise.all([
        supabase
          .from('acc_purchases')
          .select('*, contact:acc_contacts(id, name), items:acc_purchase_items(*, product:acc_products(id, name))')
          .eq('company_id', companyId)
          .order('created_at', { ascending: false }),
        supabase
          .from('acc_contacts')
          .select('*')
          .eq('company_id', companyId)
          .in('contact_type', ['supplier', 'both'])
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

      if (purchasesRes.error) throw purchasesRes.error;
      if (contactsRes.error) throw contactsRes.error;
      if (productsRes.error) throw productsRes.error;
      if (bankRes.error) throw bankRes.error;

      setPurchases(purchasesRes.data ?? []);
      setContacts(contactsRes.data ?? []);
      setProducts(productsRes.data ?? []);
      setBankAccounts(bankRes.data ?? []);
    } catch (err: any) {
      setError(err.message || t('common.errorLoading'));
    } finally {
      setLoading(false);
    }
  }

  const tabCounts = useMemo(() => {
    const counts: Record<TabFilter, number> = {
      all: purchases.length,
      draft: 0,
      received: 0,
      paid: 0,
      overdue: 0,
      cancelled: 0,
    };
    purchases.forEach((p) => {
      counts[p.status]++;
    });
    return counts;
  }, [purchases]);

  const filteredPurchases = useMemo(() => {
    return purchases.filter((p) => {
      if (activeTab !== 'all' && p.status !== activeTab) return false;
      if (filterCurrency && p.currency !== filterCurrency) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const haystack = `${p.purchase_number} ${p.contact?.name ?? ''} ${p.external_invoice_number ?? ''} ${p.notes ?? ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [purchases, activeTab, searchQuery, filterCurrency]);

  const subtotal = useMemo(() => {
    return form.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  }, [form.items]);

  const vatTotal = useMemo(() => {
    return form.items.reduce((sum, item) => sum + item.quantity * item.unit_price * (item.vat_rate / 100), 0);
  }, [form.items]);

  const grandTotal = useMemo(() => subtotal + vatTotal, [subtotal, vatTotal]);

  function updateItem(index: number, field: keyof PurchaseItemForm, value: string | number) {
    setForm((prev) => {
      const items = [...prev.items];
      const item = { ...items[index], [field]: value };

      if (field === 'product_id' && value) {
        const product = products.find((p) => p.id === value);
        if (product) {
          item.description = product.name;
          item.unit = product.unit;
          item.unit_price = product.price_net;
          item.vat_rate = product.vat_rate;
        }
      }

      item.line_total = calcLineTotal(item.quantity, item.unit_price, item.vat_rate);
      items[index] = item;
      return { ...prev, items };
    });
  }

  function addItem() {
    setForm((prev) => ({ ...prev, items: [...prev.items, { ...emptyItem }] }));
  }

  function removeItem(index: number) {
    setForm((prev) => {
      if (prev.items.length <= 1) return prev;
      return { ...prev, items: prev.items.filter((_, i) => i !== index) };
    });
  }

  function openCreate() {
    setEditingPurchase(null);
    setForm(emptyForm);
    setShowModal(true);
  }

  function openEdit(purchase: AccPurchase) {
    setEditingPurchase(purchase);
    setForm({
      contact_id: purchase.contact_id || '',
      purchase_date: purchase.purchase_date,
      due_date: purchase.due_date || '',
      external_invoice_number: purchase.external_invoice_number || '',
      currency: purchase.currency,
      bank_account_id: purchase.bank_account_id || '',
      notes: purchase.notes || '',
      items: purchase.items && purchase.items.length > 0
        ? purchase.items.map((item) => ({
            id: item.id,
            product_id: item.product_id || '',
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            unit_price: item.unit_price,
            vat_rate: item.vat_rate,
            line_total: item.line_total,
          }))
        : [{ ...emptyItem }],
    });
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingPurchase(null);
    setForm(emptyForm);
  }

  async function handleSave() {
    if (!form.contact_id) {
      setError(t('accounting.purchases.errSelectSupplier'));
      return;
    }
    if (form.items.length === 0 || form.items.every((i) => !i.description.trim())) {
      setError(t('accounting.purchases.errAddItem'));
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const companyId = profile!.company_id!;

      const calcSubtotal = form.items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
      const calcVat = form.items.reduce((s, i) => s + i.quantity * i.unit_price * (i.vat_rate / 100), 0);
      const calcTotal = calcSubtotal + calcVat;

      if (editingPurchase) {
        const { error: updateErr } = await supabase
          .from('acc_purchases')
          .update({
            contact_id: form.contact_id || null,
            purchase_date: form.purchase_date,
            due_date: form.due_date || null,
            external_invoice_number: form.external_invoice_number,
            currency: form.currency,
            bank_account_id: form.bank_account_id || null,
            notes: form.notes,
            subtotal: calcSubtotal,
            vat_amount: calcVat,
            total: calcTotal,
          })
          .eq('id', editingPurchase.id);
        if (updateErr) throw updateErr;

        const { error: delErr } = await supabase
          .from('acc_purchase_items')
          .delete()
          .eq('purchase_id', editingPurchase.id);
        if (delErr) throw delErr;

        const itemsPayload = form.items
          .filter((i) => i.description.trim())
          .map((i) => ({
            purchase_id: editingPurchase.id,
            product_id: i.product_id || null,
            description: i.description,
            quantity: i.quantity,
            unit: i.unit,
            unit_price: i.unit_price,
            vat_rate: i.vat_rate,
            line_total: calcLineTotal(i.quantity, i.unit_price, i.vat_rate),
          }));

        if (itemsPayload.length > 0) {
          const { error: itemsErr } = await supabase.from('acc_purchase_items').insert(itemsPayload);
          if (itemsErr) throw itemsErr;
        }
      } else {
        const { data: numData, error: numErr } = await supabase.rpc('get_next_acc_number', {
          p_company_id: companyId,
          p_prefix: 'BL',
        });
        if (numErr) throw numErr;

        const { data: newPurchase, error: insertErr } = await supabase
          .from('acc_purchases')
          .insert({
            company_id: companyId,
            created_by: profile!.id,
            contact_id: form.contact_id || null,
            purchase_number: numData,
            purchase_date: form.purchase_date,
            due_date: form.due_date || null,
            status: 'draft',
            subtotal: calcSubtotal,
            vat_amount: calcVat,
            total: calcTotal,
            currency: form.currency,
            notes: form.notes,
            external_invoice_number: form.external_invoice_number,
            bank_account_id: form.bank_account_id || null,
          })
          .select()
          .single();
        if (insertErr) throw insertErr;

        const itemsPayload = form.items
          .filter((i) => i.description.trim())
          .map((i) => ({
            purchase_id: newPurchase.id,
            product_id: i.product_id || null,
            description: i.description,
            quantity: i.quantity,
            unit: i.unit,
            unit_price: i.unit_price,
            vat_rate: i.vat_rate,
            line_total: calcLineTotal(i.quantity, i.unit_price, i.vat_rate),
          }));

        if (itemsPayload.length > 0) {
          const { error: itemsErr } = await supabase.from('acc_purchase_items').insert(itemsPayload);
          if (itemsErr) throw itemsErr;
        }
      }

      closeModal();
      await fetchData();
    } catch (err: any) {
      setError(err.message || t('common.errorSaving'));
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(purchase: AccPurchase, newStatus: AccPurchaseStatus) {
    try {
      setError(null);
      const companyId = profile!.company_id!;

      const { error: statusErr } = await supabase
        .from('acc_purchases')
        .update({ status: newStatus })
        .eq('id', purchase.id);
      if (statusErr) throw statusErr;

      if (newStatus === 'paid') {
        const { error: txnErr } = await supabase.from('acc_transactions').insert({
          company_id: companyId,
          transaction_type: 'expense',
          contact_id: purchase.contact_id,
          purchase_id: purchase.id,
          bank_account_id: purchase.bank_account_id,
          amount: purchase.total,
          currency: purchase.currency,
          description: `${t('accounting.purchases.previewTitlePrefix')} ${purchase.purchase_number}`,
          transaction_date: new Date().toISOString().split('T')[0],
          payment_method: 'bank_transfer',
          created_by: profile!.id,
        });
        if (txnErr) throw txnErr;
      }

      await fetchData();
    } catch (err: any) {
      setError(err.message || t('common.error'));
    }
  }

  const tabs: { key: TabFilter; label: string }[] = [
    { key: 'all', label: t('accounting.purchases.tabAll') },
    { key: 'draft', label: t('accounting.purchases.tabDraft') },
    { key: 'received', label: t('accounting.purchases.tabReceived') },
    { key: 'paid', label: t('accounting.purchases.tabPaid') },
    { key: 'overdue', label: t('accounting.purchases.tabOverdue') },
    { key: 'cancelled', label: t('accounting.purchases.tabCancelled') },
  ];

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
          <h1 className="text-2xl font-bold text-gray-900">{t('accounting.purchases.title')}</h1>
          <p className="text-gray-500 mt-1">{t('accounting.purchases.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setScanOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium text-sm"
          >
            <ScanLine className="w-4 h-4" />
            {t('accounting.purchases.scanDocument')}
          </button>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium text-sm"
          >
            <Plus className="w-4 h-4" />
            {t('accounting.purchases.createPurchase')}
          </button>
        </div>
      </div>
      {previewPurchase && (
        <DocumentPreviewModal
          title={`${t('accounting.purchases.previewTitlePrefix')} ${previewPurchase.purchase_number}`}
          subtitle={t('accounting.purchases.previewSubtitle')}
          statusLabel={previewPurchase.status}
          accentColor="emerald"
          fields={[
            { label: t('accounting.purchases.previewSupplier'), value: previewPurchase.contact?.name },
            { label: t('accounting.purchases.previewExtInv'), value: previewPurchase.external_invoice_number },
            { label: t('accounting.purchases.previewDate'), value: previewPurchase.purchase_date },
            { label: t('accounting.purchases.previewDueDate'), value: previewPurchase.due_date },
            { label: t('accounting.purchases.previewCurrency'), value: previewPurchase.currency },
          ]}
          items={(previewPurchase.items || []).map((it: any) => ({
            description: it.description || it.product?.name,
            quantity: it.quantity,
            unit: it.unit,
            unit_price: it.unit_price,
            vat_rate: it.vat_rate,
            line_total: it.line_total,
          }))}
          totals={[
            { label: t('accounting.purchases.previewSubtotal'), value: formatCurrency(previewPurchase.subtotal, previewPurchase.currency) },
            { label: t('accounting.purchases.previewVat'), value: formatCurrency(previewPurchase.vat_amount, previewPurchase.currency) },
            { label: t('accounting.purchases.previewTotal'), value: formatCurrency(previewPurchase.total, previewPurchase.currency), strong: true },
          ]}
          notes={previewPurchase.notes || undefined}
          documentUrl={(previewPurchase as any).document_url || undefined}
          documentMime={(previewPurchase as any).document_mime || undefined}
          onClose={() => setPreviewPurchase(null)}
        />
      )}

      {scanOpen && (
        <ScanDocumentModal
          initialKind="purchase"
          onClose={() => setScanOpen(false)}
          onSaved={() => {
            setScanOpen(false);
            fetchData();
          }}
        />
      )}

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
        <div className="flex overflow-x-auto border-b border-gray-100">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-emerald-600 text-emerald-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
              <span
                className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-semibold ${
                  activeTab === tab.key ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {tabCounts[tab.key]}
              </span>
            </button>
          ))}
        </div>

        <div className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('accounting.purchases.searchPlaceholder')}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
              />
            </div>
            <select
              value={filterCurrency}
              onChange={(e) => setFilterCurrency(e.target.value)}
              className="px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm bg-white"
            >
              <option value="">{t('accounting.purchases.allCurrencies')}</option>
              {ACC_CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {filteredPurchases.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 py-16 text-center">
          <ShoppingCart className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <p className="text-gray-500 text-sm">{t('accounting.purchases.noPurchases')}</p>
          <p className="text-gray-400 text-xs mt-1">{t('accounting.purchases.noPurchasesHint')}</p>
        </div>
      ) : (
        <>
          <div className="hidden lg:block bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('accounting.purchases.colNumber')}</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('accounting.purchases.colSupplier')}</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('accounting.purchases.colDate')}</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('accounting.purchases.colDueDate')}</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('accounting.purchases.colExtNumber')}</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('accounting.purchases.colCurrency')}</th>
                    <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('accounting.purchases.colTotal')}</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('accounting.purchases.colStatus')}</th>
                    <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('accounting.purchases.colActions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredPurchases.map((purchase) => (
                    <tr key={purchase.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center">
                            <FileText className="w-4 h-4 text-emerald-600" />
                          </div>
                          <span className="text-sm font-medium text-gray-900">{purchase.purchase_number}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{purchase.contact?.name || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{purchase.purchase_date}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{purchase.due_date || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{purchase.external_invoice_number || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{purchase.currency}</td>
                      <td className="px-6 py-4 text-sm font-semibold text-gray-900 text-right">
                        {formatCurrency(purchase.total, purchase.currency)}
                      </td>
                      <td className="px-6 py-4">{statusBadge(purchase.status)}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setPreviewPurchase(purchase)}
                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title={t('accounting.purchases.actionPreview')}
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {purchase.status === 'draft' && (
                            <>
                              <button
                                onClick={() => openEdit(purchase)}
                                className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                title={t('accounting.purchases.actionEdit')}
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleStatusChange(purchase, 'received')}
                                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title={t('accounting.purchases.actionReceive')}
                              >
                                <CheckCircle className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          {purchase.status === 'received' && (
                            <>
                              <button
                                onClick={() => handleStatusChange(purchase, 'paid')}
                                className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                title={t('accounting.purchases.actionPay')}
                              >
                                <CreditCard className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleStatusChange(purchase, 'cancelled')}
                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title={t('accounting.purchases.actionCancel')}
                              >
                                <Ban className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          {purchase.status === 'draft' && (
                            <button
                              onClick={() => handleStatusChange(purchase, 'cancelled')}
                              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title={t('accounting.purchases.actionCancel')}
                            >
                              <Ban className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="lg:hidden space-y-3">
            {filteredPurchases.map((purchase) => (
              <div key={purchase.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                      <FileText className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">{purchase.purchase_number}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">{purchase.contact?.name || '-'}</p>
                    </div>
                  </div>
                  {statusBadge(purchase.status)}
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="space-y-1">
                    <p className="text-gray-500">{purchase.purchase_date}</p>
                    {purchase.external_invoice_number && (
                      <p className="text-gray-400 text-xs">Ext: {purchase.external_invoice_number}</p>
                    )}
                  </div>
                  <p className="font-semibold text-gray-900">{formatCurrency(purchase.total, purchase.currency)}</p>
                </div>
                <div className="flex items-center justify-end gap-1 mt-3 pt-3 border-t border-gray-100">
                  <button
                    onClick={() => setPreviewPurchase(purchase)}
                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  {purchase.status === 'draft' && (
                    <>
                      <button
                        onClick={() => openEdit(purchase)}
                        className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleStatusChange(purchase, 'received')}
                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <CheckCircle className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  {purchase.status === 'received' && (
                    <>
                      <button
                        onClick={() => handleStatusChange(purchase, 'paid')}
                        className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                      >
                        <CreditCard className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleStatusChange(purchase, 'cancelled')}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Ban className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  {purchase.status === 'draft' && (
                    <button
                      onClick={() => handleStatusChange(purchase, 'cancelled')}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Ban className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20">
            <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={closeModal} />
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between p-6 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900">
                  {editingPurchase
                    ? `${t('accounting.purchases.editPrefix')} ${editingPurchase.purchase_number}`
                    : t('accounting.purchases.newPurchaseTitle')}
                </h2>
                <button
                  onClick={closeModal}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-6 overflow-y-auto flex-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('accounting.purchases.supplierLabel')} *</label>
                    <select
                      value={form.contact_id}
                      onChange={(e) => setForm((prev) => ({ ...prev, contact_id: e.target.value }))}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm bg-white"
                    >
                      <option value="">{t('accounting.purchases.selectSupplier')}</option>
                      {contacts.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('accounting.purchases.purchaseDateLabel')}</label>
                    <input
                      type="date"
                      value={form.purchase_date}
                      onChange={(e) => setForm((prev) => ({ ...prev, purchase_date: e.target.value }))}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('accounting.purchases.dueDateLabel')}</label>
                    <input
                      type="date"
                      value={form.due_date}
                      onChange={(e) => setForm((prev) => ({ ...prev, due_date: e.target.value }))}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('accounting.purchases.extNumberLabel')}</label>
                    <input
                      type="text"
                      value={form.external_invoice_number}
                      onChange={(e) => setForm((prev) => ({ ...prev, external_invoice_number: e.target.value }))}
                      placeholder={t('accounting.purchases.extNumberPlaceholder')}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('accounting.purchases.currencyLabel')}</label>
                    <select
                      value={form.currency}
                      onChange={(e) => setForm((prev) => ({ ...prev, currency: e.target.value as AccCurrency }))}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm bg-white"
                    >
                      {ACC_CURRENCIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('accounting.purchases.bankAccountLabel')}</label>
                    <select
                      value={form.bank_account_id}
                      onChange={(e) => setForm((prev) => ({ ...prev, bank_account_id: e.target.value }))}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm bg-white"
                    >
                      <option value="">{t('accounting.purchases.selectBankAccount')}</option>
                      {bankAccounts.map((b) => (
                        <option key={b.id} value={b.id}>{b.name} ({b.currency})</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="border-t border-gray-100 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-700">{t('accounting.purchases.itemsTitle')}</h3>
                    <button
                      onClick={addItem}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors border border-emerald-200"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {t('accounting.purchases.addRow')}
                    </button>
                  </div>

                  <div className="space-y-3">
                    {form.items.map((item, index) => (
                      <div key={index} className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                          <div className="sm:col-span-4">
                            <label className="block text-xs font-medium text-gray-500 mb-1">{t('accounting.purchases.productLabel')}</label>
                            <select
                              value={item.product_id}
                              onChange={(e) => updateItem(index, 'product_id', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm bg-white"
                            >
                              <option value="">{t('accounting.purchases.selectProduct')}</option>
                              {products.map((p) => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                              ))}
                            </select>
                          </div>

                          <div className="sm:col-span-3">
                            <label className="block text-xs font-medium text-gray-500 mb-1">{t('accounting.purchases.descriptionLabel')}</label>
                            <input
                              type="text"
                              value={item.description}
                              onChange={(e) => updateItem(index, 'description', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                              placeholder={t('accounting.purchases.descriptionPlaceholder')}
                            />
                          </div>

                          <div className="sm:col-span-1">
                            <label className="block text-xs font-medium text-gray-500 mb-1">{t('accounting.purchases.quantityLabel')}</label>
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                              min="0"
                              step="0.01"
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                            />
                          </div>

                          <div className="sm:col-span-1">
                            <label className="block text-xs font-medium text-gray-500 mb-1">{t('accounting.purchases.unitLabel')}</label>
                            <select
                              value={item.unit}
                              onChange={(e) => updateItem(index, 'unit', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm bg-white"
                            >
                              {UNITS.map((u) => (
                                <option key={u.value} value={u.value}>{u.label}</option>
                              ))}
                            </select>
                          </div>

                          <div className="sm:col-span-1">
                            <label className="block text-xs font-medium text-gray-500 mb-1">{t('accounting.purchases.priceLabel')}</label>
                            <input
                              type="number"
                              value={item.unit_price}
                              onChange={(e) => updateItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                              min="0"
                              step="0.01"
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                            />
                          </div>

                          <div className="sm:col-span-1">
                            <label className="block text-xs font-medium text-gray-500 mb-1">{t('accounting.purchases.vatLabel')}</label>
                            <select
                              value={item.vat_rate}
                              onChange={(e) => updateItem(index, 'vat_rate', Number(e.target.value))}
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm bg-white"
                            >
                              {VAT_RATES.map((v) => (
                                <option key={v.value} value={v.value}>{v.label}</option>
                              ))}
                            </select>
                          </div>

                          <div className="sm:col-span-1 flex items-end">
                            <div className="w-full">
                              <label className="block text-xs font-medium text-gray-500 mb-1">{t('accounting.purchases.lineTotalLabel')}</label>
                              <div className="flex items-center gap-1">
                                <span className="text-sm font-semibold text-gray-900 truncate">
                                  {formatCurrency(calcLineTotal(item.quantity, item.unit_price, item.vat_rate), form.currency)}
                                </span>
                                {form.items.length > 1 && (
                                  <button
                                    onClick={() => removeItem(index)}
                                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 bg-gray-50 rounded-lg p-4 border border-gray-100">
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex items-center justify-between w-full sm:w-64">
                        <span className="text-sm text-gray-600">{t('accounting.purchases.subtotalLabel')}:</span>
                        <span className="text-sm font-medium text-gray-900">{formatCurrency(subtotal, form.currency)}</span>
                      </div>
                      <div className="flex items-center justify-between w-full sm:w-64">
                        <span className="text-sm text-gray-600">{t('accounting.purchases.vatTotalLabel')}:</span>
                        <span className="text-sm font-medium text-gray-900">{formatCurrency(vatTotal, form.currency)}</span>
                      </div>
                      <div className="flex items-center justify-between w-full sm:w-64 pt-2 border-t border-gray-200">
                        <span className="text-sm font-semibold text-gray-900">{t('accounting.purchases.grandTotalLabel')}:</span>
                        <span className="text-lg font-bold text-emerald-600">{formatCurrency(grandTotal, form.currency)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t border-gray-100 pt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('accounting.purchases.notesLabel')}</label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                    rows={3}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm resize-none"
                    placeholder={t('accounting.purchases.notesPlaceholder')}
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-100">
                <button
                  onClick={closeModal}
                  className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  {t('accounting.purchases.cancelBtn')}
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !form.contact_id}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingPurchase ? t('accounting.purchases.saveChanges') : t('accounting.purchases.createBtn')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
