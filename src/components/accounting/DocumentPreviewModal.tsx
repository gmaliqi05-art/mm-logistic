import { X, FileText, Printer, Download, ExternalLink } from 'lucide-react';
import { formatNumber } from '../../types/accounting';

export interface PreviewField {
  label: string;
  value: string | number | null | undefined;
  highlight?: boolean;
}

export interface PreviewLineItem {
  description: string;
  quantity?: number;
  unit?: string;
  unit_price?: number;
  vat_rate?: number;
  line_total?: number;
  image_url?: string;
}

interface Props {
  title: string;
  subtitle?: string;
  statusLabel?: string;
  statusClass?: string;
  fields: PreviewField[];
  items?: PreviewLineItem[];
  totals?: { label: string; value: string; strong?: boolean }[];
  notes?: string;
  documentUrl?: string;
  documentMime?: string;
  onClose: () => void;
  onPrint?: () => void;
  accentColor?: 'teal' | 'emerald' | 'blue' | 'amber' | 'rose';
}

const accentMap: Record<NonNullable<Props['accentColor']>, { bg: string; text: string; ring: string }> = {
  teal: { bg: 'bg-teal-50', text: 'text-teal-700', ring: 'ring-teal-200' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-200' },
  blue: { bg: 'bg-blue-50', text: 'text-blue-700', ring: 'ring-blue-200' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-700', ring: 'ring-amber-200' },
  rose: { bg: 'bg-rose-50', text: 'text-rose-700', ring: 'ring-rose-200' },
};

function fmt(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '') return '-';
  return String(v);
}

export default function DocumentPreviewModal({
  title,
  subtitle,
  statusLabel,
  statusClass,
  fields,
  items,
  totals,
  notes,
  documentUrl,
  documentMime,
  onClose,
  onPrint,
  accentColor = 'emerald',
}: Props) {
  const accent = accentMap[accentColor];
  const isImage = documentMime?.startsWith('image/');
  const isPdf = documentMime === 'application/pdf';

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex items-center justify-between px-6 py-4 border-b border-slate-100 ${accent.bg} rounded-t-2xl`}>
          <div className="flex items-center gap-3">
            <div className={`p-2.5 bg-white rounded-xl shadow-sm ring-1 ${accent.ring}`}>
              <FileText className={`w-5 h-5 ${accent.text}`} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">{title}</h2>
              {subtitle && <p className="text-xs text-slate-600 mt-0.5">{subtitle}</p>}
            </div>
            {statusLabel && (
              <span className={`ml-2 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${statusClass || 'bg-slate-100 text-slate-700'}`}>
                {statusLabel}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {onPrint && (
              <button
                onClick={onPrint}
                className="p-2 text-slate-500 hover:text-slate-900 hover:bg-white rounded-lg transition-colors"
                title="Printo"
              >
                <Printer className="w-5 h-5" />
              </button>
            )}
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-white rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
            {fields.map((f, i) => (
              <div key={i} className={f.highlight ? 'sm:col-span-2' : ''}>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{f.label}</p>
                <p className={`mt-0.5 text-sm ${f.highlight ? 'font-bold text-slate-900' : 'text-slate-800'}`}>
                  {fmt(f.value)}
                </p>
              </div>
            ))}
          </div>

          {items && items.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Artikujt ({items.length})
              </p>
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Pershkrim</th>
                      <th className="px-3 py-2 text-right">Sasia</th>
                      <th className="px-3 py-2 text-right">Cmim</th>
                      <th className="px-3 py-2 text-right">TVSH</th>
                      <th className="px-3 py-2 text-right">Totali</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((it, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            {it.image_url && (
                              <img src={it.image_url} alt="" className="w-8 h-8 rounded object-cover" />
                            )}
                            <span className="text-slate-800">{it.description}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right text-slate-700">
                          {it.quantity !== undefined ? `${it.quantity} ${it.unit || ''}` : '-'}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-700">
                          {it.unit_price !== undefined ? formatNumber(it.unit_price) : "-"}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-700">
                          {it.vat_rate !== undefined ? `${it.vat_rate}%` : '-'}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-slate-900">
                          {it.line_total !== undefined ? formatNumber(it.line_total) : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {totals && totals.length > 0 && (
            <div className="flex justify-end">
              <div className="w-full sm:w-80 bg-slate-50 rounded-xl p-4 space-y-2">
                {totals.map((t, i) => (
                  <div key={i} className={`flex items-center justify-between ${t.strong ? 'pt-2 border-t border-slate-200' : ''}`}>
                    <span className={`text-sm ${t.strong ? 'font-bold text-slate-900' : 'text-slate-600'}`}>{t.label}</span>
                    <span className={`text-sm ${t.strong ? 'font-bold text-slate-900 text-base' : 'text-slate-800'}`}>{t.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {notes && (
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Shenime</p>
              <p className="text-sm text-slate-700 bg-slate-50 rounded-lg p-3 whitespace-pre-wrap">{notes}</p>
            </div>
          )}

          {documentUrl && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Dokumenti i bashkangjitur</p>
                <a
                  href={documentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-teal-600 hover:text-teal-700"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Hap ne tab te ri
                </a>
              </div>
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
                {isImage ? (
                  <img src={documentUrl} alt="Dokumenti" className="w-full max-h-[500px] object-contain" />
                ) : isPdf ? (
                  <iframe src={documentUrl} className="w-full h-[500px]" title="Dokumenti" />
                ) : (
                  <div className="p-6 flex items-center justify-center gap-3 text-slate-600">
                    <Download className="w-5 h-5" />
                    <a href={documentUrl} target="_blank" rel="noreferrer" className="text-sm font-medium text-teal-600 hover:underline">
                      Shkarko dokumentin
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
          >
            Mbyll
          </button>
        </div>
      </div>
    </div>
  );
}
