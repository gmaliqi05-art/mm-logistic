import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3, Calculator, Send, Lock, Loader2, FileText, CheckCircle2, Sparkles, TrendingUp, TrendingDown, Package,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSubscription } from '../../contexts/SubscriptionContext';
import AccountingUpgradeModal from '../../components/subscription/AccountingUpgradeModal';

interface DeliveryRow {
  id: string;
  note_number: string | null;
  created_at: string | null;
  status: string | null;
  type: string | null;
  partner_id: string | null;
  partner_name: string | null;
  acc_invoice_id: string | null;
  ai_extracted_json: any;
}

export default function FinancialSummary() {
  const { profile } = useAuth();
  const { accountingEnabled } = useSubscription();
  const [loading, setLoading] = useState(true);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { load(); }, [profile?.company_id]);

  async function load() {
    if (!profile?.company_id) return;
    setLoading(true);
    const { data } = await supabase
      .from('delivery_notes')
      .select('id, note_number, created_at, status, type, partner_id, partner_name, acc_invoice_id, ai_extracted_json')
      .eq('company_id', profile.company_id)
      .order('created_at', { ascending: false })
      .limit(50);
    setDeliveries((data as DeliveryRow[] | null) ?? []);
    setLoading(false);
  }

  const totals = useMemo(() => {
    const outgoing = deliveries.filter((d) => d.type !== 'pickup');
    const incoming = deliveries.filter((d) => d.type === 'pickup');
    const unsynced = deliveries.filter((d) => !d.acc_invoice_id).length;
    let extractedTotal = 0;
    let extractedVat = 0;
    let scannedCount = 0;
    for (const d of deliveries) {
      const ex = d.ai_extracted_json;
      if (ex && ex.total != null) {
        extractedTotal += Number(ex.total) || 0;
        extractedVat += Number(ex.vat_amount) || 0;
        scannedCount++;
      }
    }
    return { countOut: outgoing.length, countIn: incoming.length, unsynced, total: deliveries.length, extractedTotal, extractedVat, scannedCount };
  }, [deliveries]);

  async function syncOne(row: DeliveryRow) {
    if (!profile?.company_id) return;
    if (!accountingEnabled) {
      setShowUpgrade(true);
      return;
    }
    setSyncingId(row.id);
    setError(null);
    try {
      const partnerName = row.partner_name ?? '';
      let contactId: string | null = null;
      if (partnerName) {
        const { data: existing } = await supabase
          .from('acc_contacts')
          .select('id')
          .eq('company_id', profile.company_id)
          .eq('name', partnerName)
          .maybeSingle();
        if (existing?.id) {
          contactId = existing.id as string;
        } else {
          const { data: created, error: ce } = await supabase
            .from('acc_contacts')
            .insert({
              company_id: profile.company_id,
              name: partnerName,
              contact_type: row.type === 'pickup' ? 'supplier' : 'customer',
              is_active: true,
            })
            .select('id')
            .maybeSingle();
          if (ce) throw ce;
          contactId = (created?.id as string) ?? null;
        }
      }

      const isIncoming = row.type === 'pickup';
      const dateStr = (row.created_at ?? new Date().toISOString()).slice(0, 10);

      if (isIncoming) {
        const { data: purchase, error: pe } = await supabase
          .from('acc_purchases')
          .insert({
            company_id: profile.company_id,
            contact_id: contactId,
            purchase_number: row.note_number ?? '',
            purchase_date: dateStr,
            status: 'received',
            notes: `Nga fletedergesa ${row.note_number ?? row.id}`,
          })
          .select('id')
          .maybeSingle();
        if (pe) throw pe;
        await supabase
          .from('delivery_notes')
          .update({ acc_invoice_id: purchase?.id, invoiced_at: new Date().toISOString() })
          .eq('id', row.id);
      } else {
        const { data: invoice, error: ie } = await supabase
          .from('acc_invoices')
          .insert({
            company_id: profile.company_id,
            contact_id: contactId,
            invoice_number: row.note_number ?? '',
            invoice_date: dateStr,
            status: 'sent',
            notes: `Nga fletedergesa ${row.note_number ?? row.id}`,
          })
          .select('id')
          .maybeSingle();
        if (ie) throw ie;
        await supabase
          .from('delivery_notes')
          .update({ acc_invoice_id: invoice?.id, invoiced_at: new Date().toISOString() })
          .eq('id', row.id);
      }

      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sinkronizimi deshtoi');
    } finally {
      setSyncingId(null);
    }
  }

  async function syncAll() {
    if (!accountingEnabled) { setShowUpgrade(true); return; }
    for (const d of deliveries.filter((x) => !x.acc_invoice_id)) {
      await syncOne(d);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Permbledhja Financiare</h1>
          <p className="text-slate-500 mt-1">Pasqyra e te ardhurave, shpenzimeve dhe sinkronizimi me kontabilitet</p>
        </div>
        <button
          onClick={syncAll}
          disabled={totals.unsynced === 0}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm shadow-sm transition-all ${
            accountingEnabled
              ? 'bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50'
              : 'bg-white border-2 border-dashed border-teal-300 text-teal-700 hover:bg-teal-50'
          }`}
        >
          {accountingEnabled ? <Send className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
          {accountingEnabled
            ? `Sinkronizo te gjitha (${totals.unsynced})`
            : 'Aktivizo kontabilitetin per te sinkronizuar'}
        </button>
      </div>

      {!accountingEnabled && (
        <div className="rounded-2xl bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-200 p-5 flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-white text-teal-700 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-slate-900">Kontabiliteti eshte i qitur</h3>
            <p className="text-sm text-slate-600 mt-1">
              Aktivizoje me <span className="font-semibold text-teal-700">50% zbritje</span> dhe te gjitha fletedergesat,
              blerjet dhe faturat do te sinkronizohen automatikisht ne librin financiar.
            </p>
          </div>
          <button
            onClick={() => setShowUpgrade(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700"
          >
            <Calculator className="w-4 h-4" /> Aktivizo
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Metric icon={TrendingUp} label="Fletedergesa daleset" value={String(totals.countOut)} color="emerald" />
        <Metric icon={TrendingDown} label="Fletemarrje hyrese" value={String(totals.countIn)} color="amber" />
        <Metric icon={Package} label="Totali" value={String(totals.total)} color="teal" />
        <Metric icon={BarChart3} label="Pa sinkronizuar" value={String(totals.unsynced)} color="slate" />
      </div>

      {totals.scannedCount > 0 && (
        <div className="bg-gradient-to-r from-slate-50 to-sky-50 border border-slate-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-teal-600" />
            <h3 className="text-sm font-bold text-slate-800">Te dhenat financiare nga skanimet AI</h3>
            <span className="text-[10px] font-medium bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full">{totals.scannedCount} dokumente</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-slate-500">Totali i nxjerre</p>
              <p className="text-xl font-bold text-slate-900">{totals.extractedTotal.toFixed(2)} EUR</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">TVSH e nxjerre</p>
              <p className="text-xl font-bold text-slate-900">{totals.extractedVat.toFixed(2)} EUR</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Pa sinkronizuar ne kontabilitet</p>
              <p className="text-xl font-bold text-amber-700">{totals.unsynced}</p>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mt-3">Keto vlera jane nxjerre automatikisht nga AI gjate skanimit te dokumenteve. Verifikoni perpara sinkronizimit.</p>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-bold text-slate-900">Fletedergesat e fundit</h2>
          <span className="text-xs text-slate-400 font-medium">{deliveries.length} rreshta</span>
        </div>
        {deliveries.length === 0 ? (
          <div className="p-10 text-center text-slate-500">
            <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            Ende asnje fletedergese.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left font-semibold text-slate-700 px-4 py-3">Numri</th>
                  <th className="text-left font-semibold text-slate-700 px-4 py-3">Data</th>
                  <th className="text-left font-semibold text-slate-700 px-4 py-3">Drejtimi</th>
                  <th className="text-left font-semibold text-slate-700 px-4 py-3">Partneri</th>
                  <th className="text-right font-semibold text-slate-700 px-4 py-3">Totali AI</th>
                  <th className="text-left font-semibold text-slate-700 px-4 py-3">Statusi</th>
                  <th className="text-right font-semibold text-slate-700 px-4 py-3">Veprime</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deliveries.map((d) => {
                  const synced = Boolean(d.acc_invoice_id);
                  const isIncoming = d.type === 'pickup';
                  const aiTotal = d.ai_extracted_json?.total;
                  return (
                    <tr key={d.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-800">{d.note_number ?? '-'}</td>
                      <td className="px-4 py-3 text-slate-600">{d.created_at ? d.created_at.slice(0, 10) : '-'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${
                          isIncoming ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
                        }`}>
                          {isIncoming ? 'Hyrese' : 'Dalese'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {d.partner_name ?? '-'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-800">
                        {aiTotal != null ? `${Number(aiTotal).toFixed(2)}` : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {synced ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Sinkronizuar
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-600">
                            Ne pritje
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {!synced && (
                          <button
                            onClick={() => syncOne(d)}
                            disabled={syncingId === d.id}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold ${
                              accountingEnabled
                                ? 'bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-60'
                                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                            }`}
                          >
                            {syncingId === d.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : accountingEnabled ? (
                              <Send className="w-3.5 h-3.5" />
                            ) : (
                              <Lock className="w-3.5 h-3.5" />
                            )}
                            {accountingEnabled ? 'Sinkronizo' : 'I kyqur'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showUpgrade && <AccountingUpgradeModal onClose={() => setShowUpgrade(false)} />}
    </div>
  );
}

function Metric({ icon: Icon, label, value, color }: { icon: typeof BarChart3; label: string; value: string; color: 'emerald' | 'amber' | 'teal' | 'slate' }) {
  const colors: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    teal: 'bg-teal-50 text-teal-700',
    slate: 'bg-slate-100 text-slate-700',
  };
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${colors[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold mt-3">{label}</p>
      <p className="text-lg font-bold text-slate-900 mt-0.5">{value}</p>
    </div>
  );
}
