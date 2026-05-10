import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownLeft, ArrowUpRight, FileText, Receipt, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Props {
  companyId: string | null;
}

interface Snapshot {
  incomingInvoicesTotal: number;
  incomingInvoicesOverdue: number;
  outgoingInvoicesTotal: number;
  outgoingInvoicesOverdue: number;
  receiptsIn: number;
  receiptsOut: number;
  currency: string;
}

const OVERDUE_STATUSES = ['overdue', 'partial', 'received', 'sent'];

export default function FinanceSnapshot({ companyId }: Props) {
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const todayIso = new Date().toISOString().slice(0, 10);

      const [outRes, outOverdueRes, inRes, inOverdueRes, txRes] = await Promise.all([
        supabase
          .from('acc_invoices')
          .select('total, currency')
          .eq('company_id', companyId)
          .gte('invoice_date', since),
        supabase
          .from('acc_invoices')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .in('status', OVERDUE_STATUSES)
          .lt('due_date', todayIso),
        supabase
          .from('acc_purchases')
          .select('total, currency')
          .eq('company_id', companyId)
          .gte('purchase_date', since),
        supabase
          .from('acc_purchases')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .in('status', OVERDUE_STATUSES)
          .lt('due_date', todayIso),
        supabase
          .from('acc_transactions')
          .select('amount, transaction_type, currency')
          .eq('company_id', companyId)
          .gte('transaction_date', since),
      ]);
      if (cancelled) return;
      const sumBy = (rows: Array<{ total?: number | null }> | null | undefined) =>
        (rows ?? []).reduce((a, r) => a + Number(r.total ?? 0), 0);
      const txs = (txRes.data ?? []) as Array<{ amount: number; transaction_type: string }>;
      const receiptsIn = txs.filter((t) => t.transaction_type === 'income').reduce((a, r) => a + Number(r.amount ?? 0), 0);
      const receiptsOut = txs.filter((t) => t.transaction_type === 'expense').reduce((a, r) => a + Number(r.amount ?? 0), 0);
      const currency =
        ((outRes.data ?? [])[0] as { currency?: string })?.currency ||
        ((inRes.data ?? [])[0] as { currency?: string })?.currency ||
        'EUR';
      setData({
        outgoingInvoicesTotal: sumBy(outRes.data as Array<{ total: number }>),
        outgoingInvoicesOverdue: outOverdueRes.count ?? 0,
        incomingInvoicesTotal: sumBy(inRes.data as Array<{ total: number }>),
        incomingInvoicesOverdue: inOverdueRes.count ?? 0,
        receiptsIn,
        receiptsOut,
        currency,
      });
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  if (!companyId) return null;
  if (loading || !data) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-center h-24">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      </div>
    );
  }

  const fmt = (v: number) =>
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: data.currency, maximumFractionDigits: 0 }).format(v);

  const cards: Array<{
    label: string;
    value: string;
    sub?: string;
    icon: typeof FileText;
    accent: string;
    to: string;
  }> = [
    {
      label: 'Fatura dalese (30d)',
      value: fmt(data.outgoingInvoicesTotal),
      sub: data.outgoingInvoicesOverdue > 0 ? `${data.outgoingInvoicesOverdue} te vonuara` : 'Ne kohe',
      icon: FileText,
      accent: 'text-emerald-700 bg-emerald-50 border-emerald-100',
      to: '/accounting/invoices',
    },
    {
      label: 'Fatura hyrese (30d)',
      value: fmt(data.incomingInvoicesTotal),
      sub: data.incomingInvoicesOverdue > 0 ? `${data.incomingInvoicesOverdue} te vonuara` : 'Ne kohe',
      icon: FileText,
      accent: 'text-amber-700 bg-amber-50 border-amber-100',
      to: '/accounting/purchases',
    },
    {
      label: 'Arketime (30d)',
      value: fmt(data.receiptsIn),
      icon: ArrowDownLeft,
      accent: 'text-teal-700 bg-teal-50 border-teal-100',
      to: '/accounting/transactions',
    },
    {
      label: 'Pagesa (30d)',
      value: fmt(data.receiptsOut),
      icon: ArrowUpRight,
      accent: 'text-rose-700 bg-rose-50 border-rose-100',
      to: '/accounting/transactions',
    },
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
        <Receipt className="w-4 h-4 text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-900">Permbledhje financiare</h2>
        <span className="ml-auto text-[11px] text-slate-500">30 ditet e fundit</span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-0 divide-x divide-slate-100">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link key={c.label} to={c.to} className="p-4 hover:bg-slate-50 transition-colors">
              <div className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border ${c.accent} mb-2`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="text-[11px] text-slate-500 uppercase tracking-wide">{c.label}</div>
              <div className="text-lg font-bold text-slate-900 mt-0.5">{c.value}</div>
              {c.sub && <div className="text-[11px] text-slate-500 mt-0.5">{c.sub}</div>}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
