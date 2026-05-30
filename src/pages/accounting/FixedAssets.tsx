import { useEffect, useState } from 'react';
import { Plus, Briefcase, Trash2, ExternalLink, Sparkles, Eye } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { TableRowsSkeleton } from '../../components/ui/Skeleton';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import { formatCurrency } from '../../types/accounting';
import ScanDocumentModal from '../../components/accounting/ScanDocumentModal';
import DocumentPreviewModal from '../../components/accounting/DocumentPreviewModal';

interface Asset {
  id: string;
  name: string;
  category: string;
  acquisition_date: string;
  acquisition_cost: number;
  vat_amount: number;
  useful_life_years: number;
  monthly_depreciation: number;
  accumulated_depreciation: number;
  current_book_value: number;
  status: 'active' | 'disposed';
  document_url: string;
  document_mime?: string;
  notes: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  equipment: 'Pajisje',
  vehicle: 'Automjet',
  it: 'IT / Hardware',
  furniture: 'Mobilje',
  software: 'Software',
  other: 'Tjeter',
};

export default function FixedAssets() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [showScan, setShowScan] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);

  const [form, setForm] = useState({
    name: '',
    category: 'equipment',
    acquisition_date: new Date().toISOString().slice(0, 10),
    acquisition_cost: 0,
    vat_amount: 0,
    useful_life_years: 5,
    notes: '',
  });

  useEffect(() => {
    if (profile?.company_id) fetchAssets();
  }, [profile?.company_id]);

  async function fetchAssets() {
    setLoading(true);
    const { data } = await supabase
      .from('acc_fixed_assets')
      .select('*')
      .eq('company_id', profile!.company_id!)
      .order('acquisition_date', { ascending: false });
    setAssets((data as Asset[]) ?? []);
    setLoading(false);
  }

  async function handleSaveManual() {
    if (!form.name.trim() || form.acquisition_cost <= 0) return;
    const monthly = form.useful_life_years > 0
      ? Math.round((form.acquisition_cost / (form.useful_life_years * 12)) * 100) / 100
      : 0;
    const { data: asset, error: aErr } = await supabase
      .from('acc_fixed_assets')
      .insert({
        company_id: profile!.company_id!,
        created_by: profile!.id,
        name: form.name,
        category: form.category,
        acquisition_date: form.acquisition_date,
        acquisition_cost: form.acquisition_cost,
        vat_amount: form.vat_amount,
        useful_life_years: form.useful_life_years,
        monthly_depreciation: monthly,
        current_book_value: form.acquisition_cost,
        notes: form.notes,
      })
      .select('id')
      .single();
    if (aErr || !asset) return;

    // Mirror the scanner path: create a paired expense transaction so the
    // investment lands in the P&L / cash-flow statements.
    await supabase.from('acc_transactions').insert({
      company_id: profile!.company_id!,
      transaction_type: 'expense',
      amount: form.acquisition_cost + (form.vat_amount || 0),
      currency: 'EUR',
      description: `Investim: ${form.name}`,
      transaction_date: form.acquisition_date,
      notes: `Aset fiks (${form.useful_life_years} vite, zhvleresim mujor ${monthly})`,
      created_by: profile!.id,
      fixed_asset_id: asset.id,
    });

    setShowManual(false);
    setForm({ name: '', category: 'equipment', acquisition_date: new Date().toISOString().slice(0, 10), acquisition_cost: 0, vat_amount: 0, useful_life_years: 5, notes: '' });
    fetchAssets();
  }

  async function handleDelete(id: string) {
    if (!confirm(t('common.deleteAssetConfirm'))) return;
    await supabase.from('acc_fixed_assets').delete().eq('id', id);
    fetchAssets();
  }

  const totalCost = assets.reduce((s, a) => s + (a.acquisition_cost || 0), 0);
  const totalBookValue = assets.reduce((s, a) => s + (a.current_book_value || 0), 0);
  const totalMonthlyDep = assets.reduce((s, a) => s + (a.monthly_depreciation || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Asetet Fikse / Investimet</h1>
          <p className="text-gray-500 mt-1">{t('common.assetRegistryDescription')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowScan(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-medium text-sm"
          >
            <Sparkles className="w-4 h-4" />
            Skano Dokument
          </button>
          <button
            onClick={() => setShowManual(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium text-sm"
          >
            <Plus className="w-4 h-4" />
            Shto manualisht
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase">{t('common.totalPurchaseCost')}</p>
          <p className="text-2xl font-bold text-gray-900 mt-2">{formatCurrency(totalCost)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase">{t('common.currentBookValue')}</p>
          <p className="text-2xl font-bold text-emerald-600 mt-2">{formatCurrency(totalBookValue)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase">{t('common.monthlyDepreciation')}</p>
          <p className="text-2xl font-bold text-amber-600 mt-2">{formatCurrency(totalMonthlyDep)}</p>
        </div>
      </div>

      {loading ? (
        <TableRowsSkeleton rows={6} cols={6} />
      ) : assets.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
          <Briefcase className="w-12 h-12 mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 text-sm">{t('common.noAssetsRegistered')}</p>
          <p className="text-gray-400 text-xs mt-1">{t('common.scanInvestmentInvoice')}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Emri</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Kategoria</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{t('common.purchaseDate')}</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Kosto</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Jeta</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Zhvl. mujore</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{t('common.bookValue')}</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Veprime</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {assets.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{a.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{CATEGORY_LABELS[a.category] || a.category}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{a.acquisition_date}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900">{formatCurrency(a.acquisition_cost)}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-600">{a.useful_life_years} v.</td>
                    <td className="px-4 py-3 text-sm text-right text-amber-600 font-medium">{formatCurrency(a.monthly_depreciation)}</td>
                    <td className="px-4 py-3 text-sm text-right text-emerald-600 font-semibold">{formatCurrency(a.current_book_value)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button onClick={() => setPreviewAsset(a)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                          title="Preview">
                          <Eye className="w-4 h-4" />
                        </button>
                        {a.document_url && (
                          <a href={a.document_url} target="_blank" rel="noopener noreferrer"
                            className="p-1.5 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded"
                            title="Hap dokumentin">
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}
                        <button onClick={() => handleDelete(a.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded" title="Fshi">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {previewAsset && (
        <DocumentPreviewModal
          title={previewAsset.name}
          subtitle="Aset Fiks / Investim"
          statusLabel={previewAsset.status}
          accentColor="blue"
          fields={[
            { label: 'Kategoria', value: CATEGORY_LABELS[previewAsset.category] || previewAsset.category },
            { label: 'Data blerjes', value: previewAsset.acquisition_date },
            { label: 'Kosto', value: formatCurrency(previewAsset.acquisition_cost) },
            { label: 'TVSH', value: formatCurrency(previewAsset.vat_amount) },
            { label: 'Jeta (vite)', value: previewAsset.useful_life_years },
            { label: 'Zhvleresim mujor', value: formatCurrency(previewAsset.monthly_depreciation) },
            { label: 'Zhvleresim i akumuluar', value: formatCurrency(previewAsset.accumulated_depreciation) },
            { label: 'Vlera aktuale libri', value: formatCurrency(previewAsset.current_book_value) },
          ]}
          notes={previewAsset.notes || undefined}
          documentUrl={previewAsset.document_url || undefined}
          documentMime={previewAsset.document_mime || undefined}
          onClose={() => setPreviewAsset(null)}
        />
      )}

      {showScan && (
        <ScanDocumentModal
          initialKind="investment"
          onClose={() => setShowScan(false)}
          onSaved={() => fetchAssets()}
        />
      )}

      {showManual && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900">Shto Aset te Ri</h2>
              <button onClick={() => setShowManual(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg">
                <span className="text-xl">X</span>
              </button>
            </div>
            <div className="p-6 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Emri *</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Kategoria</label>
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm">
                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{t('common.purchaseDate')}</label>
                  <input type="date" value={form.acquisition_date} onChange={(e) => setForm({ ...form, acquisition_date: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Kosto *</label>
                  <input type="number" step="0.01" value={form.acquisition_cost} onChange={(e) => setForm({ ...form, acquisition_cost: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">TVSH</label>
                  <input type="number" step="0.01" value={form.vat_amount} onChange={(e) => setForm({ ...form, vat_amount: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Jeta (vite)</label>
                  <input type="number" min="1" max="30" value={form.useful_life_years} onChange={(e) => setForm({ ...form, useful_life_years: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                </div>
              </div>
              <p className="text-xs text-slate-500">
                Zhvleresim mujor: <strong>{formatCurrency(form.useful_life_years > 0 ? form.acquisition_cost / (form.useful_life_years * 12) : 0)}</strong>
              </p>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Shenime</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
              <button onClick={() => setShowManual(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg text-sm">{t('common.cancel')}</button>
              <button onClick={handleSaveManual} className="px-5 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-semibold text-sm">{t('common.save')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
