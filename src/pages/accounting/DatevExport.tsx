import { useEffect, useState } from 'react';
import { Download, Loader2, FileCode2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import { logger } from '../../utils/logger';

type ExportKind = 'buchungen' | 'debitoren' | 'kreditoren' | 'sachkonten';

interface BankAccount {
  id: string;
  name: string;
}

export default function DatevExport() {
  const { profile } = useAuth();
  const { t } = useTranslation();

  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [selected, setSelected] = useState<Record<ExportKind, boolean>>({
    buchungen: true,
    debitoren: true,
    kreditoren: true,
    sachkonten: true,
  });
  const [bankAccountId, setBankAccountId] = useState<string>('');
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);

  const [beraterNr, setBeraterNr] = useState('');
  const [mandantenNr, setMandantenNr] = useState('');
  const [wjBeginn, setWjBeginn] = useState(`${new Date().getFullYear()}-01-01`);

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ download_url: string | null; files: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.company_id) return;
    (async () => {
      const [banks, company] = await Promise.all([
        supabase.from('acc_bank_accounts').select('id, name').eq('company_id', profile.company_id),
        supabase.from('companies').select('datev_config').eq('id', profile.company_id).maybeSingle(),
      ]);
      setBankAccounts((banks.data ?? []) as BankAccount[]);
      const cfg = (company.data as { datev_config?: Record<string, string> } | null)?.datev_config;
      if (cfg?.berater_nr) setBeraterNr(cfg.berater_nr);
      if (cfg?.mandanten_nr) setMandantenNr(cfg.mandanten_nr);
      if (cfg?.wj_beginn) setWjBeginn(cfg.wj_beginn);
    })();
  }, [profile?.company_id]);

  const saveDatevConfig = async () => {
    if (!profile?.company_id) return;
    await supabase.from('companies').update({
      datev_config: { berater_nr: beraterNr, mandanten_nr: mandantenNr, wj_beginn: wjBeginn },
    }).eq('id', profile.company_id);
  };

  const handleGenerate = async () => {
    if (!profile?.company_id) return;
    const exportsArr = (Object.keys(selected) as ExportKind[]).filter((k) => selected[k]);
    if (exportsArr.length === 0) {
      setError(t('accounting.datev.pickExportType'));
      return;
    }
    try {
      setBusy(true);
      setError(null);
      setResult(null);
      await saveDatevConfig();

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-datev-export`;
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          company_id: profile.company_id,
          date_from: dateFrom,
          date_to: dateTo,
          exports: exportsArr,
          bank_account_id: bankAccountId || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'DATEV export failed');
      setResult({ download_url: json.download_url, files: json.files ?? [] });
    } catch (err) {
      logger.error('DATEV export failed', { error: err });
      setError(err instanceof Error ? err.message : 'DATEV error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center">
          <FileCode2 className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">DATEV Export</h1>
          <p className="text-sm text-slate-600">EXTF v700 Buchungsstapel, Debitoren, Kreditoren and Sachkonten.</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Berater-Nr.</label>
            <input value={beraterNr} onChange={(e) => setBeraterNr(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Mandanten-Nr.</label>
            <input value={mandantenNr} onChange={(e) => setMandantenNr(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">WJ-Beginn</label>
            <input type="date" value={wjBeginn} onChange={(e) => setWjBeginn(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-200">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">From</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">To</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Bank (optional)</label>
            <select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg">
              <option value="">All</option>
              {bankAccounts.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
            </select>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-200">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Export types</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {(['buchungen', 'debitoren', 'kreditoren', 'sachkonten'] as ExportKind[]).map((k) => (
              <label key={k} className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer ${selected[k] ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300'}`}>
                <input type="checkbox" className="hidden" checked={selected[k]} onChange={(e) => setSelected({ ...selected, [k]: e.target.checked })} />
                <span className="text-sm capitalize">{k}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
          <button onClick={handleGenerate} disabled={busy} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-slate-900 text-white font-semibold hover:bg-slate-800 disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Generate ZIP
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      {result && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-900">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">Export ready</div>
            <div className="text-xs mt-1">Files: {result.files.join(', ')}</div>
            {result.download_url && (
              <a href={result.download_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-2 text-emerald-800 font-medium underline">
                Download ZIP
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
