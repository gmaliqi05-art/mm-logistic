import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, X, AlertTriangle, FileCheck2, Ban } from 'lucide-react';
import { TableRowsSkeleton } from '../../components/ui/Skeleton';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { formatCurrency } from '../../types/accounting';

interface StmtLine {
  id: string;
  booking_date: string | null;
  value_date: string | null;
  amount: number;
  currency: string;
  counterparty_name: string;
  counterparty_iban: string;
  reference: string;
  end_to_end_id: string;
  description: string;
  matched_transaction_id: string | null;
  match_confidence: number;
  match_status: 'unmatched' | 'suggested' | 'confirmed' | 'ignored';
}

interface MatchTx {
  id: string;
  amount: number;
  currency: string;
  transaction_date: string;
  description: string | null;
  transaction_type: string;
}

export default function BankReconciliation() {
  const { profile } = useAuth();
  const [sp] = useSearchParams();
  const accountId = sp.get('account') || '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<StmtLine[]>([]);
  const [txCache, setTxCache] = useState<Record<string, MatchTx>>({});
  const [filter, setFilter] = useState<'unmatched' | 'suggested' | 'confirmed' | 'all'>('suggested');
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.company_id && accountId) fetchAll();
  }, [profile?.company_id, accountId, filter]);

  async function fetchAll() {
    try {
      setLoading(true);
      setError(null);
      let q = supabase
        .from('acc_bank_statement_lines')
        .select('*')
        .eq('company_id', profile!.company_id!)
        .eq('bank_account_id', accountId)
        .order('booking_date', { ascending: false })
        .limit(300);
      if (filter !== 'all') q = q.eq('match_status', filter);
      const { data, error: err } = await q;
      if (err) throw err;
      setLines((data ?? []) as StmtLine[]);
      const txIds = (data ?? []).map((l) => l.matched_transaction_id).filter(Boolean) as string[];
      if (txIds.length > 0) {
        const { data: txs } = await supabase
          .from('acc_transactions')
          .select('id, amount, currency, transaction_date, description, transaction_type')
          .in('id', txIds);
        const map: Record<string, MatchTx> = {};
        (txs ?? []).forEach((t) => {
          map[t.id] = t as MatchTx;
        });
        setTxCache(map);
      }
    } catch (err: any) {
      setError(err.message || 'Error');
    } finally {
      setLoading(false);
    }
  }

  async function confirmMatch(line: StmtLine) {
    if (!line.matched_transaction_id) return;
    try {
      setBusyId(line.id);
      const nowIso = new Date().toISOString();
      const { error: e1 } = await supabase
        .from('acc_bank_statement_lines')
        .update({ match_status: 'confirmed' })
        .eq('id', line.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase
        .from('acc_transactions')
        .update({ reconciled_at: nowIso, bank_statement_line_id: line.id })
        .eq('id', line.matched_transaction_id);
      if (e2) throw e2;
      await fetchAll();
    } catch (err: any) {
      setError(err.message || 'Error');
    } finally {
      setBusyId(null);
    }
  }

  async function rejectMatch(line: StmtLine) {
    try {
      setBusyId(line.id);
      const { error: err } = await supabase
        .from('acc_bank_statement_lines')
        .update({ matched_transaction_id: null, match_confidence: 0, match_status: 'unmatched' })
        .eq('id', line.id);
      if (err) throw err;
      await fetchAll();
    } catch (err: any) {
      setError(err.message || 'Error');
    } finally {
      setBusyId(null);
    }
  }

  async function ignoreLine(line: StmtLine) {
    try {
      setBusyId(line.id);
      const { error: err } = await supabase
        .from('acc_bank_statement_lines')
        .update({ match_status: 'ignored' })
        .eq('id', line.id);
      if (err) throw err;
      await fetchAll();
    } catch (err: any) {
      setError(err.message || 'Error');
    } finally {
      setBusyId(null);
    }
  }

  const counts = useMemo(() => {
    const c = { unmatched: 0, suggested: 0, confirmed: 0, ignored: 0 };
    lines.forEach((l) => {
      c[l.match_status] = (c[l.match_status] ?? 0) + 1;
    });
    return c;
  }, [lines]);

  if (!accountId) {
    return (
      <div className="p-6">
        <Link to="/accounting/bank-accounts" className="text-emerald-600 text-sm">« Kthehu te Llogarite Bankare</Link>
        <p className="mt-4 text-gray-600">Zgjidhni nje llogari bankare per te filluar pajtimin.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/accounting/bank-accounts" className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileCheck2 className="w-6 h-6 text-emerald-600" />
            Pajtimi i ekstrakteve bankare
          </h1>
          <p className="text-gray-500 text-sm mt-1">Kontrollo sugjerimet automatike dhe konfirmoji me transaksionet e regjistruara.</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500" />
          <p className="text-red-700 text-sm flex-1">{error}</p>
          <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {(['suggested', 'unmatched', 'confirmed', 'all'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              filter === s ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {s === 'suggested' && `Sugjeruar (${counts.suggested})`}
            {s === 'unmatched' && `Pa perputhje (${counts.unmatched})`}
            {s === 'confirmed' && `Konfirmuar (${counts.confirmed})`}
            {s === 'all' && 'Te gjitha'}
          </button>
        ))}
      </div>

      {loading ? (
        <TableRowsSkeleton rows={8} cols={6} />
      ) : lines.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-xl p-12 text-center text-gray-500">
          Nuk ka rreshta per kete filter.
        </div>
      ) : (
        <div className="space-y-3">
          {lines.map((line) => {
            const tx = line.matched_transaction_id ? txCache[line.matched_transaction_id] : null;
            const conf = Math.round(line.match_confidence * 100);
            return (
              <div key={line.id} className="bg-white border border-gray-100 rounded-xl p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <div className="text-xs text-gray-500">{line.booking_date ?? '—'}</div>
                  <div className="text-sm font-semibold text-gray-900 mt-0.5">
                    {line.counterparty_name || line.counterparty_iban || '—'}
                  </div>
                  <div className="text-xs text-gray-600 mt-1 line-clamp-2">{line.description || line.reference}</div>
                  <div className={`mt-2 text-base font-bold ${line.amount < 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {line.amount > 0 ? '+' : ''}
                    {formatCurrency(line.amount, line.currency as any)}
                  </div>
                </div>

                <div className="md:col-span-1 border-l border-gray-100 pl-4">
                  {tx ? (
                    <>
                      <div className="text-xs text-gray-500 flex items-center gap-2">
                        Sugjerim
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          conf >= 90 ? 'bg-green-100 text-green-800' : conf >= 60 ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-700'
                        }`}>{conf}%</span>
                      </div>
                      <div className="text-sm font-semibold text-gray-900 mt-0.5">{tx.description || '—'}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{tx.transaction_date} · {tx.transaction_type}</div>
                      <div className="mt-1 text-sm font-bold text-gray-800">{formatCurrency(tx.amount, tx.currency as any)}</div>
                    </>
                  ) : (
                    <div className="text-xs text-gray-400 italic">Pa sugjerim. Kerkoni manualisht ne transaksione.</div>
                  )}
                </div>

                <div className="flex flex-col items-stretch gap-2">
                  {line.match_status !== 'confirmed' && tx && (
                    <button
                      disabled={busyId === line.id}
                      onClick={() => confirmMatch(line)}
                      className="inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-4 h-4" /> Konfirmo
                    </button>
                  )}
                  {line.match_status === 'suggested' && (
                    <button
                      disabled={busyId === line.id}
                      onClick={() => rejectMatch(line)}
                      className="inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                    >
                      <X className="w-4 h-4" /> Refuzo sugjerimin
                    </button>
                  )}
                  {line.match_status !== 'ignored' && line.match_status !== 'confirmed' && (
                    <button
                      disabled={busyId === line.id}
                      onClick={() => ignoreLine(line)}
                      className="inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
                    >
                      <Ban className="w-4 h-4" /> Injoro
                    </button>
                  )}
                  {line.match_status === 'confirmed' && (
                    <div className="inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-green-700 bg-green-50 rounded-lg">
                      <CheckCircle2 className="w-4 h-4" /> I pajtuar
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
