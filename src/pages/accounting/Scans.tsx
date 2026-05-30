import { useEffect, useState } from 'react';
import { Loader2, ScanLine, FileText, CheckCircle2, XCircle, Clock, RefreshCw, Sparkles } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { formatCurrency, type AccCurrency } from '../../types/accounting';
import ScanDocumentModal from '../../components/accounting/ScanDocumentModal';
import ScanReviewModal from '../../components/accounting/ScanReviewModal';
import { useTranslation } from '../../i18n';

interface ScanRow {
  id: string;
  company_id: string;
  status: string;
  detected_type: string | null;
  file_name: string;
  file_mime: string;
  storage_path: string;
  error_message: string | null;
  extracted_json: Record<string, unknown> | null;
  linked_entity_type: string | null;
  linked_entity_id: string | null;
  routing_decision: 'auto_saved' | 'pending_confirmation' | 'new_company_required' | null;
  match_confidence: number | null;
  suggested_contact_name: string | null;
  suggested_contact_vat: string | null;
  suggested_contact_tax: string | null;
  suggested_contact_email: string | null;
  suggested_contact_phone: string | null;
  suggested_contact_address: string | null;
  suggested_contact_city: string | null;
  suggested_contact_postal_code: string | null;
  suggested_contact_country: string | null;
  suggested_contact_iban: string | null;
  suggested_contact_bic: string | null;
  created_at: string;
}

const STATUS_STYLES: Record<string, { label: string; cls: string; icon: typeof Clock }> = {
  pending: { label: 'Ne pritje', cls: 'bg-slate-100 text-slate-700', icon: Clock },
  processing: { label: 'Duke procesuar', cls: 'bg-blue-100 text-blue-700', icon: Loader2 },
  parsed: { label: 'Parsuar', cls: 'bg-amber-100 text-amber-800', icon: FileText },
  saved: { label: 'Ruajtur', cls: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  failed: { label: 'Deshtoi', cls: 'bg-red-100 text-red-700', icon: XCircle },
};

const TYPE_LABELS: Record<string, string> = {
  purchase: 'Blerje',
  expense: 'Shpenzim',
  investment: 'Investim',
  sale: 'Shitje',
  unknown: '-',
};

export default function Scans() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [rows, setRows] = useState<ScanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showScan, setShowScan] = useState(false);
  const [reviewScan, setReviewScan] = useState<ScanRow | null>(null);

  useEffect(() => {
    load();
  }, [profile?.company_id]);

  async function load() {
    if (!profile?.company_id) return;
    setLoading(true);
    const { data } = await supabase
      .from('acc_scanned_documents')
      .select('*')
      .eq('company_id', profile.company_id)
      .order('created_at', { ascending: false })
      .limit(100);
    setRows((data as ScanRow[] | null) ?? []);
    setLoading(false);
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
          <h1 className="text-2xl font-bold text-gray-900">{t('common.scanResults')}</h1>
          <p className="text-gray-500 mt-1">Historiku i dokumenteve te skanuara</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={load}
            className="inline-flex items-center gap-2 px-3 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Rifresko
          </button>
          <button
            onClick={() => setShowScan(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-medium text-sm"
          >
            <ScanLine className="w-4 h-4" />{t('common.skanoTeRe')}</button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <ScanLine className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 font-medium">{t('common.noScanYet')}</p>
          <p className="text-slate-400 text-sm mt-1">{t('common.uploadDocToStart')}</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left font-semibold text-slate-700 px-4 py-3">Skedari</th>
                  <th className="text-left font-semibold text-slate-700 px-4 py-3">{t('common.type')}</th>
                  <th className="text-left font-semibold text-slate-700 px-4 py-3">{t('common.furnizuesiKlienti')}</th>
                  <th className="text-right font-semibold text-slate-700 px-4 py-3">{t('common.total')}</th>
                  <th className="text-left font-semibold text-slate-700 px-4 py-3">{t('common.status')}</th>
                  <th className="text-left font-semibold text-slate-700 px-4 py-3">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => {
                  const st = STATUS_STYLES[r.status] ?? STATUS_STYLES.pending;
                  const Icon = st.icon;
                  const ex = (r.extracted_json ?? {}) as Record<string, unknown>;
                  const supplier = (ex.supplier_name as string) || (ex.customer_name as string) || '-';
                  const total = typeof ex.total === 'number' ? ex.total : 0;
                  const currency = (ex.currency as string) || 'EUR';
                  const canReview = r.status === 'parsed' && r.routing_decision !== 'auto_saved';
                  return (
                    <tr
                      key={r.id}
                      onClick={() => canReview && setReviewScan(r)}
                      className={`hover:bg-slate-50 ${canReview ? 'cursor-pointer' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                          <span className="truncate max-w-xs" title={r.file_name}>
                            {r.file_name}
                          </span>
                          {r.routing_decision === 'new_company_required' && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-teal-50 text-teal-700 border border-teal-200">
                              <Sparkles className="w-3 h-3" />{t('common.kompaniERe')}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {TYPE_LABELS[r.detected_type ?? 'unknown'] ?? '-'}
                      </td>
                      <td className="px-4 py-3 text-slate-700 truncate max-w-xs">{supplier}</td>
                      <td className="px-4 py-3 text-right text-slate-900 font-medium tabular-nums">
                        {total > 0 ? formatCurrency(total, currency as AccCurrency) : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${st.cls}`}>
                          <Icon className={`w-3.5 h-3.5 ${r.status === 'processing' ? 'animate-spin' : ''}`} />
                          {st.label}
                        </span>
                        {r.error_message && (
                          <div className="text-xs text-red-600 mt-1 max-w-xs truncate" title={r.error_message}>
                            {r.error_message}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                        {new Date(r.created_at).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showScan && (
        <ScanDocumentModal
          onClose={() => setShowScan(false)}
          onSaved={() => {
            setShowScan(false);
            load();
          }}
        />
      )}

      {reviewScan && (
        <ScanReviewModal
          scan={reviewScan}
          onClose={() => setReviewScan(null)}
          onSaved={() => {
            setReviewScan(null);
            load();
          }}
        />
      )}
    </div>
  );
}
