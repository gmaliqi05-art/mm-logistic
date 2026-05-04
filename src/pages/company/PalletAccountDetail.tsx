import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Download, Plus, TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { logger } from '../../utils/logger';

interface AccountHeader {
  id: string;
  partner_contact_id: string;
  pallet_type: string;
  current_balance: number;
  opening_balance: number;
  partner_name: string;
  notes: string;
}

interface Transaction {
  id: string;
  transaction_date: string;
  direction: 'in' | 'out' | 'adjustment';
  quantity: number;
  reference: string;
  notes: string;
  delivery_note_id: string | null;
  created_at: string;
}

export default function PalletAccountDetail() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const [header, setHeader] = useState<AccountHeader | null>(null);
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdj, setShowAdj] = useState(false);
  const [adjQty, setAdjQty] = useState('');
  const [adjReason, setAdjReason] = useState('');
  const [adjBusy, setAdjBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data: acc, error } = await supabase
        .from('pallet_accounts')
        .select('id, partner_contact_id, pallet_type, current_balance, opening_balance, notes, acc_contacts(name)')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      if (!acc) return;
      setHeader({
        id: String(acc.id),
        partner_contact_id: String(acc.partner_contact_id),
        pallet_type: String(acc.pallet_type),
        current_balance: Number(acc.current_balance),
        opening_balance: Number(acc.opening_balance),
        notes: String(acc.notes ?? ''),
        partner_name: ((acc.acc_contacts as { name?: string } | null)?.name) ?? '—',
      });

      const { data: ts } = await supabase
        .from('pallet_account_transactions')
        .select('id, transaction_date, direction, quantity, reference, notes, delivery_note_id, created_at')
        .eq('pallet_account_id', id)
        .order('transaction_date', { ascending: false })
        .order('created_at', { ascending: false });
      setTxns((ts ?? []) as Transaction[]);
    } catch (err) {
      logger.error('PalletAccountDetail load failed', { error: err });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [id]);

  const submitAdjustment = async () => {
    if (!id || !profile?.company_id || !profile?.id) return;
    const q = parseInt(adjQty, 10);
    if (!Number.isFinite(q) || q === 0) return;
    setAdjBusy(true);
    try {
      const { error } = await supabase.from('pallet_account_transactions').insert({
        company_id: profile.company_id,
        pallet_account_id: id,
        direction: 'adjustment',
        quantity: q,
        pallet_type: header?.pallet_type ?? 'EPAL',
        reference: 'Manual adjustment',
        notes: adjReason,
        created_by: profile.id,
      });
      if (error) throw error;
      setShowAdj(false);
      setAdjQty('');
      setAdjReason('');
      await load();
    } catch (err) {
      logger.error('adjustment failed', { error: err });
    } finally {
      setAdjBusy(false);
    }
  };

  const generatePdf = async () => {
    if (!id) return;
    setPdfBusy(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-pallet-statement`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ pallet_account_id: id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'PDF generation failed');
      if (json.download_url) window.open(json.download_url, '_blank');
    } catch (err) {
      logger.error('PDF generation failed', { error: err });
      alert(err instanceof Error ? err.message : 'PDF failed');
    } finally {
      setPdfBusy(false);
    }
  };

  if (loading || !header) {
    return <div className="p-8 text-center text-sm text-slate-500">Loading...</div>;
  }

  let running = header.opening_balance;
  const withRunning = [...txns].reverse().map((t) => {
    const delta = t.direction === 'in' ? t.quantity : t.direction === 'out' ? -t.quantity : t.quantity;
    running += delta;
    return { ...t, running };
  }).reverse();

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/company/pallet-accounts" className="p-2 rounded-lg hover:bg-slate-100">
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{header.partner_name}</h1>
            <p className="text-sm text-slate-600">{header.pallet_type} pallet ledger</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowAdj(true)} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 text-sm hover:bg-slate-50">
            <Plus className="w-4 h-4" /> Adjustment
          </button>
          <button onClick={generatePdf} disabled={pdfBusy} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-50">
            {pdfBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            PDF Statement
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Current balance</div>
          <div className={`text-3xl font-bold ${header.current_balance > 0 ? 'text-emerald-700' : header.current_balance < 0 ? 'text-red-700' : 'text-slate-900'}`}>
            {header.current_balance > 0 ? '+' : ''}{header.current_balance}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {header.current_balance > 0 ? 'Partner owes us' : header.current_balance < 0 ? 'We owe partner' : 'Balanced'}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Opening balance</div>
          <div className="text-3xl font-bold text-slate-900">{header.opening_balance}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Total transactions</div>
          <div className="text-3xl font-bold text-slate-900">{txns.length}</div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900">Ledger</h2>
        </div>
        {txns.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No transactions yet.</div>
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50 text-xs text-slate-600 uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2">Date</th>
                <th className="text-left px-4 py-2">Direction</th>
                <th className="text-right px-4 py-2">Quantity</th>
                <th className="text-left px-4 py-2">Reference</th>
                <th className="text-right px-4 py-2">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {withRunning.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-2 text-slate-700">{t.transaction_date}</td>
                  <td className="px-4 py-2">
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${t.direction === 'in' ? 'bg-emerald-100 text-emerald-800' : t.direction === 'out' ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-700'}`}>
                      {t.direction === 'in' ? <TrendingUp className="w-3 h-3" /> : t.direction === 'out' ? <TrendingDown className="w-3 h-3" /> : null}
                      {t.direction}
                    </span>
                  </td>
                  <td className={`px-4 py-2 text-right font-mono ${t.direction === 'in' ? 'text-emerald-700' : t.direction === 'out' ? 'text-red-700' : 'text-slate-700'}`}>
                    {t.direction === 'in' ? '+' : t.direction === 'out' ? '-' : ''}{t.quantity}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{t.reference}</td>
                  <td className="px-4 py-2 text-right font-mono font-semibold text-slate-900">{t.running}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAdj && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-5 space-y-3">
            <h3 className="font-semibold text-slate-900">Manual adjustment</h3>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase">Quantity (signed)</label>
              <input type="number" value={adjQty} onChange={(e) => setAdjQty(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg mt-1" placeholder="+5 or -3" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase">Reason</label>
              <textarea value={adjReason} onChange={(e) => setAdjReason(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg mt-1" rows={3} />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowAdj(false)} className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm">Cancel</button>
              <button onClick={submitAdjustment} disabled={adjBusy || !adjQty} className="flex-1 px-3 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold disabled:opacity-50">
                {adjBusy ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
