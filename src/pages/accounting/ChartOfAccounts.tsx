import { useState, useEffect, useCallback } from 'react';
import { BookOpen, Search, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import { useCompliance } from '../../hooks/useCompliance';
import { chartOfAccounts as coaRule } from '../../lib/complianceEngine';

interface CoARow {
  id: string;
  account_code: string;
  name: string;
  account_type: string;
  account_group: string;
  vat_rate: number;
  is_active: boolean;
}

const TYPE_COLOR: Record<string, string> = {
  asset: 'bg-blue-100 text-blue-800',
  liability: 'bg-amber-100 text-amber-800',
  equity: 'bg-emerald-100 text-emerald-800',
  revenue: 'bg-teal-100 text-teal-800',
  expense: 'bg-rose-100 text-rose-800',
};

export default function ChartOfAccounts() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const { ctx } = useCompliance();
  const [rows, setRows] = useState<CoARow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const TYPE_LABEL: Record<string, string> = {
    asset: t('accounting.coa.typeAsset'),
    liability: t('accounting.coa.typeLiability'),
    equity: t('accounting.coa.typeEquity'),
    revenue: t('accounting.coa.typeRevenue'),
    expense: t('accounting.coa.typeExpense'),
  };

  const planRule = coaRule(ctx);
  const planCode = planRule?.code ?? 'SKR03';
  const planName = planRule?.name ?? '';

  const load = useCallback(async () => {
    if (!profile?.company_id) return;
    setLoading(true);
    const { data } = await supabase
      .from('acc_chart_of_accounts')
      .select('*')
      .eq('company_id', profile.company_id)
      .order('account_code');
    setRows((data as CoARow[]) ?? []);
    setLoading(false);
  }, [profile?.company_id]);

  useEffect(() => { load(); }, [load]);

  const filtered = rows.filter(r => {
    if (typeFilter !== 'all' && r.account_type !== typeFilter) return false;
    const q = search.toLowerCase();
    return !q || r.account_code.includes(q) || r.name.toLowerCase().includes(q) || r.account_group.toLowerCase().includes(q);
  });

  const grouped = filtered.reduce<Record<string, CoARow[]>>((acc, r) => {
    (acc[r.account_type] ||= []).push(r);
    return acc;
  }, {});

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-emerald-600" /> {t('accounting.coa.title')} ({planCode})
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          {planName ? `${planName} — ` : ''}{rows.length} {t('accounting.coa.subtitleSuffix')}
        </p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-4 p-3 flex flex-col md:flex-row gap-3 md:items-center">
        <div className="flex items-center gap-2 flex-1">
          <Search className="w-4 h-4 text-gray-400" />
          <input type="text" placeholder={t('accounting.coa.searchPlaceholder')} value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 text-sm focus:outline-none" />
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded text-sm">
          <option value="all">{t('accounting.coa.allTypes')}</option>
          <option value="asset">{TYPE_LABEL.asset}</option>
          <option value="liability">{TYPE_LABEL.liability}</option>
          <option value="equity">{TYPE_LABEL.equity}</option>
          <option value="revenue">{TYPE_LABEL.revenue}</option>
          <option value="expense">{TYPE_LABEL.expense}</option>
        </select>
      </div>

      {loading ? (
        <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-emerald-600" /></div>
      ) : (
        <div className="space-y-4">
          {(['asset','liability','equity','revenue','expense'] as const).map(type => {
            const group = grouped[type];
            if (!group?.length) return null;
            return (
              <div key={type} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className={`px-4 py-2 text-sm font-semibold ${TYPE_COLOR[type]}`}>{TYPE_LABEL[type]} ({group.length})</div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="py-2 px-3 text-left w-24">{t('accounting.coa.colCode')}</th>
                      <th className="py-2 px-3 text-left">{t('accounting.coa.colName')}</th>
                      <th className="py-2 px-3 text-left">{t('accounting.coa.colGroup')}</th>
                      <th className="py-2 px-3 text-right w-20">{t('accounting.coa.colVat')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.map(r => (
                      <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-1.5 px-3 font-mono">{r.account_code}</td>
                        <td className="py-1.5 px-3">{r.name}</td>
                        <td className="py-1.5 px-3 text-gray-600 text-xs">{r.account_group}</td>
                        <td className="py-1.5 px-3 text-right text-xs">{r.vat_rate > 0 ? `${r.vat_rate}%` : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 py-12 text-center text-gray-500">
              {t('accounting.coa.noAccounts')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
