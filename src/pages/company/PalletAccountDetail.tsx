import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Download, Plus, TrendingUp, TrendingDown, Loader2, CheckCircle2, FileSignature, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { logger } from '../../utils/logger';
import { useTranslation } from '../../i18n';
import LimitationBadge from '../../components/accounting/LimitationBadge';
import { formatReconciliationPeriod } from '../../utils/palletReconciliation';
import type { PalletReconciliation, PalletReconciliationStatus } from '../../types';

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

const RECON_STATUS_STYLE: Record<PalletReconciliationStatus, string> = {
  draft: 'bg-slate-100 text-slate-700',
  sent: 'bg-blue-100 text-blue-800',
  signed: 'bg-emerald-100 text-emerald-800',
  disputed: 'bg-red-100 text-red-800',
  cancelled: 'bg-slate-100 text-slate-500 line-through',
};

export default function PalletAccountDetail() {
  const { t, language } = useTranslation();
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
  const [reconciliations, setReconciliations] = useState<PalletReconciliation[]>([]);
  const [oldestOpenAgeDays, setOldestOpenAgeDays] = useState<number | null>(null);
  const [showReconForm, setShowReconForm] = useState(false);
  const [reconBusy, setReconBusy] = useState(false);
  const [pdfBusyReconId, setPdfBusyReconId] = useState<string | null>(null);
  const todayIso = () => new Date().toISOString().slice(0, 10);
  const [reconForm, setReconForm] = useState({
    period_start: todayIso(),
    period_end: todayIso(),
    confirmed_balance: '',
    signed_by_name: '',
    notes: '',
  });

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

      const [txnsRes, reconsRes, agingRes] = await Promise.all([
        supabase
          .from('pallet_account_transactions')
          .select('id, transaction_date, direction, quantity, reference, notes, delivery_note_id, created_at')
          .eq('pallet_account_id', id)
          .order('transaction_date', { ascending: false })
          .order('created_at', { ascending: false }),
        supabase
          .from('pallet_reconciliations')
          .select('*')
          .eq('pallet_account_id', id)
          .order('period_end', { ascending: false }),
        supabase
          .from('v_pallet_account_aging')
          .select('oldest_open_txn_age_days')
          .eq('pallet_account_id', id)
          .maybeSingle(),
      ]);
      setTxns((txnsRes.data ?? []) as Transaction[]);
      setReconciliations((reconsRes.data ?? []) as PalletReconciliation[]);
      setOldestOpenAgeDays((agingRes.data?.oldest_open_txn_age_days ?? null) as number | null);
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

  const submitReconciliation = async () => {
    if (!id || !profile?.company_id) return;
    const balance = parseInt(reconForm.confirmed_balance, 10);
    if (!Number.isFinite(balance)) return;
    if (!reconForm.period_start || !reconForm.period_end) return;
    setReconBusy(true);
    try {
      const { error } = await supabase.from('pallet_reconciliations').insert({
        company_id: profile.company_id,
        pallet_account_id: id,
        period_start: reconForm.period_start,
        period_end: reconForm.period_end,
        confirmed_balance: balance,
        status: 'draft',
        signed_by_name: reconForm.signed_by_name,
        notes: reconForm.notes,
        created_by: profile.id,
      });
      if (error) throw error;
      setShowReconForm(false);
      setReconForm({
        period_start: todayIso(),
        period_end: todayIso(),
        confirmed_balance: '',
        signed_by_name: '',
        notes: '',
      });
      await load();
    } catch (err) {
      logger.error('reconciliation insert failed', { error: err });
    } finally {
      setReconBusy(false);
    }
  };

  const markReconciliationSigned = async (reconId: string, signedByName: string) => {
    try {
      const { error } = await supabase
        .from('pallet_reconciliations')
        .update({
          status: 'signed',
          signed_at: new Date().toISOString(),
          signed_by_name: signedByName,
          updated_at: new Date().toISOString(),
        })
        .eq('id', reconId);
      if (error) throw error;
      await load();
    } catch (err) {
      logger.error('mark signed failed', { error: err });
    }
  };

  const generateSaldoPdf = async (reconId: string) => {
    setPdfBusyReconId(reconId);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-saldenbestaetigung`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ reconciliation_id: reconId, language }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json?.error ?? 'PDF generation failed');
      if (json.download_url) window.open(json.download_url, '_blank');
      await load();
    } catch (err) {
      logger.error('Saldenbestätigung PDF generation failed', { error: err });
      alert(err instanceof Error ? err.message : 'PDF failed');
    } finally {
      setPdfBusyReconId(null);
    }
  };

  const generatePdf = async () => {
    if (!id) return;
    setPdfBusy(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-pallet-statement`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ pallet_account_id: id, language }),
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

      <div className="flex justify-end">
        <LimitationBadge ageDays={oldestOpenAgeDays} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Current balance</div>
          <div className={`text-3xl font-bold ${header.current_balance > 0 ? 'text-emerald-700' : header.current_balance < 0 ? 'text-red-700' : 'text-slate-900'}`}>
            {header.current_balance > 0 ? '+' : ''}{header.current_balance}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {header.current_balance > 0 ? 'Partner owes us' : header.current_balance < 0 ? t('common.weOwePartner') : 'Balanced'}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Opening balance</div>
          <div className="text-3xl font-bold text-slate-900">{header.opening_balance}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">{t('common.totalTransactions')}</div>
          <div className="text-3xl font-bold text-slate-900">{txns.length}</div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900">Ledger</h2>
        </div>
        {txns.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">{t('common.noTransactionsYet')}</div>
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

      {/* Saldenbestätigung / Reconciliation history */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <FileSignature className="w-4 h-4 text-slate-500" />
              {t('common.palletReconciliation.title')}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">{t('common.palletReconciliation.legalNote')}</p>
          </div>
          <button
            onClick={() => setShowReconForm(true)}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-300 text-sm hover:bg-slate-50"
          >
            <Plus className="w-4 h-4" /> {t('common.palletReconciliation.newReconciliation')}
          </button>
        </div>
        {reconciliations.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">{t('common.palletReconciliation.noneYet')}</div>
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50 text-xs text-slate-600 uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2">{t('common.palletReconciliation.periodLabel')}</th>
                <th className="text-right px-4 py-2">{t('common.palletReconciliation.confirmedBalance')}</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-left px-4 py-2">{t('common.palletReconciliation.signedByName')}</th>
                <th className="text-right px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {reconciliations.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2 text-slate-700">{formatReconciliationPeriod(r.period_start, r.period_end)}</td>
                  <td className="px-4 py-2 text-right font-mono font-semibold text-slate-900">{r.confirmed_balance > 0 ? '+' : ''}{r.confirmed_balance}</td>
                  <td className="px-4 py-2">
                    <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full ${RECON_STATUS_STYLE[r.status]}`}>
                      {t(`common.palletReconciliation.status${r.status.charAt(0).toUpperCase()}${r.status.slice(1)}`)}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {r.signed_by_name || '—'}
                    {r.signed_at && <span className="block text-xs text-slate-400">{new Date(r.signed_at).toLocaleDateString()}</span>}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => void generateSaldoPdf(r.id)}
                        disabled={pdfBusyReconId === r.id}
                        title="PDF"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {pdfBusyReconId === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
                        PDF
                      </button>
                      {(r.status === 'draft' || r.status === 'sent') && (
                        <button
                          onClick={() => {
                            const name = prompt(t('common.palletReconciliation.signedByName'), r.signed_by_name || '');
                            if (name !== null) void markReconciliationSigned(r.id, name);
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          {t('common.palletReconciliation.markAsSigned')}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showReconForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-5 space-y-3">
            <h3 className="font-semibold text-slate-900">{t('common.palletReconciliation.newReconciliation')}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">From</label>
                <input type="date" value={reconForm.period_start} onChange={(e) => setReconForm((p) => ({ ...p, period_start: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg mt-1" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">To</label>
                <input type="date" value={reconForm.period_end} onChange={(e) => setReconForm((p) => ({ ...p, period_end: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg mt-1" />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase">{t('common.palletReconciliation.confirmedBalance')}</label>
              <input type="number" value={reconForm.confirmed_balance} onChange={(e) => setReconForm((p) => ({ ...p, confirmed_balance: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg mt-1" placeholder={String(header.current_balance)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase">{t('common.palletReconciliation.signedByName')}</label>
              <input type="text" value={reconForm.signed_by_name} onChange={(e) => setReconForm((p) => ({ ...p, signed_by_name: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg mt-1" placeholder="—" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase">Notes</label>
              <textarea value={reconForm.notes} onChange={(e) => setReconForm((p) => ({ ...p, notes: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg mt-1" rows={2} />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowReconForm(false)} className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm">{t('common.palletReconciliation.cancel')}</button>
              <button onClick={submitReconciliation} disabled={reconBusy || !reconForm.confirmed_balance} className="flex-1 px-3 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold disabled:opacity-50">
                {reconBusy ? <Loader2 className="w-4 h-4 animate-spin inline" /> : t('common.palletReconciliation.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAdj && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-5 space-y-3">
            <h3 className="font-semibold text-slate-900">Manual adjustment</h3>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase">Quantity (signed)</label>
              <input type="number" value={adjQty} onChange={(e) => setAdjQty(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg mt-1" placeholder={t('common.plus5OrMinus3')} />
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
