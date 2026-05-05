import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Search,
  Plus,
  Pencil,
  Trash2,
  X,
  Loader2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';

type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense' | 'contra';
type VatRelevance = 'none' | 'input' | 'output' | 'reduced_input' | 'reduced_output';

interface CoaAccount {
  id: string;
  company_id: string;
  account_code: string;
  account_name: string;
  account_type: AccountType;
  parent_code: string | null;
  vat_relevance: VatRelevance;
  is_active: boolean;
  source_template_id: string | null;
  sort_order: number;
}

interface AccountForm {
  account_code: string;
  account_name: string;
  account_type: AccountType;
  parent_code: string;
  vat_relevance: VatRelevance;
  is_active: boolean;
}

const emptyForm: AccountForm = {
  account_code: '',
  account_name: '',
  account_type: 'asset',
  parent_code: '',
  vat_relevance: 'none',
  is_active: true,
};

const TYPE_COLORS: Record<AccountType, string> = {
  asset: 'bg-blue-100 text-blue-700',
  liability: 'bg-rose-100 text-rose-700',
  equity: 'bg-amber-100 text-amber-700',
  income: 'bg-emerald-100 text-emerald-700',
  expense: 'bg-orange-100 text-orange-700',
  contra: 'bg-slate-100 text-slate-700',
};

const VAT_COLORS: Record<VatRelevance, string> = {
  none: 'bg-gray-100 text-gray-600',
  input: 'bg-sky-100 text-sky-700',
  output: 'bg-teal-100 text-teal-700',
  reduced_input: 'bg-sky-50 text-sky-600',
  reduced_output: 'bg-teal-50 text-teal-600',
};

export default function ChartOfAccounts() {
  const { profile } = useAuth();
  const { t } = useTranslation();

  const canEdit = profile?.role === 'company_admin' || profile?.role === 'accountant';

  const [accounts, setAccounts] = useState<CoaAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<AccountType | 'all'>('all');
  const [vatFilter, setVatFilter] = useState<VatRelevance | 'all'>('all');
  const [showInactive, setShowInactive] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AccountForm>(emptyForm);

  const fetchAccounts = useCallback(async () => {
    if (!profile?.company_id) return;
    try {
      setLoading(true);
      setError(null);
      const { data, error: err } = await supabase
        .from('company_chart_of_accounts')
        .select('*')
        .eq('company_id', profile.company_id)
        .order('account_code', { ascending: true });
      if (err) throw err;
      setAccounts((data as CoaAccount[]) ?? []);
    } catch (err) {
      setError((err as Error).message || t('common.errorLoading'));
    } finally {
      setLoading(false);
    }
  }, [profile?.company_id, t]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return accounts.filter((a) => {
      if (!showInactive && !a.is_active) return false;
      if (typeFilter !== 'all' && a.account_type !== typeFilter) return false;
      if (vatFilter !== 'all' && a.vat_relevance !== vatFilter) return false;
      if (q) {
        const hay = `${a.account_code} ${a.account_name}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [accounts, searchQuery, typeFilter, vatFilter, showInactive]);

  const grouped = useMemo(() => {
    const byType: Record<AccountType, CoaAccount[]> = {
      asset: [],
      liability: [],
      equity: [],
      income: [],
      expense: [],
      contra: [],
    };
    for (const a of filtered) byType[a.account_type].push(a);
    return byType;
  }, [filtered]);

  const activeCount = accounts.filter((a) => a.is_active).length;

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (a: CoaAccount) => {
    setEditingId(a.id);
    setForm({
      account_code: a.account_code,
      account_name: a.account_name,
      account_type: a.account_type,
      parent_code: a.parent_code ?? '',
      vat_relevance: a.vat_relevance,
      is_active: a.is_active,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!profile?.company_id) return;
    if (!form.account_code.trim() || !form.account_name.trim()) {
      setError(t('common.error'));
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const payload = {
        company_id: profile.company_id,
        account_code: form.account_code.trim(),
        account_name: form.account_name.trim(),
        account_type: form.account_type,
        parent_code: form.parent_code.trim() || null,
        vat_relevance: form.vat_relevance,
        is_active: form.is_active,
      };
      if (editingId) {
        const { error: err } = await supabase
          .from('company_chart_of_accounts')
          .update(payload)
          .eq('id', editingId);
        if (err) throw err;
      } else {
        const { error: err } = await supabase
          .from('company_chart_of_accounts')
          .insert(payload);
        if (err) throw err;
      }
      setShowModal(false);
      setEditingId(null);
      setForm(emptyForm);
      await fetchAccounts();
    } catch (err) {
      setError((err as Error).message || t('common.errorSaving'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (a: CoaAccount) => {
    if (!window.confirm(t('common.areYouSure'))) return;
    try {
      setError(null);
      const { error: err } = await supabase
        .from('company_chart_of_accounts')
        .delete()
        .eq('id', a.id);
      if (err) throw err;
      await fetchAccounts();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const toggleGroup = (key: string) =>
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  const typeLabel = (tp: AccountType) => {
    switch (tp) {
      case 'asset':
        return t('accounting.coa.typeAsset');
      case 'liability':
        return t('accounting.coa.typeLiability');
      case 'equity':
        return t('accounting.coa.typeEquity');
      case 'income':
        return t('accounting.coa.typeRevenue');
      case 'expense':
        return t('accounting.coa.typeExpense');
      case 'contra':
        return t('accounting.coa.typeContra');
    }
  };

  const vatLabel = (v: VatRelevance) => {
    switch (v) {
      case 'none':
        return '—';
      case 'input':
        return t('accounting.coa.vatInput');
      case 'output':
        return t('accounting.coa.vatOutput');
      case 'reduced_input':
        return t('accounting.coa.vatReducedInput');
      case 'reduced_output':
        return t('accounting.coa.vatReducedOutput');
    }
  };

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
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <BookOpen className="w-5 h-5 text-emerald-700" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('accounting.coa.title')}</h1>
            <p className="text-gray-500 mt-0.5 text-sm">
              {activeCount} {t('accounting.coa.subtitleSuffix')}
            </p>
          </div>
        </div>
        {canEdit && (
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium text-sm"
          >
            <Plus className="w-4 h-4" />
            {t('accounting.coa.addAccount')}
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-red-700 text-sm flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('accounting.coa.searchPlaceholder')}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as AccountType | 'all')}
            className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm bg-white"
          >
            <option value="all">{t('accounting.coa.allTypes')}</option>
            <option value="asset">{t('accounting.coa.typeAsset')}</option>
            <option value="liability">{t('accounting.coa.typeLiability')}</option>
            <option value="equity">{t('accounting.coa.typeEquity')}</option>
            <option value="income">{t('accounting.coa.typeRevenue')}</option>
            <option value="expense">{t('accounting.coa.typeExpense')}</option>
            <option value="contra">{t('accounting.coa.typeContra')}</option>
          </select>
          <select
            value={vatFilter}
            onChange={(e) => setVatFilter(e.target.value as VatRelevance | 'all')}
            className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm bg-white"
          >
            <option value="all">{t('accounting.coa.allVat')}</option>
            <option value="none">{t('accounting.coa.vatNone')}</option>
            <option value="input">{t('accounting.coa.vatInput')}</option>
            <option value="output">{t('accounting.coa.vatOutput')}</option>
            <option value="reduced_input">{t('accounting.coa.vatReducedInput')}</option>
            <option value="reduced_output">{t('accounting.coa.vatReducedOutput')}</option>
          </select>
          <label className="inline-flex items-center gap-2 px-3 py-2 text-sm text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
            />
            {t('accounting.coa.showInactive')}
          </label>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 py-16 text-center">
          <BookOpen className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <p className="text-gray-500 font-medium">{t('accounting.coa.noAccounts')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(Object.keys(grouped) as AccountType[]).map((tp) => {
            const rows = grouped[tp];
            if (!rows.length) return null;
            const isExpanded = expanded[tp] !== false;
            return (
              <div key={tp} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <button
                  onClick={() => toggleGroup(tp)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-gray-500" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-500" />
                    )}
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[tp]}`}>
                      {typeLabel(tp)}
                    </span>
                    <span className="text-sm text-gray-500">{rows.length}</span>
                  </div>
                </button>
                {isExpanded && (
                  <div className="divide-y divide-gray-50">
                    <div className="hidden md:grid grid-cols-12 px-4 py-2 bg-gray-50/60 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                      <div className="col-span-2">{t('accounting.coa.colCode')}</div>
                      <div className="col-span-5">{t('accounting.coa.colName')}</div>
                      <div className="col-span-2">{t('accounting.coa.colGroup')}</div>
                      <div className="col-span-2">{t('accounting.coa.colVat')}</div>
                      <div className="col-span-1 text-right">{t('common.actions')}</div>
                    </div>
                    {rows.map((a) => (
                      <div
                        key={a.id}
                        className={`grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-0 px-4 py-3 items-center transition-colors ${
                          a.is_active ? 'hover:bg-gray-50' : 'bg-gray-50/40 text-gray-400'
                        }`}
                      >
                        <div className="md:col-span-2 font-mono text-sm text-gray-900 flex items-center gap-2">
                          {a.account_code}
                          {a.source_template_id && (
                            <span title={t('accounting.coa.fromTemplate')}>
                              <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                            </span>
                          )}
                        </div>
                        <div className="md:col-span-5 text-sm text-gray-800">
                          {a.account_name}
                          {a.parent_code && (
                            <span className="ml-2 text-xs text-gray-400 font-mono">← {a.parent_code}</span>
                          )}
                        </div>
                        <div className="md:col-span-2">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${TYPE_COLORS[a.account_type]}`}>
                            {typeLabel(a.account_type)}
                          </span>
                        </div>
                        <div className="md:col-span-2">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${VAT_COLORS[a.vat_relevance]}`}>
                            {vatLabel(a.vat_relevance)}
                          </span>
                        </div>
                        <div className="md:col-span-1 flex items-center justify-end gap-1">
                          {canEdit && (
                            <>
                              <button
                                onClick={() => openEdit(a)}
                                className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                aria-label={t('common.edit')}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDelete(a)}
                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                aria-label={t('common.delete')}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingId ? t('accounting.coa.editAccount') : t('accounting.coa.addAccount')}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('accounting.coa.colCode')} *
                  </label>
                  <input
                    type="text"
                    value={form.account_code}
                    onChange={(e) => setForm({ ...form, account_code: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-sm"
                    placeholder="1200"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('accounting.coa.colName')} *
                  </label>
                  <input
                    type="text"
                    value={form.account_name}
                    onChange={(e) => setForm({ ...form, account_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('accounting.coa.colGroup')} *
                  </label>
                  <select
                    value={form.account_type}
                    onChange={(e) => setForm({ ...form, account_type: e.target.value as AccountType })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm bg-white"
                  >
                    <option value="asset">{t('accounting.coa.typeAsset')}</option>
                    <option value="liability">{t('accounting.coa.typeLiability')}</option>
                    <option value="equity">{t('accounting.coa.typeEquity')}</option>
                    <option value="income">{t('accounting.coa.typeRevenue')}</option>
                    <option value="expense">{t('accounting.coa.typeExpense')}</option>
                    <option value="contra">{t('accounting.coa.typeContra')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('accounting.coa.colVat')}
                  </label>
                  <select
                    value={form.vat_relevance}
                    onChange={(e) => setForm({ ...form, vat_relevance: e.target.value as VatRelevance })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm bg-white"
                  >
                    <option value="none">{t('accounting.coa.vatNone')}</option>
                    <option value="input">{t('accounting.coa.vatInput')}</option>
                    <option value="output">{t('accounting.coa.vatOutput')}</option>
                    <option value="reduced_input">{t('accounting.coa.vatReducedInput')}</option>
                    <option value="reduced_output">{t('accounting.coa.vatReducedOutput')}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('accounting.coa.parentCode')}
                </label>
                <input
                  type="text"
                  value={form.parent_code}
                  onChange={(e) => setForm({ ...form, parent_code: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-sm"
                />
              </div>

              <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                />
                {t('common.active')}
              </label>
            </div>
            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-100">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.account_code.trim() || !form.account_name.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingId ? t('common.saveChanges') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
