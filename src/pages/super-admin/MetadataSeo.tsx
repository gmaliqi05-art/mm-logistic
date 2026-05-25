import { useState, useEffect } from 'react';
import {
  Globe,
  Plus,
  Edit3,
  Trash2,
  Save,
  X,
  Loader2,
  AlertTriangle,
  Search,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTranslation } from '../../i18n';
import { PageSkeleton } from '../../components/ui/Skeleton';

interface SeoEntry {
  id: string;
  page_path: string;
  title: string;
  description: string;
  keywords: string;
  og_image_url: string;
  updated_at: string;
}

const emptySeo = { page_path: '', title: '', description: '', keywords: '', og_image_url: '' };

export default function MetadataSeo() {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<SeoEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<SeoEntry | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptySeo);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => { fetchEntries(); }, []);

  async function fetchEntries() {
    try {
      setLoading(true);
      const { data, error: err } = await supabase.from('seo_metadata').select('*').order('page_path');
      if (err) throw err;
      setEntries(data ?? []);
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  }

  function openCreate() { setEditing(null); setForm(emptySeo); setCreating(true); }
  function openEdit(entry: SeoEntry) { setCreating(false); setEditing(entry); setForm({ page_path: entry.page_path, title: entry.title, description: entry.description, keywords: entry.keywords, og_image_url: entry.og_image_url }); }
  function closeModal() { setEditing(null); setCreating(false); setForm(emptySeo); }

  async function handleSave() {
    if (!form.page_path.trim() || !form.title.trim()) { setError(t('superAdmin.seo.pathRequired')); return; }
    try {
      setSaving(true);
      setError(null);
      if (creating) {
        const { error: err } = await supabase.from('seo_metadata').insert({
          page_path: form.page_path.trim(), title: form.title.trim(), description: form.description.trim(),
          keywords: form.keywords.trim(), og_image_url: form.og_image_url.trim(),
        });
        if (err) throw err;
      } else if (editing) {
        const { error: err } = await supabase.from('seo_metadata').update({
          page_path: form.page_path.trim(), title: form.title.trim(), description: form.description.trim(),
          keywords: form.keywords.trim(), og_image_url: form.og_image_url.trim(), updated_at: new Date().toISOString(),
        }).eq('id', editing.id);
        if (err) throw err;
      }
      closeModal();
      await fetchEntries();
    } catch (err: any) { setError(err.message); } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    try {
      const { error: err } = await supabase.from('seo_metadata').delete().eq('id', id);
      if (err) throw err;
      setDeleteConfirm(null);
      await fetchEntries();
    } catch (err: any) { setError(err.message); }
  }

  const showModal = creating || editing !== null;

  if (loading) {
    return <PageSkeleton rows={6} cols={4} showStats={false} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('superAdmin.seo.title')}</h1>
          <p className="text-gray-500 mt-1">{t('superAdmin.seo.subtitle')}</p>
        </div>
        <button onClick={openCreate} className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium">
          <Plus className="w-4 h-4" />{t('superAdmin.seo.addMeta')}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-red-700 text-sm flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('superAdmin.seo.pagePath')}</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('superAdmin.seo.seoTitle')}</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('common.description')}</th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-teal-500 flex-shrink-0" />
                      <span className="text-sm font-medium text-teal-700">{entry.page_path}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-gray-900 truncate max-w-[200px]">{entry.title}</p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-gray-500 truncate max-w-[250px]">{entry.description || '-'}</p>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(entry)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-teal-600 transition-colors"><Edit3 className="w-4 h-4" /></button>
                      <button onClick={() => setDeleteConfirm(entry.id)} className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center">
                    <Search className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">{t('superAdmin.seo.noMeta')}</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-xl"><Trash2 className="w-5 h-5 text-red-600" /></div>
              <h3 className="text-lg font-bold text-gray-900">{t('superAdmin.seo.deleteMeta')}</h3>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full my-8">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">{creating ? t('superAdmin.seo.addMetaNew') : t('superAdmin.seo.editMeta')}</h2>
              <button onClick={closeModal} className="p-2 rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('superAdmin.seo.pagePath')} *</label>
                <input type="text" value={form.page_path} onChange={(e) => setForm((p) => ({ ...p, page_path: e.target.value }))} placeholder="p.sh. / ose /login" className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('superAdmin.seo.seoTitle')} *</label>
                <input type="text" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm" />
                <p className="text-xs text-gray-400 mt-1">{form.title.length}/60 {t('superAdmin.seo.charsRecommended')}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Meta Description</label>
                <textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} rows={3} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm resize-none" />
                <p className="text-xs text-gray-400 mt-1">{form.description.length}/160 {t('superAdmin.seo.charsRecommended')}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Keywords</label>
                <input type="text" value={form.keywords} onChange={(e) => setForm((p) => ({ ...p, keywords: e.target.value }))} placeholder="keyword1, keyword2, keyword3" className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">OG Image URL</label>
                <input type="text" value={form.og_image_url} onChange={(e) => setForm((p) => ({ ...p, og_image_url: e.target.value }))} placeholder="https://..." className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm" />
                {form.og_image_url && (
                  <div className="mt-2 rounded-lg overflow-hidden border border-gray-200 h-28">
                    <img src={form.og_image_url} alt="OG Preview" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  </div>
                )}
              </div>

              <div className="bg-gray-50 rounded-xl p-4 mt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{t('superAdmin.seo.googlePreview')}</p>
                <div className="space-y-1">
                  <p className="text-sm text-blue-700 font-medium truncate">{form.title || t('superAdmin.seo.pageTitlePlaceholder')}</p>
                  <p className="text-xs text-green-700 truncate">www.mm-logistic.eu{form.page_path || '/'}</p>
                  <p className="text-xs text-gray-600 line-clamp-2">{form.description || t('superAdmin.seo.pageDescPlaceholder')}</p>
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex gap-3 justify-end">
              <button onClick={closeModal} className="px-5 py-2.5 rounded-lg border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition-colors">{t('common.cancel')}</button>
              <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-2 px-6 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? t('common.processing') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
