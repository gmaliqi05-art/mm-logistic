import { useState, useRef } from 'react';
import { X, Upload, Loader2, Sparkles, AlertTriangle, FileText, Camera, Check, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import CameraScanner from '../accounting/CameraScanner';

export type DocKind =
  | 'purchase'
  | 'expense'
  | 'investment'
  | 'sale'
  | 'delivery_out'
  | 'delivery_in'
  | 'carrier_service'
  | 'custody_service'
  | 'internal_transfer'
  | 'unknown';

export interface SmartScanResult {
  scanId: string;
  fileUrl: string;
  fileMime: string;
  extracted: {
    document_nature_guess: string;
    supplier_name?: string;
    supplier_vat?: string;
    customer_name?: string;
    invoice_number: string;
    invoice_date: string;
    total: number;
    vat_amount: number;
    subtotal: number;
    line_items: Array<{
      description: string;
      quantity: number;
      unit: string;
      unit_price?: number;
      line_total?: number;
    }>;
    confidence: number;
    notes: string;
    consignor_name?: string;
    consignor_vat?: string;
    consignor_address?: string;
    consignor_email?: string;
    consignor_phone?: string;
    carrier_name?: string;
    carrier_vat?: string;
    consignee_name?: string;
    consignee_vat?: string;
    consignee_address?: string;
    consignee_email?: string;
    consignee_phone?: string;
  };
  routing: {
    suggested_kind: DocKind;
    our_role?: 'consignor' | 'carrier' | 'consignee' | 'custodian_in' | 'custodian_out' | 'internal_transfer' | 'unknown';
    partner_to_register?: 'consignor' | 'consignee' | 'goods_owner' | 'none';
    matched_contact_id: string | null;
    matched_contact_name: string | null;
    match_reason: string;
    confidence: number;
    three_parties?: {
      consignor: { name: string; vat: string; matched_company: boolean; matched_contact_id: string | null };
      carrier: { name: string; vat: string; matched_company: boolean; matched_contact_id: string | null };
      consignee: { name: string; vat: string; matched_company: boolean; matched_contact_id: string | null };
    };
  } | null;
}

interface Props {
  role: 'driver' | 'depot' | 'company_admin' | 'accountant';
  title?: string;
  subtitle?: string;
  allowedKinds?: DocKind[];
  docDirection?: 'in' | 'out';
  onClose: () => void;
  onConfirm: (result: SmartScanResult) => void;
}

type Step = 'choose' | 'camera' | 'uploading' | 'analyzing' | 'review';

export default function SmartDocScanner({ role, title, subtitle, allowedKinds, docDirection, onClose, onConfirm }: Props) {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const companyId = profile?.company_id ?? '';
  const [step, setStep] = useState<Step>('choose');
  const [error, setError] = useState('');
  const [result, setResult] = useState<SmartScanResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const headerTitle = title || t('common.scanner.title');
  const headerSubtitle = subtitle || t('common.scanner.subtitle');

  async function processFile(file: File) {
    setError('');
    if (file.size > 15 * 1024 * 1024) {
      setError(t('common.scanner.tooLarge'));
      return;
    }
    setStep('uploading');
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${companyId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from('acc-scans').upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (upErr) throw upErr;

      const { data: scan, error: scanErr } = await supabase
        .from('acc_scanned_documents')
        .insert({
          company_id: companyId,
          uploaded_by: profile?.id,
          storage_path: path,
          file_mime: file.type,
          file_size: file.size,
          status: 'uploaded',
        })
        .select()
        .single();
      if (scanErr) throw scanErr;

      setStep('analyzing');
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scan-document`;
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ scanId: scan.id, role, docDirection }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || t('common.scanner.analysisFailed'));

      const { data: signed } = await supabase.storage.from('acc-scans').createSignedUrl(path, 3600);
      setResult({
        scanId: scan.id,
        fileUrl: signed?.signedUrl || '',
        fileMime: file.type,
        extracted: json.extracted,
        routing: json.routing || null,
      });
      setStep('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.scanner.processingError'));
      setStep('choose');
    }
  }

  function onCameraCapture(blob: Blob) {
    const file = new File([blob], `camera_${Date.now()}.jpg`, { type: 'image/jpeg' });
    setStep('choose');
    processFile(file);
  }

  function handleConfirm() {
    if (!result) return;
    if (allowedKinds && result.routing) {
      const kind = result.routing.suggested_kind;
      if (kind !== 'unknown' && !allowedKinds.includes(kind)) {
        setError(t('common.scanner.notAllowed'));
        return;
      }
    }
    onConfirm(result);
  }

  const disallowed = !!(
    result?.routing &&
    allowedKinds &&
    result.routing.suggested_kind !== 'unknown' &&
    !allowedKinds.includes(result.routing.suggested_kind)
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-teal-50 rounded-lg">
              <Sparkles className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">{headerTitle}</h2>
              <p className="text-xs text-slate-500">{headerSubtitle}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
              <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {step === 'choose' && (
            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-3">
                <button
                  onClick={() => setStep('camera')}
                  className="p-6 border-2 border-dashed border-slate-300 hover:border-teal-500 hover:bg-teal-50 rounded-xl text-left transition-colors"
                >
                  <Camera className="w-8 h-8 text-teal-600 mb-2" />
                  <p className="text-sm font-semibold text-slate-900">{t('common.scanner.scanWithCamera')}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{t('common.scanner.scanWithCameraDesc')}</p>
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-6 border-2 border-dashed border-slate-300 hover:border-teal-500 hover:bg-teal-50 rounded-xl text-left transition-colors"
                >
                  <Upload className="w-8 h-8 text-teal-600 mb-2" />
                  <p className="text-sm font-semibold text-slate-900">{t('common.scanner.uploadDocument')}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{t('common.scanner.uploadDocumentDesc')}</p>
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) processFile(f);
                }}
              />
            </div>
          )}

          {step === 'camera' && (
            <CameraScanner
              onCapture={onCameraCapture}
              onClose={() => setStep('choose')}
            />
          )}

          {(step === 'uploading' || step === 'analyzing') && (
            <div className="py-16 text-center">
              <Loader2 className="w-12 h-12 mx-auto text-teal-600 animate-spin mb-4" />
              <p className="text-base font-semibold text-slate-800">
                {step === 'uploading' ? t('common.scanner.uploading') : t('common.scanner.analyzing')}
              </p>
              <p className="text-sm text-slate-500 mt-1">{t('common.scanner.analyzingHint')}</p>
            </div>
          )}

          {step === 'review' && result && (
            <div className="space-y-4">
              <div className={`flex items-start gap-3 p-4 rounded-xl border ${disallowed ? 'bg-amber-50 border-amber-200' : 'bg-teal-50 border-teal-200'}`}>
                <Sparkles className={`w-5 h-5 mt-0.5 flex-shrink-0 ${disallowed ? 'text-amber-600' : 'text-teal-600'}`} />
                <div className="flex-1">
                  <p className={`text-sm font-semibold ${disallowed ? 'text-amber-900' : 'text-teal-900'}`}>
                    {role === 'driver'
                      ? t('common.scanner.documentReady')
                      : <>{t('common.scanner.identified')}: {t(`common.scanner.kinds.${result.routing?.suggested_kind || 'unknown'}`)}</>}
                  </p>
                  {role !== 'driver' && result.routing?.matched_contact_name && (
                    <p className={`text-xs mt-0.5 ${disallowed ? 'text-amber-800' : 'text-teal-800'}`}>
                      {t('common.scanner.matchedContact')}: <strong>{result.routing.matched_contact_name}</strong>
                    </p>
                  )}
                  {role !== 'driver' && (
                    <p className={`text-xs mt-1 ${disallowed ? 'text-amber-700' : 'text-teal-700'}`}>{result.routing?.match_reason}</p>
                  )}
                  {disallowed && (
                    <p className="text-xs text-amber-800 mt-2 font-medium">{t('common.scanner.notAllowed')}</p>
                  )}
                </div>
                {role !== 'driver' && (
                  <span className={`text-xs px-2 py-1 rounded-full bg-white font-bold ${disallowed ? 'text-amber-700' : 'text-teal-700'}`}>
                    {Math.round((result.routing?.confidence || result.extracted.confidence) * 100)}%
                  </span>
                )}
              </div>

              <div className={role === 'driver' ? '' : 'grid sm:grid-cols-2 gap-6'}>
                <div>
                  <p className="text-[11px] font-semibold text-slate-500 uppercase mb-2">{t('common.scanner.document')}</p>
                  <div className="rounded-xl border border-slate-200 overflow-hidden bg-slate-50">
                    {result.fileMime === 'application/pdf' ? (
                      <iframe src={result.fileUrl} className="w-full h-80" title="Preview" />
                    ) : result.fileMime.startsWith('image/') ? (
                      <img src={result.fileUrl} alt="Scan" className="w-full max-h-80 object-contain" />
                    ) : (
                      <div className="h-80 flex items-center justify-center">
                        <FileText className="w-16 h-16 text-slate-400" />
                      </div>
                    )}
                  </div>
                </div>

                {role !== 'driver' && (
                  <div>
                    <p className="text-[11px] font-semibold text-slate-500 uppercase mb-2">{t('common.scanner.keyData')}</p>
                    <dl className="space-y-2 text-sm">
                      {(result.extracted.consignor_name || result.extracted.supplier_name) && (
                        <div><dt className="text-xs text-slate-500">{t('common.scanner.supplier')}</dt><dd className="font-medium text-slate-900">{result.extracted.consignor_name || result.extracted.supplier_name}</dd></div>
                      )}
                      {(result.extracted.consignee_name || result.extracted.customer_name) && (
                        <div><dt className="text-xs text-slate-500">{t('common.scanner.customer')}</dt><dd className="font-medium text-slate-900">{result.extracted.consignee_name || result.extracted.customer_name}</dd></div>
                      )}
                      {(result.extracted.consignor_vat || result.extracted.supplier_vat) && (
                        <div><dt className="text-xs text-slate-500">{t('common.scanner.vatNumber')}</dt><dd className="font-mono text-slate-800">{result.extracted.consignor_vat || result.extracted.supplier_vat}</dd></div>
                      )}
                      {result.extracted.invoice_number && (
                        <div><dt className="text-xs text-slate-500">{t('common.scanner.docNumber')}</dt><dd className="font-mono text-slate-800">{result.extracted.invoice_number}</dd></div>
                      )}
                      {result.extracted.invoice_date && (
                        <div><dt className="text-xs text-slate-500">{t('common.scanner.date')}</dt><dd className="text-slate-800">{result.extracted.invoice_date}</dd></div>
                      )}
                      {result.extracted.total > 0 && (
                        <div><dt className="text-xs text-slate-500">{t('common.scanner.total')}</dt><dd className="font-bold text-slate-900">{result.extracted.total.toFixed(2)}</dd></div>
                      )}
                    </dl>
                  </div>
                )}
              </div>

              {result.extracted.line_items && result.extracted.line_items.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-slate-500 uppercase mb-2">
                    {t('common.scanner.lineItems')} ({result.extracted.line_items.length})
                  </p>
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500">
                        <tr>
                          <th className="px-3 py-2">{t('common.scanner.description')}</th>
                          <th className="px-3 py-2 text-right">{t('common.scanner.quantity')}</th>
                          {role !== 'driver' && (
                            <th className="px-3 py-2 text-right">{t('common.scanner.unitPrice')}</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {result.extracted.line_items.map((it, i) => (
                          <tr key={i}>
                            <td className="px-3 py-2 text-slate-800">{it.description}</td>
                            <td className="px-3 py-2 text-right text-slate-700">{it.quantity} {it.unit || ''}</td>
                            {role !== 'driver' && (
                              <td className="px-3 py-2 text-right text-slate-700">{it.unit_price?.toFixed(2) || '-'}</td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex justify-between items-center">
          {step === 'review' && (
            <button
              onClick={() => { setResult(null); setStep('choose'); setError(''); }}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100"
            >
              <RefreshCw className="w-4 h-4" /> {t('common.scanner.restart')}
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100"
            >
              {t('common.scanner.cancel')}
            </button>
            {step === 'review' && result && (
              <button
                onClick={handleConfirm}
                disabled={disallowed}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Check className="w-4 h-4" /> {t('common.scanner.useData')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
