import { useEffect, useState } from 'react';
import {
  TrendingUp, TrendingDown, Receipt, Landmark, Loader2, FileText, Calendar,
  ArrowUpRight, ArrowDownLeft, Filter,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';

type Tab = 'sales' | 'purchases' | 'expenses' | 'investments';

interface InvoiceRow {
  id: string;
  invoice_number: string;
  invoice_date: string | null;
  due_date: string | null;
  status: string;
  total: number;
  currency: string;
  contact_name?: string;
  notes: string;
}

interface PurchaseRow {
  id: string;
  purchase_number: string;
  purchase_date: string | null;
  due_date: string | null;
  status: string;
  total: number;
  currency: string;
  contact_name?: string;
  notes: string;
}

interface TransactionRow {
  id: string;
  transaction_date: string | null;
  description: string;
  amount: number;
  currency: string;
  category_name?: string;
}

interface AssetRow {
  id: string;
  name: string;
  category: string;
  acquisition_date: string;
  acquisition_cost: number;
  current_book_value: number;
  status: string;
  notes: string;
}

const TABS: { key: Tab; icon: typeof TrendingUp; labelKey: string; color: string }[] = [
  { key: 'sales', icon: TrendingUp, labelKey: 'financial.sales', color: 'emerald' },
  { key: 'purchases', icon: TrendingDown, labelKey: 'financial.purchases', color: 'blue' },
  { key: 'expenses', icon: Receipt, labelKey: 'financial.expenses', color: 'amber' },
  { key: 'investments', icon: Landmark, labelKey: 'financial.investments', color: 'teal' },
];

export default function FinancialSummary() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>('sales');
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [dateRange, setDateRange] = useState<'30' | '90' | '365' | 'all'>('90');

  useEffect(() => { loadData(); }, [profile?.company_id, activeTab, dateRange]);

  async function loadData() {
    if (!profile?.company_id) return;
    setLoading(true);

    const since = dateRange === 'all' ? null : new Date(Date.now() - Number(dateRange) * 86400000).toISOString().slice(0, 10);

    if (activeTab === 'sales') {
      let q = supabase
        .from('acc_invoices')
        .select('id, invoice_number, invoice_date, due_date, status, total, currency, notes, acc_contacts(name)')
        .eq('company_id', profile.company_id)
        .eq('invoice_type', 'invoice')
        .order('invoice_date', { ascending: false })
        .limit(100);
      if (since) q = q.gte('invoice_date', since);
      const { data } = await q;
      setInvoices((data ?? []).map((d: any) => ({
        ...d,
        contact_name: d.acc_contacts?.name ?? '',
      })));
    } else if (activeTab === 'purchases') {
      let q = supabase
        .from('acc_purchases')
        .select('id, purchase_number, purchase_date, due_date, status, total, currency, notes, acc_contacts(name)')
        .eq('company_id', profile.company_id)
        .order('purchase_date', { ascending: false })
        .limit(100);
      if (since) q = q.gte('purchase_date', since);
      const { data } = await q;
      setPurchases((data ?? []).map((d: any) => ({
        ...d,
        contact_name: d.acc_contacts?.name ?? '',
      })));
    } else if (activeTab === 'expenses') {
      // Real expenses are tracked as cash-flow transactions of type='expense',
      // not as a non-existent invoice_type. The old query was filtering
      // acc_invoices WHERE invoice_type='expense' which the CHECK constraint
      // does not allow ('invoice'/'credit_note'/'proforma' only), so the tab
      // had always been empty.
      let q = supabase
        .from('acc_transactions')
        .select('id, transaction_date, description, amount, currency, category:acc_expense_categories(name)')
        .eq('company_id', profile.company_id)
        .eq('transaction_type', 'expense')
        .order('transaction_date', { ascending: false })
        .limit(100);
      if (since) q = q.gte('transaction_date', since);
      const { data } = await q;
      setTransactions((data ?? []).map((d: any) => ({
        id: d.id,
        transaction_date: d.transaction_date,
        description: d.description ?? '',
        amount: Number(d.amount) || 0,
        currency: d.currency ?? 'EUR',
        category_name: d.category?.name ?? '',
      })));
    } else {
      // Investments live in acc_fixed_assets, not in acc_invoices.
      let q = supabase
        .from('acc_fixed_assets')
        .select('id, name, category, acquisition_date, acquisition_cost, current_book_value, status, notes')
        .eq('company_id', profile.company_id)
        .order('acquisition_date', { ascending: false })
        .limit(100);
      if (since) q = q.gte('acquisition_date', since);
      const { data } = await q;
      setAssets((data ?? []) as AssetRow[]);
    }

    setLoading(false);
  }

  type RowLike = {
    id: string;
    number: string;
    date: string | null;
    dueDate: string | null;
    status: string;
    total: number;
    currency: string;
    contact: string;
    notes: string;
  };

  const rows: RowLike[] = activeTab === 'purchases'
    ? purchases.map(p => ({
        id: p.id,
        number: p.purchase_number,
        date: p.purchase_date,
        dueDate: p.due_date,
        status: p.status,
        total: p.total,
        currency: p.currency,
        contact: p.contact_name ?? '',
        notes: p.notes,
      }))
    : activeTab === 'expenses'
      ? transactions.map(tx => ({
          id: tx.id,
          number: '',                       // transactions don't have a "number"
          date: tx.transaction_date,
          dueDate: null,                    // cash flow, no due date
          status: 'paid',                   // a transaction is by definition the cash move
          total: tx.amount,
          currency: tx.currency,
          contact: tx.category_name ?? '',  // re-use contact column for category label
          notes: tx.description,
        }))
      : activeTab === 'investments'
        ? assets.map(a => ({
            id: a.id,
            number: a.category,
            date: a.acquisition_date,
            dueDate: null,
            status: a.status,                              // 'active' | 'disposed'
            total: a.current_book_value || a.acquisition_cost,
            currency: 'EUR',                               // fixed_assets has no currency column
            contact: a.name,                               // surface asset name in the contact slot
            notes: a.notes,
          }))
        : invoices.map(i => ({
            id: i.id,
            number: i.invoice_number,
            date: i.invoice_date,
            dueDate: i.due_date,
            status: i.status,
            total: i.total,
            currency: i.currency,
            contact: i.contact_name ?? '',
            notes: i.notes,
          }));

  const totalAmount = rows.reduce((sum, r) => sum + (r.total || 0), 0);
  const paidCount = rows.filter(r => r.status === 'paid' || r.status === 'received').length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('financial.title')}</h1>
          <p className="text-slate-500 mt-1">{t('financial.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={dateRange}
            onChange={e => setDateRange(e.target.value as any)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400"
          >
            <option value="30">30 {t('common.days')}</option>
            <option value="90">90 {t('common.days')}</option>
            <option value="365">1 {t('financial.year')}</option>
            <option value="all">{t('financial.allTime')}</option>
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto">
        {TABS.map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {t(tab.labelKey)}
            </button>
          );
        })}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <SummaryCard
          label={t('financial.totalAmount')}
          value={`${totalAmount.toLocaleString('de-DE', { minimumFractionDigits: 2 })} EUR`}
          icon={activeTab === 'purchases' ? ArrowDownLeft : ArrowUpRight}
          color={activeTab === 'purchases' ? 'blue' : activeTab === 'expenses' ? 'amber' : 'emerald'}
        />
        <SummaryCard
          label={t('financial.invoiceCount')}
          value={String(rows.length)}
          icon={FileText}
          color="slate"
        />
        <SummaryCard
          label={t('financial.paidCount')}
          value={String(paidCount)}
          icon={Calendar}
          color="teal"
        />
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-bold text-slate-900">{t(TABS.find(tb => tb.key === activeTab)!.labelKey)}</h2>
          <span className="text-xs text-slate-400 font-medium">{rows.length} {t('financial.entries')}</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p>{t('financial.noEntries')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left font-semibold text-slate-600 px-4 py-3">{t('financial.number')}</th>
                  <th className="text-left font-semibold text-slate-600 px-4 py-3">{t('financial.date')}</th>
                  <th className="text-left font-semibold text-slate-600 px-4 py-3">{t('financial.partner')}</th>
                  <th className="text-left font-semibold text-slate-600 px-4 py-3">{t('financial.status')}</th>
                  <th className="text-right font-semibold text-slate-600 px-4 py-3">{t('financial.amount')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(row => (
                  <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800">{row.number || '-'}</td>
                    <td className="px-4 py-3 text-slate-600">{row.date ?? '-'}</td>
                    <td className="px-4 py-3 text-slate-700">{row.contact || '-'}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">
                      {(row.total || 0).toLocaleString('de-DE', { minimumFractionDigits: 2 })} {row.currency || 'EUR'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 border-t border-slate-200">
                <tr>
                  <td colSpan={4} className="px-4 py-3 font-bold text-slate-700">{t('financial.total')}</td>
                  <td className="px-4 py-3 text-right font-bold text-slate-900">
                    {totalAmount.toLocaleString('de-DE', { minimumFractionDigits: 2 })} EUR
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: typeof TrendingUp; color: string }) {
  const colors: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-600',
    blue: 'bg-blue-50 text-blue-600',
    amber: 'bg-amber-50 text-amber-600',
    teal: 'bg-teal-50 text-teal-600',
    slate: 'bg-slate-100 text-slate-600',
  };
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${colors[color] ?? colors.slate}`}>
        <Icon className="w-5 h-5" />
      </div>
      <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold mt-3">{label}</p>
      <p className="text-lg font-bold text-slate-900 mt-0.5">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    draft: { bg: 'bg-slate-100', text: 'text-slate-600', label: 'Draft' },
    sent: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Derguar' },
    paid: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Paguar' },
    received: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Pranuar' },
    overdue: { bg: 'bg-red-50', text: 'text-red-700', label: 'Vonuar' },
    cancelled: { bg: 'bg-red-50', text: 'text-red-600', label: 'Anuluar' },
  };
  const s = map[status] ?? { bg: 'bg-slate-100', text: 'text-slate-600', label: status };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}
