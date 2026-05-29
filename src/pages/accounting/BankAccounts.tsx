import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Plus, AlertTriangle, X, Loader2, Landmark, Star, CreditCard, CreditCard as Edit3, ArrowLeft, ArrowUpRight, ArrowDownRight, ArrowRightLeft, Upload, FileCheck2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { PageSkeleton } from '../../components/ui/Skeleton';
import { useTranslation } from '../../i18n';
import type { AccBankAccount, AccTransaction, AccCurrency } from '../../types/accounting';
import { formatCurrency, ACC_CURRENCIES } from '../../types/accounting';

interface BankForm {
  name: string;
  iban: string;
  bic: string;
  bank_name: string;
  currency: AccCurrency;
  opening_balance: number;
  is_default: boolean;
}

const emptyForm: BankForm = {
  name: '',
  iban: '',
  bic: '',
  bank_name: '',
  currency: 'EUR',
  opening_balance: 0,
  is_default: false,
};

function maskIban(iban: string): string {
  if (!iban || iban.length < 8) return iban || '-';
  return iban.slice(0, 4) + ' **** **** ' + iban.slice(-4);
}

export default function BankAccounts() {
  const { profile } = useAuth();
  const { t } = useTranslation();

  const [accounts, setAccounts] = useState<AccBankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<BankForm>(emptyForm);

  const [selectedAccount, setSelectedAccount] = useState<AccBankAccount | null>(null);
  const [accountTransactions, setAccountTransactions] = useState<AccTransaction[]>([]);
  const [loadingTx, setLoadingTx] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [importAccountId, setImportAccountId] = useState<string>('');
  const [importFileName, setImportFileName] = useState<string>('');
  const [importContent, setImportContent] = useState<string>('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  const openImport = (accountId: string) => {
    setImportAccountId(accountId);
    setImportFileName('');
    setImportContent('');
    setImportResult(null);
    setImportOpen(true);
  };

  const handleImportFile = async (file: File) => {
    setImportFileName(file.name);
    setImportContent(await file.text());
  };

  const handleImport = async () => {
    if (!importAccountId || !importContent) return;
    try {
      setImporting(true);
      setError(null);
      setImportResult(null);
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-bank-statement`;
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          bank_account_id: importAccountId,
          file_name: importFileName,
          content: importContent,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Import failed');
      setImportResult(`${json.line_count} rreshta te importuar, ${json.matches_suggested} sugjerime perputhjeje (${json.format}).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  useEffect(() => {
    if (profile?.company_id) fetchAccounts();
  }, [profile?.company_id]);

  const fetchAccounts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error: err } = await supabase
        .from('acc_bank_accounts')
        .select('*')
        .eq('company_id', profile!.company_id!)
        .eq('is_active', true)
        .order('is_default', { ascending: false });
      if (err) throw err;
      setAccounts(data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.errorLoading'));
    } finally {
      setLoading(false);
    }
  }, [profile?.company_id]);

  const fetchAccountTransactions = async (accountId: string) => {
    try {
      setLoadingTx(true);
      const { data, error: err } = await supabase
        .from('acc_transactions')
        .select('*, contact:acc_contacts(id, name)')
        .eq('company_id', profile!.company_id!)
        .eq('bank_account_id', accountId)
        .order('transaction_date', { ascending: false })
        .limit(50);
      if (err) throw err;
      setAccountTransactions(data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.errorLoading'));
    } finally {
      setLoadingTx(false);
    }
  };

  const handleSelectAccount = (account: AccBankAccount) => {
    setSelectedAccount(account);
    fetchAccountTransactions(account.id);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (account: AccBankAccount) => {
    setEditingId(account.id);
    setForm({
      name: account.name,
      iban: account.iban || '',
      bic: account.bic || '',
      bank_name: account.bank_name || '',
      currency: account.currency,
      opening_balance: account.opening_balance,
      is_default: account.is_default,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setError(t('accounting.bankAccounts.nameRequired') || 'Emri i llogarise eshte i detyrueshem');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const companyId = profile!.company_id!;

      if (form.is_default) {
        await supabase
          .from('acc_bank_accounts')
          .update({ is_default: false })
          .eq('company_id', companyId);
      }

      const payload = {
        company_id: companyId,
        name: form.name.trim(),
        iban: form.iban.trim(),
        bic: form.bic.trim(),
        bank_name: form.bank_name.trim(),
        currency: form.currency,
        opening_balance: Number(form.opening_balance),
        is_default: form.is_default,
      };

      if (editingId) {
        const { error: err } = await supabase
          .from('acc_bank_accounts')
          .update(payload)
          .eq('id', editingId);
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from('acc_bank_accounts').insert(payload);
        if (err) throw err;
      }

      setShowModal(false);
      setEditingId(null);
      setForm(emptyForm);
      await fetchAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gabim gjate ruajtjes');
    } finally {
      setSaving(false);
    }
  };

  const setAsDefault = async (accountId: string) => {
    try {
      setError(null);
      const companyId = profile!.company_id!;
      await supabase
        .from('acc_bank_accounts')
        .update({ is_default: false })
        .eq('company_id', companyId);
      const { error: err } = await supabase
        .from('acc_bank_accounts')
        .update({ is_default: true })
        .eq('id', accountId);
      if (err) throw err;
      await fetchAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gabim');
    }
  };

  if (loading) {
    return <PageSkeleton showStats={false} rows={6} cols={4} />;
  }

  if (selectedAccount) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              setSelectedAccount(null);
              setAccountTransactions([]);
            }}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{selectedAccount.name}</h1>
            <p className="text-gray-500 mt-0.5">
              {maskIban(selectedAccount.iban)} - {selectedAccount.bank_name || selectedAccount.currency}
            </p>
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
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Transaksionet e Llogarise</h2>
          </div>
          {loadingTx ? (
            <PageSkeleton rows={6} cols={4} showStats={false} />
          ) : accountTransactions.length === 0 ? (
            <div className="py-16 text-center">
              <CreditCard className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500 font-medium">{t('accounting.transactions.noTransactions')}</p>
              <p className="text-gray-400 text-sm mt-1">Kjo llogari nuk ka transaksione</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Data</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Pershkrimi</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Kontakti</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Lloji</th>
                    <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Shuma</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {accountTransactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3 text-sm text-gray-600">
                        {new Date(tx.transaction_date).toLocaleDateString('de-DE')}
                      </td>
                      <td className="px-6 py-3 text-sm font-medium text-gray-900">{tx.description || '-'}</td>
                      <td className="px-6 py-3 text-sm text-gray-600">{(tx.contact as any)?.name || '-'}</td>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-1.5">
                          {tx.transaction_type === 'income' && <ArrowDownRight className="w-3.5 h-3.5 text-green-600" />}
                          {tx.transaction_type === 'expense' && <ArrowUpRight className="w-3.5 h-3.5 text-red-600" />}
                          {tx.transaction_type === 'transfer' && <ArrowRightLeft className="w-3.5 h-3.5 text-blue-600" />}
                          <span className={`text-xs font-medium ${
                            tx.transaction_type === 'income' ? 'text-green-700' :
                            tx.transaction_type === 'expense' ? 'text-red-700' : 'text-blue-700'
                          }`}>
                            {tx.transaction_type === 'income' ? 'Te ardhura' :
                             tx.transaction_type === 'expense' ? 'Shpenzim' : 'Transfer'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <span className={`text-sm font-bold ${
                          tx.transaction_type === 'income' ? 'text-green-600' :
                          tx.transaction_type === 'expense' ? 'text-red-600' : 'text-blue-600'
                        }`}>
                          {tx.transaction_type === 'income' ? '+' : tx.transaction_type === 'expense' ? '-' : ''}
                          {formatCurrency(tx.amount, selectedAccount.currency)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Llogarite Bankare</h1>
          <p className="text-gray-500 mt-1">Menaxho llogarite bankare te biznesit</p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium text-sm"
        >
          <Plus className="w-4 h-4" />
          Shto Llogari
        </button>
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

      {accounts.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 py-16 text-center">
          <Landmark className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <p className="text-gray-500 font-medium">{t('accounting.bankAccounts.noAccounts')}</p>
          <p className="text-gray-400 text-sm mt-1">{t('accounting.bankAccounts.emptyHint')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((account) => (
            <div
              key={account.id}
              onClick={() => handleSelectAccount(account)}
              className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md hover:border-emerald-200 transition-all cursor-pointer relative"
            >
              {account.is_default && (
                <div className="absolute top-3 right-3">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                    <Star className="w-3 h-3" />
                    Default
                  </span>
                </div>
              )}
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                  <Landmark className="w-5 h-5 text-emerald-600" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-gray-900 truncate">{account.name}</h3>
                  {account.bank_name && (
                    <p className="text-xs text-gray-500 mt-0.5">{account.bank_name}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">IBAN</span>
                  <span className="text-xs font-mono text-gray-700">{maskIban(account.iban)}</span>
                </div>
                {account.bic && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">BIC</span>
                    <span className="text-xs font-mono text-gray-700">{account.bic}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Monedha</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    account.currency === 'EUR' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {account.currency}
                  </span>
                </div>
                <div className="pt-2 border-t border-gray-100">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Bilanci Fillestar</span>
                    <span className="text-sm font-bold text-gray-900">
                      {formatCurrency(account.opening_balance, account.currency)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => openEdit(account)}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Ndrysho
                </button>
                <button
                  onClick={() => openImport(account.id)}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Importo ekstrakt
                </button>
                <Link
                  to={`/accounting/bank-reconciliation?account=${account.id}`}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                >
                  <FileCheck2 className="w-3.5 h-3.5" />
                  Pajto
                </Link>
                {!account.is_default && (
                  <button
                    onClick={() => setAsDefault(account.id)}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors"
                  >
                    <Star className="w-3.5 h-3.5" />
                    Default
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setImportOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Importo ekstrakt bankar</h2>
              <button onClick={() => setImportOpen(false)} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600">Ngarkoni nje skedar CAMT.053 (XML) ose MT940 (.sta / .txt). Sistemi do te nxjerre transaksionet dhe te sugjeroje perputhjet.</p>
              <input
                type="file"
                accept=".xml,.sta,.txt,.mt940"
                onChange={(e) => e.target.files && handleImportFile(e.target.files[0])}
                className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
              />
              {importFileName && (
                <div className="text-xs text-gray-500">Zgjedhur: {importFileName} ({Math.round(importContent.length / 1024)} KB)</div>
              )}
              {importResult && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">{importResult}</div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-100">
              <button onClick={() => setImportOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">
                Mbyll
              </button>
              <button
                onClick={handleImport}
                disabled={importing || !importContent}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
              >
                {importing && <Loader2 className="w-4 h-4 animate-spin" />}
                <Upload className="w-4 h-4" />
                Importo
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingId ? 'Ndrysho Llogarite' : 'Shto Llogari Bankare'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Emri i Llogarise *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                  placeholder="p.sh. Llogaria Kryesore"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">IBAN</label>
                <input
                  type="text"
                  value={form.iban}
                  onChange={(e) => setForm({ ...form, iban: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm font-mono"
                  placeholder="XK00 0000 0000 0000 0000"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">BIC</label>
                  <input
                    type="text"
                    value={form.bic}
                    onChange={(e) => setForm({ ...form, bic: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm font-mono"
                    placeholder="SWIFTCODE"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Monedha</label>
                  <select
                    value={form.currency}
                    onChange={(e) => setForm({ ...form, currency: e.target.value as AccCurrency })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                  >
                    {ACC_CURRENCIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Emri i Bankes</label>
                <input
                  type="text"
                  value={form.bank_name}
                  onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                  placeholder={t('common.bankName')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bilanci Fillestar</label>
                <input
                  type="number"
                  value={form.opening_balance}
                  onChange={(e) => setForm({ ...form, opening_balance: parseFloat(e.target.value) || 0 })}
                  min="0"
                  step="0.01"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                />
              </div>
              <div className="flex items-center gap-3 pt-2">
                <input
                  type="checkbox"
                  id="is_default"
                  checked={form.is_default}
                  onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
                  className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
                />
                <label htmlFor="is_default" className="text-sm font-medium text-gray-700">
                  Vendos si llogari kryesore (default)
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-100">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Anulo
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingId ? 'Ruaj Ndryshimet' : 'Shto Llogarite'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
