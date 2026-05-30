import { useState, useEffect, useCallback } from 'react';
import {
  Loader2,
  AlertTriangle,
  X,
  Calendar,
  Download,
  Printer,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Users,
  FolderOpen,
  Receipt,
  Package,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { TableRowsSkeleton } from '../../components/ui/Skeleton';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import { formatCurrency } from '../../types/accounting';
import { exportDatevCSV, exportUstvaCSV } from '../../utils/germanCompliance';
import { Link } from 'react-router-dom';
import { FileCode2, Globe as Globe2 } from 'lucide-react';

type TabKey = 'profit_loss' | 'by_customer' | 'by_category' | 'vat' | 'products';

interface MonthlyBreakdown {
  month: string;
  income: number;
  expenses: number;
}

interface CustomerRow {
  contactId: string;
  contactName: string;
  invoiceCount: number;
  totalRevenue: number;
  percent: number;
}

interface CategoryRow {
  categoryId: string;
  categoryName: string;
  transactionCount: number;
  total: number;
  percent: number;
}

interface VatBreakdown {
  rate: number;
  collected: number;
  paid: number;
}

interface ProductRow {
  productId: string;
  productName: string;
  unitsSold: number;
  revenue: number;
  unitsPurchased: number;
  cost: number;
  profit: number;
}

const tabs: { key: TabKey; label: string; icon: typeof BarChart3 }[] = [
  { key: 'profit_loss', label: 'Fitimi & Humbja', icon: BarChart3 },
  { key: 'by_customer', label: 'Sipas Klientit', icon: Users },
  { key: 'by_category', label: 'Sipas Kategorise', icon: FolderOpen },
  { key: 'vat', label: 'TVSH', icon: Receipt },
  { key: 'products', label: 'Produktet', icon: Package },
];

export default function Reports() {
  const { profile } = useAuth();
  const { t } = useTranslation();

  const [activeTab, setActiveTab] = useState<TabKey>('profit_loss');
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [totalIncome, setTotalIncome] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [monthlyBreakdown, setMonthlyBreakdown] = useState<MonthlyBreakdown[]>([]);

  const [customerRows, setCustomerRows] = useState<CustomerRow[]>([]);
  const [categoryRows, setCategoryRows] = useState<CategoryRow[]>([]);

  const [vatCollected, setVatCollected] = useState(0);
  const [vatPaid, setVatPaid] = useState(0);
  const [vatBreakdowns, setVatBreakdowns] = useState<VatBreakdown[]>([]);

  const [productRows, setProductRows] = useState<ProductRow[]>([]);
  const [companyCountry, setCompanyCountry] = useState<string | null>(null);
  const [saftOpen, setSaftOpen] = useState(false);
  const [saftBusy, setSaftBusy] = useState(false);

  useEffect(() => {
    if (!profile?.company_id) return;
    supabase.from('companies').select('country').eq('id', profile.company_id).maybeSingle()
      .then(({ data }) => setCompanyCountry(((data as { country?: string } | null)?.country ?? null)));
  }, [profile?.company_id]);

  const saftEligible = companyCountry === 'RO' || companyCountry === 'PL';

  const handleGenerateSaft = async () => {
    if (!profile?.company_id || !saftEligible) return;
    try {
      setSaftBusy(true);
      setError(null);
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-saft`;
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          company_id: profile.company_id,
          country_code: companyCountry,
          date_from: dateFrom,
          date_to: dateTo,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'SAF-T generation failed');
      if (json.download_url) window.open(json.download_url as string, '_blank');
      setSaftOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'SAF-T error');
    } finally {
      setSaftBusy(false);
    }
  };

  const fetchReport = useCallback(async () => {
    if (!profile?.company_id) return;
    try {
      setLoading(true);
      setError(null);
      const companyId = profile.company_id;

      if (activeTab === 'profit_loss') {
        const [incRes, expRes] = await Promise.all([
          supabase
            .from('acc_transactions')
            .select('amount, transaction_date')
            .eq('company_id', companyId)
            .eq('transaction_type', 'income')
            .gte('transaction_date', dateFrom)
            .lte('transaction_date', dateTo),
          supabase
            .from('acc_transactions')
            .select('amount, transaction_date')
            .eq('company_id', companyId)
            .eq('transaction_type', 'expense')
            .gte('transaction_date', dateFrom)
            .lte('transaction_date', dateTo),
        ]);
        if (incRes.error) throw incRes.error;
        if (expRes.error) throw expRes.error;

        const incData = incRes.data ?? [];
        const expData = expRes.data ?? [];

        const incTotal = incData.reduce((s, r) => s + (r.amount || 0), 0);
        const expTotal = expData.reduce((s, r) => s + (r.amount || 0), 0);
        setTotalIncome(incTotal);
        setTotalExpenses(expTotal);

        const fromDate = new Date(dateFrom);
        const toDate = new Date(dateTo);
        const diffMonths =
          (toDate.getFullYear() - fromDate.getFullYear()) * 12 +
          (toDate.getMonth() - fromDate.getMonth());

        if (diffMonths >= 1) {
          const monthMap = new Map<string, { income: number; expenses: number }>();
          incData.forEach((r) => {
            const key = r.transaction_date.substring(0, 7);
            const entry = monthMap.get(key) || { income: 0, expenses: 0 };
            entry.income += r.amount || 0;
            monthMap.set(key, entry);
          });
          expData.forEach((r) => {
            const key = r.transaction_date.substring(0, 7);
            const entry = monthMap.get(key) || { income: 0, expenses: 0 };
            entry.expenses += r.amount || 0;
            monthMap.set(key, entry);
          });
          const sorted = Array.from(monthMap.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([month, data]) => ({ month, ...data }));
          setMonthlyBreakdown(sorted);
        } else {
          setMonthlyBreakdown([]);
        }
      }

      if (activeTab === 'by_customer') {
        const { data: invoices, error: invErr } = await supabase
          .from('acc_invoices')
          .select('id, contact_id, contact:acc_contacts(id, name)')
          .eq('company_id', companyId)
          .not('status', 'in', '("draft","cancelled")')
          .gte('invoice_date', dateFrom)
          .lte('invoice_date', dateTo);
        if (invErr) throw invErr;

        const invoiceIds = (invoices ?? []).map((i) => i.id);
        if (invoiceIds.length === 0) {
          setCustomerRows([]);
        } else {
          const { data: items, error: itemErr } = await supabase
            .from('acc_invoice_items')
            .select('invoice_id, line_total')
            .in('invoice_id', invoiceIds);
          if (itemErr) throw itemErr;

          const invoiceMap = new Map<string, { contactId: string; contactName: string }>();
          (invoices ?? []).forEach((inv) => {
            invoiceMap.set(inv.id, {
              contactId: inv.contact_id || 'unknown',
              contactName: (inv.contact as any)?.name || 'Pa klient',
            });
          });

          const customerMap = new Map<
            string,
            { contactName: string; invoiceIds: Set<string>; totalRevenue: number }
          >();
          (items ?? []).forEach((item) => {
            const inv = invoiceMap.get(item.invoice_id);
            if (!inv) return;
            const entry = customerMap.get(inv.contactId) || {
              contactName: inv.contactName,
              invoiceIds: new Set(),
              totalRevenue: 0,
            };
            entry.invoiceIds.add(item.invoice_id);
            entry.totalRevenue += item.line_total || 0;
            customerMap.set(inv.contactId, entry);
          });

          const grandTotal = Array.from(customerMap.values()).reduce(
            (s, c) => s + c.totalRevenue,
            0
          );
          const rows: CustomerRow[] = Array.from(customerMap.entries())
            .map(([contactId, data]) => ({
              contactId,
              contactName: data.contactName,
              invoiceCount: data.invoiceIds.size,
              totalRevenue: data.totalRevenue,
              percent: grandTotal > 0 ? (data.totalRevenue / grandTotal) * 100 : 0,
            }))
            .sort((a, b) => b.totalRevenue - a.totalRevenue);
          setCustomerRows(rows);
        }
      }

      if (activeTab === 'by_category') {
        const { data: txData, error: txErr } = await supabase
          .from('acc_transactions')
          .select('amount, category_id, category:acc_expense_categories(id, name)')
          .eq('company_id', companyId)
          .eq('transaction_type', 'expense')
          .gte('transaction_date', dateFrom)
          .lte('transaction_date', dateTo);
        if (txErr) throw txErr;

        const catMap = new Map<
          string,
          { categoryName: string; transactionCount: number; total: number }
        >();
        (txData ?? []).forEach((tx) => {
          const catId = tx.category_id || 'uncategorized';
          const catName = (tx.category as any)?.name || 'Pa kategori';
          const entry = catMap.get(catId) || {
            categoryName: catName,
            transactionCount: 0,
            total: 0,
          };
          entry.transactionCount += 1;
          entry.total += tx.amount || 0;
          catMap.set(catId, entry);
        });

        const grandTotal = Array.from(catMap.values()).reduce((s, c) => s + c.total, 0);
        const rows: CategoryRow[] = Array.from(catMap.entries())
          .map(([categoryId, data]) => ({
            categoryId,
            categoryName: data.categoryName,
            transactionCount: data.transactionCount,
            total: data.total,
            percent: grandTotal > 0 ? (data.total / grandTotal) * 100 : 0,
          }))
          .sort((a, b) => b.total - a.total);
        setCategoryRows(rows);
      }

      if (activeTab === 'vat') {
        const [invRes, purRes] = await Promise.all([
          supabase
            .from('acc_invoices')
            .select('id, vat_amount')
            .eq('company_id', companyId)
            .not('status', 'in', '("draft","cancelled")')
            .gte('invoice_date', dateFrom)
            .lte('invoice_date', dateTo),
          supabase
            .from('acc_purchases')
            .select('id, vat_amount')
            .eq('company_id', companyId)
            .not('status', 'in', '("draft","awaiting_document","cancelled")')
            .gte('purchase_date', dateFrom)
            .lte('purchase_date', dateTo),
        ]);
        if (invRes.error) throw invRes.error;
        if (purRes.error) throw purRes.error;

        const collectedTotal = (invRes.data ?? []).reduce(
          (s, r) => s + (r.vat_amount || 0),
          0
        );
        const paidTotal = (purRes.data ?? []).reduce(
          (s, r) => s + (r.vat_amount || 0),
          0
        );
        setVatCollected(collectedTotal);
        setVatPaid(paidTotal);

        const invoiceIds = (invRes.data ?? []).map((i) => i.id);
        const purchaseIds = (purRes.data ?? []).map((p) => p.id);

        const rateMap = new Map<number, { collected: number; paid: number }>();

        if (invoiceIds.length > 0) {
          const { data: invItems } = await supabase
            .from('acc_invoice_items')
            .select('vat_rate, line_total')
            .in('invoice_id', invoiceIds);
          (invItems ?? []).forEach((item) => {
            const rate = item.vat_rate || 0;
            const entry = rateMap.get(rate) || { collected: 0, paid: 0 };
            entry.collected += ((item.line_total || 0) * rate) / 100;
            rateMap.set(rate, entry);
          });
        }

        if (purchaseIds.length > 0) {
          const { data: purItems } = await supabase
            .from('acc_purchase_items')
            .select('vat_rate, line_total')
            .in('purchase_id', purchaseIds);
          (purItems ?? []).forEach((item) => {
            const rate = item.vat_rate || 0;
            const entry = rateMap.get(rate) || { collected: 0, paid: 0 };
            entry.paid += ((item.line_total || 0) * rate) / 100;
            rateMap.set(rate, entry);
          });
        }

        const breakdowns: VatBreakdown[] = Array.from(rateMap.entries())
          .filter(([rate]) => rate > 0)
          .sort(([a], [b]) => b - a)
          .map(([rate, data]) => ({ rate, ...data }));
        setVatBreakdowns(breakdowns);
      }

      if (activeTab === 'products') {
        const [invRes, purRes] = await Promise.all([
          supabase
            .from('acc_invoices')
            .select('id')
            .eq('company_id', companyId)
            .not('status', 'in', '("draft","cancelled")')
            .gte('invoice_date', dateFrom)
            .lte('invoice_date', dateTo),
          supabase
            .from('acc_purchases')
            .select('id')
            .eq('company_id', companyId)
            .not('status', 'in', '("draft","awaiting_document","cancelled")')
            .gte('purchase_date', dateFrom)
            .lte('purchase_date', dateTo),
        ]);
        if (invRes.error) throw invRes.error;
        if (purRes.error) throw purRes.error;

        const invoiceIds = (invRes.data ?? []).map((i) => i.id);
        const purchaseIds = (purRes.data ?? []).map((p) => p.id);

        const prodMap = new Map<
          string,
          {
            productName: string;
            unitsSold: number;
            revenue: number;
            unitsPurchased: number;
            cost: number;
          }
        >();

        if (invoiceIds.length > 0) {
          const { data: invItems } = await supabase
            .from('acc_invoice_items')
            .select('product_id, quantity, line_total, product:acc_products(id, name)')
            .in('invoice_id', invoiceIds)
            .not('product_id', 'is', null);
          (invItems ?? []).forEach((item) => {
            const pid = item.product_id!;
            const entry = prodMap.get(pid) || {
              productName: (item.product as any)?.name || 'Pa emer',
              unitsSold: 0,
              revenue: 0,
              unitsPurchased: 0,
              cost: 0,
            };
            entry.unitsSold += item.quantity || 0;
            entry.revenue += item.line_total || 0;
            prodMap.set(pid, entry);
          });
        }

        if (purchaseIds.length > 0) {
          const { data: purItems } = await supabase
            .from('acc_purchase_items')
            .select('product_id, quantity, line_total, product:acc_products(id, name)')
            .in('purchase_id', purchaseIds)
            .not('product_id', 'is', null);
          (purItems ?? []).forEach((item) => {
            const pid = item.product_id!;
            const entry = prodMap.get(pid) || {
              productName: (item.product as any)?.name || 'Pa emer',
              unitsSold: 0,
              revenue: 0,
              unitsPurchased: 0,
              cost: 0,
            };
            entry.unitsPurchased += item.quantity || 0;
            entry.cost += item.line_total || 0;
            prodMap.set(pid, entry);
          });
        }

        const rows: ProductRow[] = Array.from(prodMap.entries())
          .map(([productId, data]) => ({
            productId,
            ...data,
            profit: data.revenue - data.cost,
          }))
          .sort((a, b) => b.revenue - a.revenue);
        setProductRows(rows);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [profile?.company_id, activeTab, dateFrom, dateTo]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const exportCSV = () => {
    let headers: string[] = [];
    let rows: string[][] = [];

    if (activeTab === 'profit_loss') {
      if (monthlyBreakdown.length > 0) {
        headers = ['Muaji', 'Te Ardhurat', 'Shpenzimet', 'Fitimi Neto'];
        rows = monthlyBreakdown.map((m) => [
          m.month,
          m.income.toFixed(2),
          m.expenses.toFixed(2),
          (m.income - m.expenses).toFixed(2),
        ]);
      } else {
        headers = ['Pershkrimi', 'Shuma'];
        rows = [
          ['Te Ardhurat', totalIncome.toFixed(2)],
          ['Shpenzimet', totalExpenses.toFixed(2)],
          ['Fitimi Neto', (totalIncome - totalExpenses).toFixed(2)],
        ];
      }
    } else if (activeTab === 'by_customer') {
      headers = ['Klienti', 'Nr. Faturave', 'Te Ardhurat Totale', '%'];
      rows = customerRows.map((r) => [
        r.contactName,
        String(r.invoiceCount),
        r.totalRevenue.toFixed(2),
        r.percent.toFixed(1),
      ]);
    } else if (activeTab === 'by_category') {
      headers = ['Kategoria', 'Nr. Transaksioneve', 'Totali', '%'];
      rows = categoryRows.map((r) => [
        r.categoryName,
        String(r.transactionCount),
        r.total.toFixed(2),
        r.percent.toFixed(1),
      ]);
    } else if (activeTab === 'vat') {
      headers = ['Shkalla', 'TVSH Mbledhur', 'TVSH Paguar', 'Diferenca'];
      rows = vatBreakdowns.map((r) => [
        `${r.rate}%`,
        r.collected.toFixed(2),
        r.paid.toFixed(2),
        (r.collected - r.paid).toFixed(2),
      ]);
      rows.push(['Totali', vatCollected.toFixed(2), vatPaid.toFixed(2), (vatCollected - vatPaid).toFixed(2)]);
    } else if (activeTab === 'products') {
      headers = ['Produkti', 'Njesi Shitur', 'Te Ardhurat', 'Njesi Blere', 'Kosto', 'Fitimi'];
      rows = productRows.map((r) => [
        r.productName,
        String(r.unitsSold),
        r.revenue.toFixed(2),
        String(r.unitsPurchased),
        r.cost.toFixed(2),
        r.profit.toFixed(2),
      ]);
    }

    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `raporti_${activeTab}_${dateFrom}_${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportDatev = async () => {
    if (!profile?.company_id) return;
    try {
      setLoading(true);
      const companyId = profile.company_id;
      const [invRes, purRes, txRes] = await Promise.all([
        supabase
          .from('acc_invoices')
          .select('invoice_number, invoice_date, total, vat_amount, notes, contact:acc_contacts(name)')
          .eq('company_id', companyId)
          .not('status', 'in', '("draft","cancelled")')
          .gte('invoice_date', dateFrom)
          .lte('invoice_date', dateTo),
        supabase
          .from('acc_purchases')
          .select('purchase_number, purchase_date, total, vat_amount, notes, external_invoice_number, contact:acc_contacts(name)')
          .eq('company_id', companyId)
          .not('status', 'in', '("draft","awaiting_document","cancelled")')
          .gte('purchase_date', dateFrom)
          .lte('purchase_date', dateTo),
        supabase
          .from('acc_transactions')
          .select('transaction_type, amount, transaction_date, description, reference_number, contact:acc_contacts(name)')
          .eq('company_id', companyId)
          .eq('transaction_type', 'expense')
          .gte('transaction_date', dateFrom)
          .lte('transaction_date', dateTo),
      ]);
      if (invRes.error) throw invRes.error;
      if (purRes.error) throw purRes.error;
      if (txRes.error) throw txRes.error;

      const rows = [
        ...(invRes.data ?? []).map((r: any) => ({
          date: r.invoice_date,
          amount: r.total || 0,
          description: `Ausgangsrechnung ${r.invoice_number}`,
          account: '8400',
          counterAccount: '1200',
          invoiceNumber: r.invoice_number,
          contactName: r.contact?.name ?? '',
        })),
        ...(purRes.data ?? []).map((r: any) => ({
          date: r.purchase_date,
          amount: -(r.total || 0),
          description: `Eingangsrechnung ${r.external_invoice_number || r.purchase_number}`,
          account: '3400',
          counterAccount: '1600',
          invoiceNumber: r.external_invoice_number || r.purchase_number,
          contactName: r.contact?.name ?? '',
        })),
        ...(txRes.data ?? []).map((r: any) => ({
          date: r.transaction_date,
          amount: -(r.amount || 0),
          description: r.description || 'Ausgabe',
          account: '4980',
          counterAccount: '1200',
          invoiceNumber: r.reference_number ?? '',
          contactName: r.contact?.name ?? '',
        })),
      ];

      if (rows.length === 0) {
        setError(t('accounting.reports.noDataForPeriod') || 'Nuk ka te dhena per periudhen e zgjedhur');
        return;
      }

      exportDatevCSV(rows, dateFrom, dateTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gabim ne eksport DATEV');
    } finally {
      setLoading(false);
    }
  };

  const handleExportUstva = async () => {
    if (!profile?.company_id) return;
    try {
      setLoading(true);
      const companyId = profile.company_id;
      const [invRes, purRes, compRes] = await Promise.all([
        supabase
          .from('acc_invoices')
          .select('id, vat_amount, subtotal')
          .eq('company_id', companyId)
          .not('status', 'in', '("draft","cancelled")')
          .gte('invoice_date', dateFrom)
          .lte('invoice_date', dateTo),
        supabase
          .from('acc_purchases')
          .select('vat_amount')
          .eq('company_id', companyId)
          .not('status', 'in', '("draft","awaiting_document","cancelled")')
          .gte('purchase_date', dateFrom)
          .lte('purchase_date', dateTo),
        supabase.from('companies').select('name').eq('id', companyId).maybeSingle(),
      ]);
      if (invRes.error) throw invRes.error;
      if (purRes.error) throw purRes.error;

      const invoiceIds = (invRes.data ?? []).map((i: any) => i.id);
      let rev19 = 0, rev7 = 0, rev0 = 0, vat19 = 0, vat7 = 0;

      if (invoiceIds.length > 0) {
        const { data: items } = await supabase
          .from('acc_invoice_items')
          .select('vat_rate, line_total')
          .in('invoice_id', invoiceIds);
        (items ?? []).forEach((it: any) => {
          const net = it.line_total || 0;
          if (it.vat_rate === 19) { rev19 += net; vat19 += (net * 19) / 100; }
          else if (it.vat_rate === 7) { rev7 += net; vat7 += (net * 7) / 100; }
          else { rev0 += net; }
        });
      }

      const vatPaid = (purRes.data ?? []).reduce((s: number, r: any) => s + (r.vat_amount || 0), 0);
      const vatDue = (vat19 + vat7) - vatPaid;

      exportUstvaCSV(
        {
          period: { from: dateFrom, to: dateTo },
          revenue19: rev19,
          revenue7: rev7,
          revenue0: rev0,
          vatCollected19: vat19,
          vatCollected7: vat7,
          vatPaid,
          vatDue,
        },
        compRes.data?.name || 'Company'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gabim ne eksport UStVA');
    } finally {
      setLoading(false);
    }
  };

  const netProfit = totalIncome - totalExpenses;
  const vatDue = vatCollected - vatPaid;
  const maxBar = Math.max(totalIncome, totalExpenses, 1);

  const renderProfitLoss = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t('common.revenue')}</p>
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
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Fitimi Neto</p>
              <p className={`text-2xl font-bold mt-2 ${netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {formatCurrency(netProfit)}
              </p>
            </div>
            <div className={`p-2.5 rounded-xl ${netProfit >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`}>
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Krahasimi Vizual</h3>
        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-gray-600">{t('common.revenue')}</span>
              <span className="font-medium text-green-600">{formatCurrency(totalIncome)}</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-6">
              <div
                className="bg-green-500 h-6 rounded-full transition-all duration-500"
                style={{ width: `${(totalIncome / maxBar) * 100}%` }}
              />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-gray-600">Shpenzimet</span>
              <span className="font-medium text-red-600">{formatCurrency(totalExpenses)}</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-6">
              <div
                className="bg-red-500 h-6 rounded-full transition-all duration-500"
                style={{ width: `${(totalExpenses / maxBar) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {monthlyBreakdown.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">Ndarja Mujore</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Muaji</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('common.revenue')}</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Shpenzimet</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Fitimi Neto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {monthlyBreakdown.map((m) => {
                  const net = m.income - m.expenses;
                  return (
                    <tr key={m.month} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3 text-sm font-medium text-gray-900">{m.month}</td>
                      <td className="px-6 py-3 text-sm text-right text-green-600 font-medium">{formatCurrency(m.income)}</td>
                      <td className="px-6 py-3 text-sm text-right text-red-600 font-medium">{formatCurrency(m.expenses)}</td>
                      <td className={`px-6 py-3 text-sm text-right font-bold ${net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {formatCurrency(net)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );

  const renderByCustomer = () => (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('common.customer')}</th>
              <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Nr. Faturave</th>
              <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('common.teArdhuratTotale')}</th>
              <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {customerRows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-16 text-center">
                  <Users className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p className="text-gray-500 font-medium">{t('common.asnjeTeDhenePerKetePeriudhe')}</p>
                </td>
              </tr>
            ) : (
              customerRows.map((r) => (
                <tr key={r.contactId} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3 text-sm font-medium text-gray-900">{r.contactName}</td>
                  <td className="px-6 py-3 text-sm text-right text-gray-600">{r.invoiceCount}</td>
                  <td className="px-6 py-3 text-sm text-right font-medium text-gray-900">{formatCurrency(r.totalRevenue)}</td>
                  <td className="px-6 py-3 text-sm text-right text-gray-500">{r.percent.toFixed(1)}%</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const maxCategory = categoryRows.length > 0 ? categoryRows[0].total : 1;

  const renderByCategory = () => (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('common.kategoria')}</th>
              <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Transaksione</th>
              <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('common.total')}</th>
              <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">%</th>
              <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-48"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {categoryRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-16 text-center">
                  <FolderOpen className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p className="text-gray-500 font-medium">{t('common.asnjeTeDhenePerKetePeriudhe')}</p>
                </td>
              </tr>
            ) : (
              categoryRows.map((r) => (
                <tr key={r.categoryId} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3 text-sm font-medium text-gray-900">{r.categoryName}</td>
                  <td className="px-6 py-3 text-sm text-right text-gray-600">{r.transactionCount}</td>
                  <td className="px-6 py-3 text-sm text-right font-medium text-gray-900">{formatCurrency(r.total)}</td>
                  <td className="px-6 py-3 text-sm text-right text-gray-500">{r.percent.toFixed(1)}%</td>
                  <td className="px-6 py-3">
                    <div className="w-full bg-gray-100 rounded-full h-3">
                      <div
                        className="bg-emerald-500 h-3 rounded-full transition-all duration-500"
                        style={{ width: `${(r.total / maxCategory) * 100}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderVat = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-emerald-600 rounded-xl p-5 text-white">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-100">TVSH Mbledhur</p>
          <p className="text-2xl font-bold mt-2">{formatCurrency(vatCollected)}</p>
          <p className="text-xs text-emerald-200 mt-1">Nga faturat e derguara/paguara</p>
        </div>
        <div className="bg-red-600 rounded-xl p-5 text-white">
          <p className="text-xs font-medium uppercase tracking-wide text-red-100">TVSH Paguar</p>
          <p className="text-2xl font-bold mt-2">{formatCurrency(vatPaid)}</p>
          <p className="text-xs text-red-200 mt-1">Nga blerjet e pranuara/paguara</p>
        </div>
        <div className="bg-blue-600 rounded-xl p-5 text-white">
          <p className="text-xs font-medium uppercase tracking-wide text-blue-100">TVSH per Pagese</p>
          <p className="text-2xl font-bold mt-2">{formatCurrency(vatDue)}</p>
          <p className="text-xs text-blue-200 mt-1">Diferenca (mbledhur - paguar)</p>
        </div>
      </div>

      {vatBreakdowns.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">{t('common.ndarjaSipasShkallesSeTvshSe')}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Shkalla</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Mbledhur</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Paguar</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Diferenca</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {vatBreakdowns.map((r) => (
                  <tr key={r.rate} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-3 text-sm font-medium text-gray-900">{r.rate}%</td>
                    <td className="px-6 py-3 text-sm text-right text-emerald-600 font-medium">{formatCurrency(r.collected)}</td>
                    <td className="px-6 py-3 text-sm text-right text-red-600 font-medium">{formatCurrency(r.paid)}</td>
                    <td className={`px-6 py-3 text-sm text-right font-bold ${r.collected - r.paid >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                      {formatCurrency(r.collected - r.paid)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );

  const renderProducts = () => (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Produkti</th>
              <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Njesi Shitur</th>
              <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('common.revenue')}</th>
              <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Njesi Blere</th>
              <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Kosto</th>
              <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Fitimi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {productRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-16 text-center">
                  <Package className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p className="text-gray-500 font-medium">{t('common.asnjeTeDhenePerKetePeriudhe')}</p>
                </td>
              </tr>
            ) : (
              productRows.map((r) => (
                <tr key={r.productId} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3 text-sm font-medium text-gray-900">{r.productName}</td>
                  <td className="px-6 py-3 text-sm text-right text-gray-600">{r.unitsSold}</td>
                  <td className="px-6 py-3 text-sm text-right font-medium text-green-600">{formatCurrency(r.revenue)}</td>
                  <td className="px-6 py-3 text-sm text-right text-gray-600">{r.unitsPurchased}</td>
                  <td className="px-6 py-3 text-sm text-right font-medium text-red-600">{formatCurrency(r.cost)}</td>
                  <td className={`px-6 py-3 text-sm text-right font-bold ${r.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {formatCurrency(r.profit)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'profit_loss':
        return renderProfitLoss();
      case 'by_customer':
        return renderByCustomer();
      case 'by_category':
        return renderByCategory();
      case 'vat':
        return renderVat();
      case 'products':
        return renderProducts();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Raportet Financiare</h1>
          <p className="text-gray-500 mt-1">Analizo performancen financiare te biznesit</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors font-medium text-sm"
          >
            <Printer className="w-4 h-4" />
            Printo
          </button>
          <button
            onClick={exportCSV}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors font-medium text-sm"
          >
            <Download className="w-4 h-4" />
            CSV
          </button>
          <button
            onClick={handleExportDatev}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-white bg-slate-800 rounded-lg hover:bg-slate-900 transition-colors font-medium text-sm"
            title="Eksport per kontabilist (DATEV)"
          >
            <Download className="w-4 h-4" />
            DATEV
          </button>
          <button
            onClick={handleExportUstva}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-white bg-teal-700 rounded-lg hover:bg-teal-800 transition-colors font-medium text-sm"
            title="Umsatzsteuer-Voranmeldung"
          >
            <Download className="w-4 h-4" />
            UStVA
          </button>
          <Link
            to="/accounting/datev-export"
            className="inline-flex items-center gap-2 px-4 py-2.5 text-slate-700 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition-colors font-medium text-sm"
            title="Detailed DATEV export (EXTF v700)"
          >
            <FileCode2 className="w-4 h-4" />
            DATEV Detailed
          </Link>
          {saftEligible && (
            <button
              onClick={() => setSaftOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 transition-colors font-medium text-sm"
              title={`SAF-T export (${companyCountry})`}
            >
              <Globe2 className="w-4 h-4" />
              SAF-T {companyCountry}
            </button>
          )}
          <Link
            to="/accounting/test-export"
            className="inline-flex items-center gap-2 px-4 py-2.5 text-slate-600 hover:text-slate-900 font-medium text-sm"
          >
            Test Exports
          </Link>
        </div>
      </div>

      {saftOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSaftOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">SAF-T Export ({companyCountry})</h3>
            <p className="text-sm text-slate-600 mb-4">
              Generate and download the SAF-T XML for the selected period.
            </p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">From</label>
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">To</label>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setSaftOpen(false)} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700">Cancel</button>
              <button onClick={handleGenerateSaft} disabled={saftBusy} className="px-4 py-2 rounded-lg bg-emerald-700 text-white disabled:opacity-50">
                {saftBusy ? 'Generating...' : 'Generate'}
              </button>
            </div>
          </div>
        </div>
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

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 mb-1">Nga data</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
              />
            </div>
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 mb-1">Deri ne date</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
              />
            </div>
          </div>
          <button
            onClick={fetchReport}
            disabled={loading}
            className="inline-flex items-center gap-2 px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium text-sm disabled:opacity-50"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Gjenero
          </button>
        </div>
      </div>

      <div className="border-b border-gray-200">
        <nav className="flex gap-0 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? 'border-emerald-600 text-emerald-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {loading ? (
        <TableRowsSkeleton rows={10} cols={4} />
      ) : (
        renderActiveTab()
      )}
    </div>
  );
}
