import { useEffect, useState } from 'react';
import { FileCode2, FileText, Globe as Globe2, Loader2, CheckCircle2, AlertTriangle, Download } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import { logger } from '../../utils/logger';

interface InvoiceRow {
  id: string;
  invoice_number: string;
  invoice_date: string;
  total: number;
}

interface EinvoiceResult {
  xml_url: string | null;
  pdf_url: string | null;
  xml: string;
  validation: { status: 'valid' | 'invalid' | 'pending'; errors: Array<{ field: string; message: string }> };
}

interface DatevResult {
  download_url: string | null;
  files: string[];
}

interface SaftResult {
  download_url: string | null;
  validation: { status: 'valid' | 'invalid'; errors: string[] };
}

export default function TestExport() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [companyCountry, setCompanyCountry] = useState<string | null>(null);

  // XRechnung / ZUGFeRD
  const [invoiceId, setInvoiceId] = useState('');
  const [einvBusy, setEinvBusy] = useState<'xrechnung' | 'zugferd' | null>(null);
  const [einvResult, setEinvResult] = useState<EinvoiceResult | null>(null);
  const [einvError, setEinvError] = useState<string | null>(null);

  // DATEV
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const [datevFrom, setDatevFrom] = useState(monthStart);
  const [datevTo, setDatevTo] = useState(today);
  const [datevSel, setDatevSel] = useState<Record<string, boolean>>({
    buchungen: true, debitoren: true, kreditoren: true, sachkonten: true,
  });
  const [datevBusy, setDatevBusy] = useState(false);
  const [datevResult, setDatevResult] = useState<DatevResult | null>(null);
  const [datevError, setDatevError] = useState<string | null>(null);

  // SAF-T
  const [saftCountry, setSaftCountry] = useState<'RO' | 'PL'>('RO');
  const [saftFrom, setSaftFrom] = useState(monthStart);
  const [saftTo, setSaftTo] = useState(today);
  const [saftBusy, setSaftBusy] = useState(false);
  const [saftResult, setSaftResult] = useState<SaftResult | null>(null);
  const [saftError, setSaftError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.company_id) return;
    (async () => {
      const [invRes, compRes] = await Promise.all([
        supabase.from('acc_invoices')
          .select('id, invoice_number, invoice_date, total')
          .eq('company_id', profile.company_id)
          .order('invoice_date', { ascending: false })
          .limit(10),
        supabase.from('companies').select('country').eq('id', profile.company_id).maybeSingle(),
      ]);
      setInvoices((invRes.data ?? []) as InvoiceRow[]);
      if (invRes.data && invRes.data.length > 0) setInvoiceId((invRes.data[0] as InvoiceRow).id);
      setCompanyCountry(((compRes.data as { country?: string } | null)?.country ?? null));
    })();
  }, [profile?.company_id]);

  const callFunction = async (slug: string, body: unknown) => {
    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${slug}`;
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        'Content-Type': 'application/json',
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error ?? `${slug} failed`);
    return json;
  };

  const runEinvoice = async (format: 'xrechnung' | 'zugferd') => {
    if (!invoiceId) return;
    try {
      setEinvBusy(format);
      setEinvError(null);
      setEinvResult(null);
      const out = await callFunction('generate-einvoice', { invoice_id: invoiceId, format });
      setEinvResult(out as EinvoiceResult);
    } catch (err) {
      logger.error('e-invoice test failed', { error: err });
      setEinvError(err instanceof Error ? err.message : 'Error');
    } finally {
      setEinvBusy(null);
    }
  };

  const runDatev = async () => {
    if (!profile?.company_id) return;
    const exportsArr = Object.entries(datevSel).filter(([, v]) => v).map(([k]) => k);
    if (exportsArr.length === 0) { setDatevError('Select at least one type.'); return; }
    try {
      setDatevBusy(true);
      setDatevError(null);
      setDatevResult(null);
      const out = await callFunction('generate-datev-export', {
        company_id: profile.company_id,
        date_from: datevFrom,
        date_to: datevTo,
        exports: exportsArr,
      });
      setDatevResult(out as DatevResult);
    } catch (err) {
      logger.error('DATEV test failed', { error: err });
      setDatevError(err instanceof Error ? err.message : 'Error');
    } finally {
      setDatevBusy(false);
    }
  };

  const runSaft = async () => {
    if (!profile?.company_id) return;
    try {
      setSaftBusy(true);
      setSaftError(null);
      setSaftResult(null);
      const out = await callFunction('generate-saft', {
        company_id: profile.company_id,
        country_code: saftCountry,
        date_from: saftFrom,
        date_to: saftTo,
      });
      setSaftResult(out as SaftResult);
    } catch (err) {
      logger.error('SAF-T test failed', { error: err });
      setSaftError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSaftBusy(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('common.testExportCenter')}</h1>
        <p className="text-sm text-slate-600 mt-1">{t('common.triggerEinvoiceDatevSaft')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* E-INVOICE CARD */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-teal-600 flex items-center justify-center">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900">XRechnung / ZUGFeRD</h2>
              <p className="text-xs text-slate-500">EN 16931 compliant e-invoice</p>
            </div>
          </div>
          <div className="p-5 space-y-3">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Invoice</label>
            <select value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg">
              <option value="">Select...</option>
              {invoices.map((i) => (
                <option key={i.id} value={i.id}>{i.invoice_number} — {i.invoice_date} (€{i.total})</option>
              ))}
            </select>
            <div className="flex gap-2">
              <button onClick={() => runEinvoice('xrechnung')} disabled={!invoiceId || einvBusy !== null} className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-50">
                {einvBusy === 'xrechnung' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                XRechnung XML
              </button>
              <button onClick={() => runEinvoice('zugferd')} disabled={!invoiceId || einvBusy !== null} className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50">
                {einvBusy === 'zugferd' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                ZUGFeRD PDF
              </button>
            </div>

            {einvError && (
              <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {einvError}
              </div>
            )}
            {einvResult && (
              <div className="space-y-2">
                <div className={`text-xs inline-flex items-center gap-1 px-2 py-1 rounded-full ${einvResult.validation.status === 'valid' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                  {einvResult.validation.status === 'valid' ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                  {einvResult.validation.status}
                </div>
                {einvResult.validation.errors.length > 0 && (
                  <ul className="text-xs text-red-700 list-disc pl-4">
                    {einvResult.validation.errors.slice(0, 5).map((e, i) => (<li key={i}><strong>{e.field}:</strong> {e.message}</li>))}
                  </ul>
                )}
                <div className="flex gap-2">
                  {einvResult.xml_url && (<a href={einvResult.xml_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-teal-700 font-medium underline"><Download className="w-3 h-3" /> XML</a>)}
                  {einvResult.pdf_url && (<a href={einvResult.pdf_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-slate-900 font-medium underline"><Download className="w-3 h-3" /> PDF</a>)}
                </div>
                <details className="mt-2">
                  <summary className="text-xs text-slate-500 cursor-pointer">{t('common.previewXml')}</summary>
                  <pre className="text-[10px] bg-slate-50 border border-slate-200 rounded p-2 mt-1 overflow-auto max-h-48">{einvResult.xml.slice(0, 500)}{einvResult.xml.length > 500 ? '\n...' : ''}</pre>
                </details>
              </div>
            )}
          </div>
        </div>

        {/* DATEV CARD */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-900 flex items-center justify-center">
              <FileCode2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900">DATEV EXTF v700</h2>
              <p className="text-xs text-slate-500">{t('common.buchungsstapelMasterData')}</p>
            </div>
          </div>
          <div className="p-5 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">From</label>
                <input type="date" value={datevFrom} onChange={(e) => setDatevFrom(e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded-md text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">To</label>
                <input type="date" value={datevTo} onChange={(e) => setDatevTo(e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded-md text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {Object.keys(datevSel).map((k) => (
                <label key={k} className={`text-xs font-medium rounded px-2 py-1.5 border cursor-pointer capitalize ${datevSel[k] ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-300 text-slate-700'}`}>
                  <input type="checkbox" className="hidden" checked={datevSel[k]} onChange={(e) => setDatevSel({ ...datevSel, [k]: e.target.checked })} />
                  {k}
                </label>
              ))}
            </div>
            <button onClick={runDatev} disabled={datevBusy} className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50">
              {datevBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Generate DATEV ZIP
            </button>
            {datevError && (
              <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">{datevError}</div>
            )}
            {datevResult && (
              <div className="text-xs text-slate-700 space-y-1">
                <div className="font-semibold text-emerald-700">Ready ({datevResult.files.length} files)</div>
                <div className="text-[11px] text-slate-500">{datevResult.files.join(', ')}</div>
                {datevResult.download_url && (
                  <a href={datevResult.download_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-slate-900 font-medium underline"><Download className="w-3 h-3" /> {t('common.downloadZip')}</a>
                )}
              </div>
            )}
          </div>
        </div>

        {/* SAF-T CARD */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-700 flex items-center justify-center">
              <Globe2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900">SAF-T (RO / PL)</h2>
              <p className="text-xs text-slate-500">{t('common.taxAuditXmlExport')}</p>
            </div>
          </div>
          <div className="p-5 space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase">Country</label>
              <select value={saftCountry} onChange={(e) => setSaftCountry(e.target.value as 'RO' | 'PL')} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm">
                <option value="RO">Romania (D.406)</option>
                <option value="PL">Poland (JPK_V7M)</option>
              </select>
              {companyCountry && companyCountry !== saftCountry && (
                <div className="text-[11px] text-amber-700 mt-1">Company country is {companyCountry}; output is for testing only.</div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">From</label>
                <input type="date" value={saftFrom} onChange={(e) => setSaftFrom(e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded-md text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">To</label>
                <input type="date" value={saftTo} onChange={(e) => setSaftTo(e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded-md text-sm" />
              </div>
            </div>
            <button onClick={runSaft} disabled={saftBusy} className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800 disabled:opacity-50">
              {saftBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Generate SAF-T XML
            </button>
            {saftError && (
              <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">{saftError}</div>
            )}
            {saftResult && (
              <div className="text-xs space-y-1">
                <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full ${saftResult.validation.status === 'valid' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                  {saftResult.validation.status === 'valid' ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                  Structural {saftResult.validation.status}
                </div>
                {saftResult.validation.errors.length > 0 && (
                  <ul className="text-red-700 list-disc pl-4">
                    {saftResult.validation.errors.map((e, i) => (<li key={i}>{e}</li>))}
                  </ul>
                )}
                {saftResult.download_url && (
                  <a href={saftResult.download_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-emerald-800 font-medium underline"><Download className="w-3 h-3" /> {t('common.downloadXml')}</a>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
