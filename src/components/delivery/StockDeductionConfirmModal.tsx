import { useState } from 'react';
import { AlertTriangle, Loader2, Package, X, FileText } from 'lucide-react';
import { useTranslation } from '../../i18n';

interface StockItem {
  product_name: string;
  category_name: string;
  quantity: number;
  condition: string;
  stock_available: number | null;
}

interface Props {
  items: StockItem[];
  noteNumber: string;
  partnerName: string | null;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

const CONDITION_LABELS: Record<string, string> = {
  good: 'E mire',
  damaged: 'Defekt',
  repaired: 'Riparuar',
  ready_a: 'Klasi A',
  ready_b: 'Klasi B',
  ready_c: 'Klasi C',
  sorting: 'Per sortim',
};

export default function StockDeductionConfirmModal({ items, noteNumber, partnerName, onConfirm, onCancel }: Props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasInsufficient = items.some((i) => i.stock_available !== null && i.stock_available < i.quantity);

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    try {
      await onConfirm();
    } catch (e: any) {
      setError(e.message || 'Deshtoi');
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center">
              <FileText className="w-5 h-5 text-sky-700" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900">{t('common.shkarkoStokunDheKrijoFaturen')}</h2>
              <p className="text-xs text-slate-500 mt-0.5">Fletedergesa {noteNumber}{partnerName ? ` — ${partnerName}` : ''}</p>
            </div>
          </div>
          <button onClick={onCancel} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <p className="text-sm text-slate-600">
            Artikujt e meposhtme do te zbriten nga stoku dhe do te krijohet nje fature e re:
          </p>

          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-3 py-2.5">Artikulli</th>
                  <th className="text-right px-3 py-2.5">{t('common.quantity')}</th>
                  <th className="text-right px-3 py-2.5">Ne stok</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item, i) => {
                  const insufficient = item.stock_available !== null && item.stock_available < item.quantity;
                  return (
                    <tr key={i} className={insufficient ? 'bg-amber-50' : ''}>
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-slate-900">{item.product_name || item.category_name}</div>
                        <div className="text-xs text-slate-500">{CONDITION_LABELS[item.condition] || item.condition}</div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-slate-900">
                        -{item.quantity}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {item.stock_available !== null ? (
                          <span className={`font-medium ${insufficient ? 'text-amber-700' : 'text-slate-600'}`}>
                            {item.stock_available}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {hasInsufficient && (
            <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <p className="font-semibold">{t('common.stokuIPamjaftueshem')}</p>
                <p className="mt-0.5">{t('common.disaArtikujKaneStokMeTe')}</p>
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-slate-200 flex items-center justify-end gap-3 bg-slate-50">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2.5 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-50"
          >{t('common.cancel')}</button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-60 shadow-sm"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
            Shkarko stokun dhe krijo faturen
          </button>
        </div>
      </div>
    </div>
  );
}
