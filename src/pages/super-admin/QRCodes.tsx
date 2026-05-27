import { useState, useEffect } from 'react';
import { QrCode, Plus, CreditCard as Edit3, Trash2, Save, X, Loader2, AlertTriangle, Eye, EyeOff, ExternalLink, Copy, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTranslation } from '../../i18n';
import { PageSkeleton } from '../../components/ui/Skeleton';

interface QRCodeItem {
  id: string;
  name: string;
  target_url: string;
  description: string;
  is_active: boolean;
  scan_count: number;
  created_at: string;
}

const emptyQR = { name: '', target_url: '', description: '', is_active: true };

export default function QRCodes() {
  const { t } = useTranslation();
  const [codes, setCodes] = useState<QRCodeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<QRCodeItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyQR);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => { fetchCodes(); }, []);

  async function fetchCodes() {
    try {
      setLoading(true);
      const { data, error: err } = await supabase.from('qr_codes').select('*').order('created_at', { ascending: false });
      if (err) throw err;
      setCodes(data ?? []);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }

  function openCreate() { setEditing(null); setForm(emptyQR); setCreating(true); }
  function openEdit(code: QRCodeItem) { setCreating(false); setEditing(code); setForm({ name: code.name, target_url: code.target_url, description: code.description, is_active: code.is_active }); }
  function closeModal() { setEditing(null); setCreating(false); setForm(emptyQR); }

  async function handleSave() {
    if (!form.name.trim() || !form.target_url.trim()) { setError(t('superAdmin.qrCodes.nameRequired')); return; }
    try {
      setSaving(true);
      setError(null);
      if (creating) {
        const { error: err } = await supabase.from('qr_codes').insert({ name: form.name.trim(), target_url: form.target_url.trim(), description: form.description.trim(), is_active: form.is_active });
        if (err) throw err;
      } else if (editing) {
        const { error: err } = await supabase.from('qr_codes').update({ name: form.name.trim(), target_url: form.target_url.trim(), description: form.description.trim(), is_active: form.is_active }).eq('id', editing.id);
        if (err) throw err;
      }
      closeModal();
      await fetchCodes();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    try {
      const { error: err } = await supabase.from('qr_codes').delete().eq('id', id);
      if (err) throw err;
      setDeleteConfirm(null);
      await fetchCodes();
    } catch (err) { setError(err.message); }
  }

  function getQRImageUrl(url: string, size = 200) {
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(url)}`;
  }

  function copyToClipboard(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  const showModal = creating || editing !== null;

  if (loading) {
    return <PageSkeleton rows={6} cols={4} showStats={false} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('superAdmin.qrCodes.title')}</h1>
          <p className="text-gray-500 mt-1">{t('superAdmin.qrCodes.subtitle')}</p>
        </div>
        <button onClick={openCreate} className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium">
          <Plus className="w-4 h-4" />{t('superAdmin.qrCodes.createQr')}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-red-700 text-sm flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {codes.map((code) => (
          <div key={code.id} className={`bg-white rounded-xl shadow-sm border overflow-hidden transition-all ${code.is_active ? 'border-gray-100' : 'border-red-100 opacity-60'}`}>
            <div className="p-6 flex flex-col items-center">
              <div className="w-40 h-40 bg-white rounded-xl border-2 border-gray-100 p-2 mb-4">
                <img src={getQRImageUrl(code.target_url)} alt={code.name} className="w-full h-full" />
              </div>
              <h3 className="text-sm font-bold text-gray-900 text-center">{code.name}</h3>
              {code.description && <p className="text-xs text-gray-500 text-center mt-1">{code.description}</p>}
              <div className="flex items-center gap-1 mt-2">
                <ExternalLink className="w-3 h-3 text-gray-400" />
                <p className="text-xs text-teal-600 truncate max-w-[180px]">{code.target_url}</p>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <span className="text-xs text-gray-400">{code.scan_count} {t('superAdmin.qrCodes.scans')}</span>
                {!code.is_active && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">{t('common.inactive')}</span>}
              </div>
            </div>
            <div className="border-t border-gray-100 px-4 py-3 flex items-center justify-between bg-gray-50/50">
              <button
                onClick={() => copyToClipboard(getQRImageUrl(code.target_url, 400), code.id)}
                className="inline-flex items-center gap-1.5 text-xs text-gray-600 hover:text-teal-600 transition-colors"
              >
                {copied === code.id ? <CheckCircle className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copied === code.id ? t('superAdmin.qrCodes.copied') : t('superAdmin.qrCodes.copyUrl')}
              </button>
              <div className="flex items-center gap-1">
                <button onClick={() => openEdit(code)} className="p-1.5 rounded-lg text-gray-400 hover:bg-white hover:text-teal-600 transition-colors"><Edit3 className="w-3.5 h-3.5" /></button>
                <button onClick={() => setDeleteConfirm(code.id)} className="p-1.5 rounded-lg text-gray-400 hover:bg-white hover:text-red-600 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          </div>
        ))}
        {codes.length === 0 && (
          <div className="sm:col-span-2 lg:col-span-3 bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
            <QrCode className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">{t('superAdmin.qrCodes.noQrCodes')}</p>
          </div>
        )}
      </div>

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-xl"><Trash2 className="w-5 h-5 text-red-600" /></div>
              <h3 className="text-lg font-bold text-gray-900">{t('superAdmin.qrCodes.deleteQr')}</h3>
            </div>
            <p className="text-sm text-gray-500 mb-6">{t('common.irreversible')}</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition-colors">{t('common.cancel')}</button>
              <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 transition-colors">{t('common.delete')}</button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">{creating ? t('superAdmin.qrCodes.createQr') : t('superAdmin.qrCodes.editQr')}</h2>
              <button onClick={closeModal} className="p-2 rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              {form.target_url && (
                <div className="flex justify-center">
                  <div className="w-32 h-32 bg-white rounded-xl border-2 border-gray-100 p-2">
                    <img src={getQRImageUrl(form.target_url)} alt="Preview" className="w-full h-full" />
                  </div>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.name')} *</label>
                <input type="text" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="p.sh. Shkarkimi i App" className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('superAdmin.qrCodes.targetUrl')} *</label>
                <input type="text" value={form.target_url} onChange={(e) => setForm((p) => ({ ...p, target_url: e.target.value }))} placeholder="https://..." className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.description')}</label>
                <textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} rows={2} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm resize-none" />
              </div>
              <button onClick={() => setForm((p) => ({ ...p, is_active: !p.is_active }))} className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${form.is_active ? 'border-green-200 bg-green-50 text-green-700' : 'border-gray-200 bg-gray-50 text-gray-500'}`}>
                {form.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                <span className="text-sm font-medium">{form.is_active ? t('common.active') : t('common.inactive')}</span>
              </button>
            </div>
            <div className="p-6 border-t border-gray-100 flex gap-3 justify-end">
              <button onClick={closeModal} className="px-5 py-2.5 rounded-lg border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition-colors">{t('common.cancel')}</button>
              <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-2 px-6 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
