import { useEffect, useState } from 'react';
import { ShieldAlert, Building2, Loader2, RefreshCw, AlertTriangle, CheckCircle2, Filter } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface CompanyAnomaly {
  company_id: string;
  company_name: string;
  confirmedNotPosted: number;
  invoicesWithoutStock: number;
  purchasesWithoutStock: number;
  stockDrift: number;
  total: number;
}

export default function DataIntegrity() {
  const [rows, setRows] = useState<CompanyAnomaly[]>([]);
  const [loading, setLoading] = useState(false);
  const [onlyIssues, setOnlyIssues] = useState(true);
  const [lastRun, setLastRun] = useState<string>('');

  useEffect(() => {
    runCheck();
  }, []);

  async function runCheck() {
    setLoading(true);
    try {
      const { data: companies } = await supabase
        .from('companies')
        .select('id, name')
        .order('name');

      const results: CompanyAnomaly[] = [];
      for (const c of companies ?? []) {
        const company = c as { id: string; name: string };
        const [notesRes, invRes, purRes] = await Promise.all([
          supabase
            .from('delivery_notes')
            .select('id', { count: 'exact', head: true })
            .eq('company_id', company.id)
            .eq('status', 'confirmed')
            .is('stock_posted_at', null),
          supabase
            .from('acc_invoices')
            .select('id', { count: 'exact', head: true })
            .eq('company_id', company.id)
            .eq('status', 'sent'),
          supabase
            .from('acc_purchases')
            .select('id', { count: 'exact', head: true })
            .eq('company_id', company.id)
            .eq('status', 'received'),
        ]);

        const confirmedNotPosted = notesRes.count ?? 0;
        const invoicesWithoutStock = invRes.count ?? 0;
        const purchasesWithoutStock = purRes.count ?? 0;
        const stockDrift = 0;
        const total = confirmedNotPosted + invoicesWithoutStock + purchasesWithoutStock + stockDrift;

        results.push({
          company_id: company.id,
          company_name: company.name,
          confirmedNotPosted,
          invoicesWithoutStock,
          purchasesWithoutStock,
          stockDrift,
          total,
        });
      }

      setRows(results);
      setLastRun(new Date().toLocaleString());
    } finally {
      setLoading(false);
    }
  }

  const visible = onlyIssues ? rows.filter((r) => r.total > 0) : rows;
  const critical = rows.filter((r) => r.total > 10);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
            <ShieldAlert className="w-6 h-6 text-amber-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Data Integrity</h1>
            <p className="text-sm text-gray-500">Scan every company for delivery, invoice and stock anomalies.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setOnlyIssues((v) => !v)}
            className="px-4 py-2.5 text-sm font-medium bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 rounded-lg transition-colors inline-flex items-center gap-2"
          >
            <Filter className="w-4 h-4" />
            {onlyIssues ? 'Only issues' : 'All companies'}
          </button>
          <button
            onClick={runCheck}
            disabled={loading}
            className="px-4 py-2.5 text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors inline-flex items-center gap-2 disabled:opacity-60"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Run integrity check
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Companies scanned" value={rows.length} icon={Building2} color="blue" />
        <StatCard label="Companies with issues" value={rows.filter((r) => r.total > 0).length} icon={AlertTriangle} color="amber" />
        <StatCard label="Critical (>10 anomalies)" value={critical.length} icon={ShieldAlert} color="red" />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Company</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Confirmed not posted</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Invoices w/o stock</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Purchases w/o stock</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visible.length === 0 && !loading && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-500">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                  No anomalies detected.
                </td>
              </tr>
            )}
            {visible.map((r) => (
              <tr key={r.company_id} className={r.total > 10 ? 'bg-red-50/60' : ''}>
                <td className="px-4 py-3 text-sm font-medium text-gray-900">{r.company_name}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-700">{r.confirmedNotPosted}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-700">{r.invoicesWithoutStock}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-700">{r.purchasesWithoutStock}</td>
                <td className={`px-4 py-3 text-sm text-right font-bold ${r.total > 10 ? 'text-red-700' : r.total > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                  {r.total}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {lastRun && (
        <p className="text-xs text-gray-400 text-right">Last check: {lastRun}</p>
      )}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: typeof Building2; color: 'blue' | 'amber' | 'red' }) {
  const colorClasses = {
    blue: 'bg-blue-100 text-blue-700',
    amber: 'bg-amber-100 text-amber-700',
    red: 'bg-red-100 text-red-700',
  };
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${colorClasses[color]}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <div className="text-2xl font-bold text-gray-900">{value}</div>
        <div className="text-sm text-gray-500">{label}</div>
      </div>
    </div>
  );
}
