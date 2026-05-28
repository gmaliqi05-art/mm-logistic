import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  DollarSign,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Package,
  ScanLine,
  Truck,
  ChevronRight,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import { formatCurrency } from '../../types/accounting';
import { PageSkeleton } from '../../components/ui/Skeleton';
import ScanDocumentModal from '../../components/accounting/ScanDocumentModal';
import DocumentTypeChooser, { type ScanDocKind } from '../../components/scanner/DocumentTypeChooser';
import PendingScansPanel from '../../components/scanner/PendingScansPanel';
import ComplianceHealthCard from '../../components/accounting/ComplianceHealthCard';
import ArAgeingWidget from '../../components/accounting/ArAgeingWidget';
import type {
  AccTransaction,
  AccInvoiceStatus,
  AccProduct,
  AccPaymentMethod,
} from '../../types/accounting';

interface DashboardStats {
  // Cash-flow basis (when money moved in the bank/cash account)
  monthlyRevenue: number;
  monthlyExpenses: number;
  // Accrual basis (when invoices / purchases were issued — the German
  // GoBD default for B2B and what shows the real business volume even
  // when cash is still in flight)
  monthlyInvoicedSales: number;
  monthlyPurchases: number;
  // Open AR — money customers still owe us
  overdueCount: number;
  overdueTotal: number;
  openSentCount: number;
  openSentTotal: number;
}

type TransactionRow = AccTransaction;

interface InvoiceRow {
  id: string;
  invoice_number: string;
  total: number;
  currency: string;
  status: AccInvoiceStatus;
  due_date: string | null;
  contact?: { name: string } | null;
}

type LowStockProduct = AccProduct;

interface UnbilledNote {
  id: string;
  note_number: string;
  type: 'delivery' | 'pickup';
  status: string;
  partner_name: string | null;
  delivered_at: string | null;
  confirmed_at: string | null;
  created_at: string;
}

const paymentMethodLabels: Record<AccPaymentMethod, string> = {
  '': '-',
  bank_transfer: 'Bank',
  cash: 'Cash',
  card: 'Card',
  paypal: 'PayPal',
  other: 'Other',
};

const invoiceStatusStyles: Record<AccInvoiceStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  sent: 'bg-blue-100 text-blue-700',
  paid: 'bg-green-100 text-green-700',
  partial: 'bg-yellow-100 text-yellow-700',
  overdue: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-200 text-gray-500',
};

export default function AccountingDashboard() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<DashboardStats>({
    monthlyRevenue: 0,
    monthlyExpenses: 0,
    monthlyInvoicedSales: 0,
    monthlyPurchases: 0,
    overdueCount: 0,
    overdueTotal: 0,
    openSentCount: 0,
    openSentTotal: 0,
  });
  const [recentTransactions, setRecentTransactions] = useState<TransactionRow[]>([]);
  const [recentInvoices, setRecentInvoices] = useState<InvoiceRow[]>([]);
  const [scanChooserOpen, setScanChooserOpen] = useState(false);
  const [scanKind, setScanKind] = useState<ScanDocKind | null>(null);
  const [scanRefreshKey, setScanRefreshKey] = useState(0);
  const [lowStockProducts, setLowStockProducts] = useState<LowStockProduct[]>([]);
  const [unbilledNotes, setUnbilledNotes] = useState<UnbilledNote[]>([]);

  useEffect(() => {
    if (profile?.company_id) fetchDashboardData();
  }, [profile?.company_id]);

  async function fetchDashboardData() {
    try {
      setLoading(true);
      setError(null);
      const companyId = profile!.company_id!;

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
      const today = new Date().toISOString().split('T')[0];

      const [
        incomeRes,
        expenseRes,
        overdueInvoicesRes,
        sentOverdueRes,
        recentTxRes,
        recentInvRes,
        lowStockRes,
        unbilledNotesRes,
        invoicedSalesRes,
        purchasesRes,
        openSentRes,
      ] = await Promise.all([
        supabase
          .from('acc_transactions')
          .select('amount')
          .eq('company_id', companyId)
          .eq('transaction_type', 'income')
          .gte('transaction_date', monthStart)
          .lte('transaction_date', monthEnd),
        supabase
          .from('acc_transactions')
          .select('amount')
          .eq('company_id', companyId)
          .eq('transaction_type', 'expense')
          .gte('transaction_date', monthStart)
          .lte('transaction_date', monthEnd),
        supabase
          .from('acc_invoices')
          .select('id, total')
          .eq('company_id', companyId)
          .eq('status', 'overdue'),
        supabase
          .from('acc_invoices')
          .select('id, total')
          .eq('company_id', companyId)
          .eq('status', 'sent')
          .lt('due_date', today),
        supabase
          .from('acc_transactions')
          .select('*')
          .eq('company_id', companyId)
          .order('transaction_date', { ascending: false })
          .limit(10),
        supabase
          .from('acc_invoices')
          .select('*, contact:acc_contacts(name)')
          .eq('company_id', companyId)
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('acc_products')
          .select('*')
          .eq('company_id', companyId)
          .eq('is_active', true)
          .gt('min_stock', 0)
          .order('current_stock', { ascending: true }),
        supabase
          .from('delivery_notes')
          .select('id, note_number, type, status, partner_name, delivered_at, confirmed_at, created_at')
          .eq('company_id', companyId)
          .eq('type', 'delivery')
          .in('status', ['delivered', 'confirmed'])
          .is('acc_invoice_id', null)
          .order('confirmed_at', { ascending: false, nullsFirst: false })
          .limit(8),
        // Accrual sales: total of invoices ISSUED this month (any status
        // other than draft / cancelled - those don't represent sold revenue)
        supabase
          .from('acc_invoices')
          .select('total')
          .eq('company_id', companyId)
          .eq('invoice_type', 'invoice')
          .not('status', 'in', '(draft,cancelled)')
          .gte('invoice_date', monthStart)
          .lte('invoice_date', monthEnd),
        // Accrual purchases: total of supplier invoices received this month.
        // Exclude `awaiting_document` (auto-stubs with total=0) and drafts —
        // they aren't real purchases yet.
        supabase
          .from('acc_purchases')
          .select('total')
          .eq('company_id', companyId)
          .not('status', 'in', '("draft","awaiting_document","cancelled")')
          .gte('purchase_date', monthStart)
          .lte('purchase_date', monthEnd),
        // Open accounts receivable that are NOT overdue yet
        supabase
          .from('acc_invoices')
          .select('id, total')
          .eq('company_id', companyId)
          .eq('status', 'sent')
          .or(`due_date.is.null,due_date.gte.${today}`),
      ]);

      const totalRevenue = (incomeRes.data ?? []).reduce((sum, row) => sum + (row.amount || 0), 0);
      const totalExpenses = (expenseRes.data ?? []).reduce((sum, row) => sum + (row.amount || 0), 0);
      const totalInvoicedSales = (invoicedSalesRes.data ?? []).reduce(
        (sum, row) => sum + (Number(row.total) || 0),
        0,
      );
      const totalPurchases = (purchasesRes.data ?? []).reduce(
        (sum, row) => sum + (Number(row.total) || 0),
        0,
      );

      // Dedup overdue: an invoice can theoretically be in both buckets
      // (status='overdue' AND old status='sent' with past due_date if the
      // cron hasn't flipped it yet). Dedupe by id so we never double-count.
      const overdueMap = new Map<string, number>();
      for (const inv of [...(overdueInvoicesRes.data ?? []), ...(sentOverdueRes.data ?? [])]) {
        if (inv.id) overdueMap.set(inv.id, Number(inv.total) || 0);
      }
      const overdueCount = overdueMap.size;
      const overdueTotal = Array.from(overdueMap.values()).reduce((s, v) => s + v, 0);

      const openSentCount = (openSentRes.data ?? []).length;
      const openSentTotal = (openSentRes.data ?? []).reduce(
        (s, inv) => s + (Number(inv.total) || 0),
        0,
      );

      setStats({
        monthlyRevenue: totalRevenue,
        monthlyExpenses: totalExpenses,
        monthlyInvoicedSales: totalInvoicedSales,
        monthlyPurchases: totalPurchases,
        overdueCount,
        overdueTotal,
        openSentCount,
        openSentTotal,
      });

      setRecentTransactions(recentTxRes.data ?? []);
      setRecentInvoices(recentInvRes.data ?? []);

      const allProducts = (lowStockRes.data ?? []) as LowStockProduct[];
      setLowStockProducts(allProducts.filter(p => p.current_stock <= p.min_stock));

      setUnbilledNotes((unbilledNotesRes.data ?? []) as UnbilledNote[]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.errorLoading'));
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <PageSkeleton rows={6} cols={5} />;
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-3" />
        <p className="text-red-700 font-medium">{error}</p>
        <button
          onClick={fetchDashboardData}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          {t('common.tryAgain')}
        </button>
      </div>
    );
  }

  const netProfit = stats.monthlyRevenue - stats.monthlyExpenses;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-gray-900">
            {t('accounting.dashboard.title')}
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {t('accounting.dashboard.subtitle')}
          </p>
        </div>
        <button
          onClick={() => setScanChooserOpen(true)}
          className="inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2.5 rounded-lg font-medium shadow-sm transition-colors"
        >
          <ScanLine className="w-4 h-4" />
          {t('accounting.dashboard.scanDocument')}
        </button>
      </div>
      {scanChooserOpen && (
        <DocumentTypeChooser
          onClose={() => setScanChooserOpen(false)}
          onChoose={(kind) => {
            setScanChooserOpen(false);
            setScanKind(kind);
          }}
        />
      )}
      {scanKind && (
        <ScanDocumentModal
          initialKind={scanKind}
          onClose={() => setScanKind(null)}
          onSaved={() => {
            setScanKind(null);
            setScanRefreshKey((k) => k + 1);
            fetchDashboardData();
          }}
        />
      )}

      <PendingScansPanel role="accountant" refreshKey={scanRefreshKey} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                {t('accounting.dashboard.monthlyRevenue')}
              </p>
              <p className="text-xl lg:text-2xl font-bold text-gray-900 mt-2">
                {formatCurrency(stats.monthlyRevenue)}
              </p>
            </div>
            <div className="bg-emerald-500 p-2.5 rounded-xl flex-shrink-0">
              <DollarSign className="w-5 h-5 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                {t('accounting.dashboard.monthlyExpenses')}
              </p>
              <p className="text-xl lg:text-2xl font-bold text-gray-900 mt-2">
                {formatCurrency(stats.monthlyExpenses)}
              </p>
            </div>
            <div className="bg-red-500 p-2.5 rounded-xl flex-shrink-0">
              <TrendingDown className="w-5 h-5 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                {t('accounting.dashboard.netProfit')}
              </p>
              <p className={`text-xl lg:text-2xl font-bold mt-2 ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(netProfit)}
              </p>
              <div className="flex items-center gap-1 mt-1">
                {netProfit >= 0 ? (
                  <ArrowUpRight className="w-3.5 h-3.5 text-green-500" />
                ) : (
                  <ArrowDownRight className="w-3.5 h-3.5 text-red-500" />
                )}
                <span className={`text-xs font-medium ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {stats.monthlyRevenue > 0
                    ? `${((netProfit / stats.monthlyRevenue) * 100).toFixed(1)}%`
                    : '0%'}
                </span>
              </div>
            </div>
            <div className="bg-blue-500 p-2.5 rounded-xl flex-shrink-0">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                {t('accounting.dashboard.overdueInvoices')}
              </p>
              <p className="text-xl lg:text-2xl font-bold text-gray-900 mt-2">
                {stats.overdueCount}
              </p>
              {stats.overdueTotal > 0 && (
                <p className="text-xs text-red-500 font-medium mt-1">
                  {formatCurrency(stats.overdueTotal)}
                </p>
              )}
            </div>
            <div className="bg-amber-500 p-2.5 rounded-xl flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Accrual-basis volume — what was INVOICED this month, regardless of
          whether the customer has paid. German GoBD bookkeeping reports
          revenue at issue date for B2B, so this is the figure that matches
          the business volume. The cash-basis cards above show actual cash
          flow. */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-emerald-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Shitje te fatururara (kete muaj)
          </p>
          <p className="text-xl lg:text-2xl font-bold text-emerald-700 mt-2">
            {formatCurrency(stats.monthlyInvoicedSales)}
          </p>
          <p className="text-[11px] text-gray-500 mt-1">
            Vlera e plote e faturave te leshuara (jo cash flow)
          </p>
        </div>

        <div className="bg-white rounded-xl border border-blue-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Blerje (kete muaj)
          </p>
          <p className="text-xl lg:text-2xl font-bold text-blue-700 mt-2">
            {formatCurrency(stats.monthlyPurchases)}
          </p>
          <p className="text-[11px] text-gray-500 mt-1">
            Vlera e plote e blerjeve te regjistruara
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Fatura te hapura (jo te vonuara)
          </p>
          <p className="text-xl lg:text-2xl font-bold text-slate-800 mt-2">
            {formatCurrency(stats.openSentTotal)}
          </p>
          <p className="text-[11px] text-gray-500 mt-1">
            {stats.openSentCount} fatura te derguara, brenda afatit
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ComplianceHealthCard />
        <ArAgeingWidget />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <Truck className="w-4 h-4 text-teal-600" />
            <h2 className="font-semibold text-gray-900">
              {t('accounting.dashboard.unbilledDeliveries')}
            </h2>
            <span className="ml-auto text-xs font-medium text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">
              {unbilledNotes.length}
            </span>
          </div>
          <div className="divide-y divide-gray-50">
            {unbilledNotes.length === 0 ? (
              <div className="p-10 text-center">
                <Truck className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                <p className="text-gray-400 text-sm">{t('accounting.dashboard.unbilledEmpty')}</p>
              </div>
            ) : (
              unbilledNotes.map((n) => {
                const ts = n.confirmed_at || n.delivered_at || n.created_at;
                return (
                  <Link
                    key={n.id}
                    to="/accounting/invoices"
                    className="px-5 py-3 hover:bg-teal-50/40 transition-colors flex items-center gap-3"
                  >
                    <div className={`p-1.5 rounded-lg flex-shrink-0 ${n.type === 'pickup' ? 'bg-orange-100' : 'bg-teal-100'}`}>
                      <Truck className={`w-4 h-4 ${n.type === 'pickup' ? 'text-orange-600' : 'text-teal-600'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{n.note_number}</p>
                      <p className="text-xs text-gray-500 truncate">
                        {n.partner_name || t('accounting.dashboard.noCustomer')}
                        {' . '}
                        {new Date(ts).toLocaleDateString('de-DE')}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                  </Link>
                );
              })
            )}
          </div>
        </div>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">
              {t('accounting.dashboard.recentTransactions')}
            </h2>
          </div>
          <div className="divide-y divide-gray-50">
            {recentTransactions.length === 0 ? (
              <div className="p-10 text-center">
                <DollarSign className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                <p className="text-gray-400 text-sm">{t('accounting.dashboard.noTransactions')}</p>
              </div>
            ) : (
              recentTransactions.map((tx) => (
                <div key={tx.id} className="px-5 py-3 hover:bg-gray-50/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`p-1.5 rounded-lg flex-shrink-0 ${tx.transaction_type === 'income' ? 'bg-green-100' : 'bg-red-100'}`}>
                      {tx.transaction_type === 'income' ? (
                        <ArrowDownRight className="w-4 h-4 text-green-600" />
                      ) : (
                        <ArrowUpRight className="w-4 h-4 text-red-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {tx.description || '-'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(tx.transaction_date).toLocaleDateString('de-DE')}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`text-sm font-bold ${tx.transaction_type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                        {tx.transaction_type === 'income' ? '+' : '-'}
                        {formatCurrency(tx.amount)}
                      </p>
                      {tx.payment_method && (
                        <span className="inline-block mt-0.5 text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                          {paymentMethodLabels[tx.payment_method] || tx.payment_method}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">
              {t('accounting.dashboard.recentInvoices')}
            </h2>
          </div>
          <div className="divide-y divide-gray-50">
            {recentInvoices.length === 0 ? (
              <div className="p-10 text-center">
                <DollarSign className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                <p className="text-gray-400 text-sm">{t('accounting.dashboard.noInvoices')}</p>
              </div>
            ) : (
              recentInvoices.map((inv) => (
                <div key={inv.id} className="px-5 py-3 hover:bg-gray-50/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-900">
                          {inv.invoice_number}
                        </span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${invoiceStatusStyles[inv.status]}`}>
                          {t(`accounting.invoiceStatus.${inv.status}`)}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">
                        {(inv.contact as any)?.name || t('accounting.dashboard.noCustomer')}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-gray-900">
                        {formatCurrency(inv.total)}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {lowStockProducts.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <AlertTriangle className="w-4.5 h-4.5 text-amber-500" />
            <h2 className="font-semibold text-gray-900">
              {t('accounting.dashboard.lowStockAlert')}
            </h2>
            <span className="ml-auto text-xs text-gray-400">
              {lowStockProducts.length} {t('accounting.dashboard.products')}
            </span>
          </div>
          <div className="divide-y divide-gray-50">
            {lowStockProducts.map((product) => {
              const ratio = product.min_stock > 0 ? product.current_stock / product.min_stock : 1;
              let stockColor = 'text-red-600 bg-red-50';
              if (ratio > 0.5) stockColor = 'text-yellow-600 bg-yellow-50';
              if (ratio > 0.75) stockColor = 'text-orange-600 bg-orange-50';
              if (product.current_stock <= 0) stockColor = 'text-red-700 bg-red-100';

              return (
                <div key={product.id} className="px-5 py-3 hover:bg-gray-50/50 transition-colors">
                  <div className="flex items-center gap-3">
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="w-8 h-8 rounded object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <Package className="w-4 h-4 text-gray-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {product.name}
                      </p>
                      <p className="text-xs text-gray-500">{product.sku}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${stockColor}`}>
                        {product.current_stock} / {product.min_stock}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
