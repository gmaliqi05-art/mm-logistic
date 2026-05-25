import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownLeft, ArrowUpRight, FileText, Receipt, Loader2, Eye, EyeOff, Lock } from 'lucide-react';
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
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

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

  const fmt = (v: number) => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('ep_language') : null;
    const tag = saved === 'sq' ? 'sq-AL'
      : saved === 'en' ? 'en-GB'
      : saved === 'fr' ? 'fr-FR'
      : 'de-DE';
    return new Intl.NumberFormat(tag, { style: 'currency', currency: data.currency, maximumFractionDigits: 0 }).format(v);
  };

  const cards: Array<{
    key: string;
    label: string;
    value: string;
    sub?: string;
    icon: typeof FileText;
    accent: string;
    to: string;
  }> = [
    {
      key: 'out',
      label: 'Fatura dalese (30d)',
      value: fmt(data.outgoingInvoicesTotal),
      sub: data.outgoingInvoicesOverdue > 0 ? `${data.outgoingInvoicesOverdue} te vonuara` : 'Ne kohe',
      icon: FileText,
      accent: 'text-emerald-700 bg-emerald-50 border-emerald-100',
      to: '/accounting/invoices',
    },
    {
      key: 'in',
      label: 'Fatura hyrese (30d)',
      value: fmt(data.incomingInvoicesTotal),
      sub: data.incomingInvoicesOverdue > 0 ? `${data.incomingInvoicesOverdue} te vonuara` : 'Ne kohe',
      icon: FileText,
      accent: 'text-amber-700 bg-amber-50 border-amber-100',
      to: '/accounting/purchases',
    },
    {
      key: 'recIn',
      label: 'Arketime (30d)',
      value: fmt(data.receiptsIn),
      icon: ArrowDownLeft,
      accent: 'text-teal-700 bg-teal-50 border-teal-100',
      to: '/accounting/transactions',
    },
    {
      key: 'recOut',
      label: 'Pagesa (30d)',
      value: fmt(data.receiptsOut),
      icon: ArrowUpRight,
      accent: 'text-rose-700 bg-rose-50 border-rose-100',
      to: '/accounting/transactions',
    },
  ];

  const allRevealed = cards.every((c) => revealed[c.key]);

  function toggleCard(key: string) {
    setRevealed((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function toggleAll() {
    if (allRevealed) {
      setRevealed({});
    } else {
      const next: Record<string, boolean> = {};
      cards.forEach((c) => { next[c.key] = true; });
      setRevealed(next);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
        <Receipt className="w-4 h-4 text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-900">Permbledhje financiare</h2>
        <span className="ml-auto text-[11px] text-slate-500 hidden sm:inline">30 ditet e fundit</span>
        <button
          type="button"
          onClick={toggleAll}
          title={allRevealed ? 'Fshih te gjitha' : 'Shfaq te gjitha'}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-teal-700 bg-slate-100 hover:bg-teal-50 rounded-full px-2 py-1 transition-colors"
        >
          {allRevealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          <span className="hidden sm:inline">{allRevealed ? 'Fshih' : 'Shfaq'}</span>
        </button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-0 divide-x divide-slate-100">
        {cards.map((c) => {
          const Icon = c.icon;
          const isRevealed = !!revealed[c.key];
          return (
            <div key={c.key} className="relative group">
              <button
                type="button"
                onClick={() => toggleCard(c.key)}
                className="w-full text-left p-4 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border ${c.accent}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <span
                    title={isRevealed ? 'Fshih' : 'Shfaq per arsye sigurie'}
                    className="p-1 rounded-full text-slate-400 hover:text-teal-700 hover:bg-teal-50 transition-colors"
                  >
                    {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 uppercase tracking-wide mt-2">{c.label}</div>
                <div
                  className={`text-lg font-bold mt-0.5 transition-all ${
                    isRevealed ? 'text-slate-900' : 'text-slate-300 tracking-widest select-none'
                  }`}
                  aria-label={isRevealed ? c.value : 'Vlera e fshehur'}
                >
                  {isRevealed ? c.value : '••••••'}
                </div>
                {c.sub && (
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {isRevealed ? c.sub : 'Kliko per te shfaqur'}
                  </div>
                )}
              </button>
              {isRevealed && (
                <Link
                  to={c.to}
                  className="absolute bottom-2 right-2 text-[10px] font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 px-2 py-0.5 rounded-full transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  Hap
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
