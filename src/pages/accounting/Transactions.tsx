import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Search,
  AlertTriangle,
  X,
  Loader2,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Download,
  Calendar,
  FileText,
  Link2,
  Eye,
} from 'lucide-react';
import DocumentPreviewModal from '../../components/accounting/DocumentPreviewModal';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { PageSkeleton } from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import { useTranslation } from '../../i18n';
import type {
  AccTransaction,
  AccTransactionType,
  AccPaymentMethod,
  AccExpenseCategory,
  AccBankAccount,
} from '../../types/accounting';
import { formatCurrency, ACC_CURRENCIES } from '../../types/accounting';

interface TransactionForm {
  transaction_type: AccTransactionType;
  amount: number;
  currency: string;
  description: string;
  transaction_date: string;
  contact_id: string;
  category_id: string;
  bank_account_id: string;
  payment_method: AccPaymentMethod;
  reference_number: string;
  notes: string;
}

const emptyForm: TransactionForm = {
  transaction_type: 'income',
  amount: 0,
  currency: 'EUR',
  description: '',
  transaction_date: new Date().toISOString().split('T')[0],
  contact_id: '',
  category_id: '',
  bank_account_id: '',
  payment_method: 'bank_transfer',
  reference_number: '',
  notes: '',
};

type FilterType = 'all' | AccTransactionType;

const paymentMethodLabels: Record<AccPaymentMethod, string> = {
  '': '-',
  bank_transfer: 'Transfer Bankar',
  cash: 'Cash',
  card: 'Karte',
  paypal: 'PayPal',
  other: 'Tjeter',
};

export default function Transactions() {
  const { profile } = useAuth();
  const { t } = useTranslation();

  const [transactions, setTransactions] = useState<AccTransaction[]>([]);
  const [contacts, setContacts] = useState<{ id: string; name: string }[]>([]);
  const [categories, setCategories] = useState<AccExpenseCategory[]>([]);
  const [bankAccounts, setBankAccounts] = useState<AccBankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [filterPayment, setFilterPayment] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TransactionForm>(emptyForm);
  const [previewTx, setPreviewTx] = useState<AccTransaction | null>(null);

  useEffect(() => {
    if (profile?.company_id) fetchData();
  }, [profile?.company_id]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const companyId = profile!.company_id!;

      const [txRes, contactsRes, categoriesRes, bankRes] = await Promise.all([
        supabase
          .from('acc_transactions')
          .select('*, contact:acc_contacts(id, name), category:acc_expense_categories(id, name), bank_account:acc_bank_accounts(id, name)')
          .eq('company_id', companyId)
          .order('transaction_date', { ascending: false }),
        supabase
          .from('acc_contacts')
          .select('id, name')
          .eq('company_id', companyId)
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('acc_expense_categories')
          .select('*')
          .eq('company_id', companyId)
          .order('name'),
        supabase
          .from('acc_bank_accounts')
          .select('*')
          .eq('company_id', companyId)
          .eq('is_active', true)
          .order('name'),
      ]);

      if (txRes.error) throw txRes.error;
      if (contactsRes.error) throw contactsRes.error;
      if (categoriesRes.error) throw categoriesRes.error;
      if (bankRes.error) throw bankRes.error;

      setTransactions(txRes.data ?? []);
      setContacts(contactsRes.data ?? []);
      setCategories(categoriesRes.data ?? []);
      setBankAccounts(bankRes.data ?? []);
    } catch (err) {
      setError(err.message || t('common.errorLoading'));
    } finally {
      setLoading(false);
    }
  }, [profile?.company_id]);

  const filteredTransactions = transactions.filter((tx) => {
    if (filterType !== 'all' && tx.transaction_type !== filterType) return false;
    if (filterPayment && tx.payment_method !== filterPayment) return false;
    if (dateFrom && tx.transaction_date < dateFrom) return false;
    if (dateTo && tx.transaction_date > dateTo) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const contactName = (tx.contact as any)?.name?.toLowerCase() || '';
      if (
        !tx.description?.toLowerCase().includes(q) &&
        !contactName.includes(q) &&
        !tx.reference_number?.toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  const totalIncome = filteredTransactions
    .filter((tx) => tx.transaction_type === 'income')
    .reduce((sum, tx) => sum + tx.amount, 0);
  const totalExpenses = filteredTransactions
    .filter((tx) => tx.transaction_type === 'expense')
    .reduce((sum, tx) => sum + tx.amount, 0);
  const balance = totalIncome - totalExpenses;

  const getTypeBadge = (type: AccTransactionType) => {
    const styles: Record<AccTransactionType, { bg: string; label: string }> = {
      income: { bg: 'bg-green-100 text-green-700', label: 'Te ardhura' },
      expense: { bg: 'bg-red-100 text-red-700', label: 'Shpenzim' },
      transfer: { bg: 'bg-blue-100 text-blue-700', label: 'Transfer' },
    };
    const s = styles[type];
    return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${s.bg}`}>{s.label}</span>;
  };

  const getPaymentBadge = (method: AccPaymentMethod) => {
    if (!method) return <span className="text-sm text-gray-400">-</span>;
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
        {paymentMethodLabels[method] || method}
      </span>
    );
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (tx: AccTransaction) => {
    setEditingId(tx.id);
    setForm({
      transaction_type: tx.transaction_type,
      amount: tx.amount,
      currency: tx.currency || 'EUR',
      description: tx.description || '',
      transaction_date: tx.transaction_date,
      contact_id: tx.contact_id || '',
      category_id: tx.category_id || '',
      bank_account_id: tx.bank_account_id || '',
      payment_method: tx.payment_method,
      reference_number: tx.reference_number || '',
      notes: tx.notes || '',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.description.trim() || form.amount <= 0) {
      setError(t('accounting.transactions.descriptionAndAmountRequired') || 'Pershkrimi dhe shuma jane te detyrueshme');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const payload = {
        company_id: profile!.company_id!,
        transaction_type: form.transaction_type,
        amount: Number(form.amount),
        currency: form.currency,
        description: form.description.trim(),
        transaction_date: form.transaction_date,
        contact_id: form.contact_id || null,
        category_id: form.category_id || null,
        bank_account_id: form.bank_account_id || null,
        payment_method: form.payment_method,
        reference_number: form.reference_number.trim(),
        notes: form.notes.trim(),
        created_by: profile!.id,
      };

      if (editingId) {
        const { error: err } = await supabase
          .from('acc_transactions')
          .update(payload)
          .eq('id', editingId);
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from('acc_transactions').insert(payload);
        if (err) throw err;
      }

      setShowModal(false);
      setEditingId(null);
      setForm(emptyForm);
      await fetchData();
    } catch (err) {
      setError(err.message || 'Gabim gjate ruajtjes');
    } finally {
      setSaving(false);
    }
  };

  const exportCSV = () => {
    const headers = ['Data', 'Pershkrimi', 'Kontakti', 'Lloji', 'Shuma', 'Metoda', 'Referenca'];
    const rows = filteredTransactions.map((tx) => [
      tx.transaction_date,
      tx.description,
      (tx.contact as any)?.name || '',
      tx.transaction_type,
      tx.amount.toFixed(2),
      paymentMethodLabels[tx.payment_method] || tx.payment_method,
      tx.reference_number,
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transaksionet_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <PageSkeleton rows={10} cols={6} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Transaksionet</h1>
          <p className="text-gray-500 mt-1">Ditari financiar i te ardhurave dhe shpenzimeve</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportCSV}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors font-medium text-sm"
          >
            <Download className="w-4 h-4" />
            Eksporto CSV
          </button>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium text-sm"
          >
            <Plus className="w-4 h-4" />
            Shto Transaksion
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Te Ardhurat</p>
              <p className="text-2xl font-bold text-green-600 mt-2">{formatCurrency(totalIncome)}</p>
            </div>
            <div className="bg-green-500 p-2.5 rounded-xl">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Shpenzimet</p>
              <p className="text-2xl font-bold text-red-600 mt-2">{formatCurrency(totalExpenses)}</p>
            </div>
            <div className="bg-red-500 p-2.5 rounded-xl">
              <TrendingDown className="w-5 h-5 text-white" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Bilanci</p>
              <p className={`text-2xl font-bold mt-2 ${balance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {formatCurrency(balance)}
              </p>
            </div>
            <div className="bg-emerald-500 p-2.5 rounded-xl">
              <DollarSign className="w-5 h-5 text-white" />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('accounting.transactions.searchPlaceholder') || 'Kerko pershkrimin, kontaktin...'}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
            />
          </div>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
              placeholder="Nga data"
            />
          </div>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
              placeholder="Deri ne date"
            />
          </div>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as FilterType)}
            className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
          >
            <option value="all">Te gjitha llojet</option>
            <option value="income">Te ardhura</option>
            <option value="expense">Shpenzime</option>
            <option value="transfer">Transfer</option>
          </select>
          <select
            value={filterPayment}
            onChange={(e) => setFilterPayment(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
          >
            <option value="">Te gjitha metodat</option>
            <option value="bank_transfer">Transfer Bankar</option>
            <option value="cash">Cash</option>
            <option value="card">Karte</option>
            <option value="paypal">PayPal</option>
            <option value="other">Tjeter</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Data</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Pershkrimi</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Kontakti</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Lloji</th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Shuma</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Metoda</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Referenca</th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Veprime</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-0">
                    <EmptyState
                      icon={FileText}
                      title={t('accounting.transactions.noTransactions') || 'Asnje transaksion'}
                      hint={t('accounting.transactions.noTransactionsHint') || 'Shto transaksionin e pare per te filluar'}
                      action={{
                        label: t('accounting.transactions.addTransaction') || 'Shto transaksion',
                        onClick: openCreate,
                        icon: Plus,
                      }}
                    />
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {new Date(tx.transaction_date).toLocaleDateString('de-DE')}
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{tx.description || '-'}</p>
                        {(tx.invoice_id || tx.purchase_id) && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <Link2 className="w-3 h-3 text-emerald-500" />
                            <span className="text-xs text-emerald-600">
                              {tx.invoice_id ? 'Fature' : 'Blerje'}
                            </span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{(tx.contact as any)?.name || '-'}</td>
                    <td className="px-6 py-4">{getTypeBadge(tx.transaction_type)}</td>
                    <td className="px-6 py-4 text-right">
                      <span className={`text-sm font-bold ${tx.transaction_type === 'income' ? 'text-green-600' : tx.transaction_type === 'expense' ? 'text-red-600' : 'text-blue-600'}`}>
                        {tx.transaction_type === 'income' ? '+' : tx.transaction_type === 'expense' ? '-' : ''}
                        {formatCurrency(tx.amount)}
                      </span>
                    </td>
                    <td className="px-6 py-4">{getPaymentBadge(tx.payment_method)}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{tx.reference_number || '-'}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => setPreviewTx(tx)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Preview"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openEdit(tx)}
                          className="text-sm text-emerald-600 hover:text-emerald-700 font-medium px-2"
                        >
                          Ndrysho
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {previewTx && (
        <DocumentPreviewModal
          title={`Transaksion ${previewTx.reference_number || ''}`.trim()}
          subtitle={previewTx.transaction_type === 'income' ? 'Te ardhur' : previewTx.transaction_type === 'expense' ? 'Shpenzim' : 'Transferte'}
          accentColor={previewTx.transaction_type === 'income' ? 'emerald' : previewTx.transaction_type === 'expense' ? 'rose' : 'blue'}
          fields={[
            { label: 'Data', value: previewTx.transaction_date },
            { label: 'Lloji', value: previewTx.transaction_type },
            { label: 'Pershkrim', value: previewTx.description, highlight: true },
            { label: 'Metoda', value: previewTx.payment_method },
            { label: 'Referenca', value: previewTx.reference_number },
            { label: 'Vlera', value: formatCurrency(previewTx.amount, (previewTx as any).currency || 'EUR') },
          ]}
          notes={previewTx.notes || undefined}
          documentUrl={(previewTx as any).document_url || undefined}
          documentMime={(previewTx as any).document_mime || undefined}
          onClose={() => setPreviewTx(null)}
        />
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20">
            <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={() => setShowModal(false)} />
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 rounded-t-2xl z-10">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900">
                    {editingId ? 'Ndrysho Transaksionin' : 'Shto Transaksion te Ri'}
                  </h2>
                  <button
                    onClick={() => setShowModal(false)}
                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Lloji *</label>
                    <select
                      value={form.transaction_type}
                      onChange={(e) => setForm({ ...form, transaction_type: e.target.value as AccTransactionType })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                    >
                      <option value="income">Te ardhura</option>
                      <option value="expense">Shpenzim</option>
                      <option value="transfer">Transfer</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Shuma *</label>
                    <input
                      type="number"
                      value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })}
                      min="0"
                      step="0.01"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Monedha</label>
                    <select
                      value={form.currency}
                      onChange={(e) => setForm({ ...form, currency: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                    >
                      {ACC_CURRENCIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Data *</label>
                    <input
                      type="date"
                      value={form.transaction_date}
                      onChange={(e) => setForm({ ...form, transaction_date: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Pershkrimi *</label>
                    <input
                      type="text"
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                      placeholder="Pershkrimi i transaksionit"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Kontakti</label>
                    <select
                      value={form.contact_id}
                      onChange={(e) => setForm({ ...form, contact_id: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                    >
                      <option value="">Pa kontakt</option>
                      {contacts.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Kategoria</label>
                    <select
                      value={form.category_id}
                      onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                    >
                      <option value="">Pa kategori</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Llogaria Bankare</label>
                    <select
                      value={form.bank_account_id}
                      onChange={(e) => setForm({ ...form, bank_account_id: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                    >
                      <option value="">Pa llogari</option>
                      {bankAccounts.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Metoda e Pageses</label>
                    <select
                      value={form.payment_method}
                      onChange={(e) => setForm({ ...form, payment_method: e.target.value as AccPaymentMethod })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                    >
                      <option value="">Pa metode</option>
                      <option value="bank_transfer">Transfer Bankar</option>
                      <option value="cash">Cash</option>
                      <option value="card">Karte</option>
                      <option value="paypal">PayPal</option>
                      <option value="other">Tjeter</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Referenca</label>
                    <input
                      type="text"
                      value={form.reference_number}
                      onChange={(e) => setForm({ ...form, reference_number: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                      placeholder="Nr. references"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Shenime</label>
                    <textarea
                      value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm resize-none"
                      placeholder="Shenime shtese..."
                    />
                  </div>
                </div>
              </div>

              <div className="sticky bottom-0 bg-white border-t border-gray-100 px-4 sm:px-6 py-3 sm:py-4 rounded-b-2xl flex items-center justify-end gap-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Anulo
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingId ? 'Ruaj Ndryshimet' : 'Shto Transaksionin'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
