import { useState, useEffect } from 'react';
import { FileText, Plus, CreditCard as Edit3, Trash2, Save, X, Loader2, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTranslation } from '../../i18n';
import { PageSkeleton } from '../../components/ui/Skeleton';

interface StaticPage {
  id: string;
  slug: string;
  title: string;
  content: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

const emptyPage = {
  slug: '',
  title: '',
  content: '',
  is_active: true,
  sort_order: 0,
};

export default function StaticPages() {
  const { t } = useTranslation();
  const [pages, setPages] = useState<StaticPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<StaticPage | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyPage);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    fetchPages();
  }, []);

  async function fetchPages() {
    try {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('static_pages')
        .select('*')
        .order('sort_order');
      if (err) throw err;
      setPages(data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyPage, sort_order: pages.length });
    setCreating(true);
  }

  function openEdit(page: StaticPage) {
    setCreating(false);
    setEditing(page);
    setForm({
      slug: page.slug,
      title: page.title,
      content: page.content,
      is_active: page.is_active,
      sort_order: page.sort_order,
    });
  }

  function closeModal() {
    setEditing(null);
    setCreating(false);
    setForm(emptyPage);
  }

  async function handleSave() {
    if (!form.title.trim() || !form.slug.trim()) {
      setError(t('superAdmin.staticPages.titleSlugRequired'));
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const slug = form.slug.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

      if (creating) {
        const { error: err } = await supabase.from('static_pages').insert({
          slug,
          title: form.title.trim(),
          content: form.content,
          is_active: form.is_active,
          sort_order: form.sort_order,
        });
        if (err) throw err;
      } else if (editing) {
        const { error: err } = await supabase
          .from('static_pages')
          .update({
            slug,
            title: form.title.trim(),
            content: form.content,
            is_active: form.is_active,
            sort_order: form.sort_order,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editing.id);
        if (err) throw err;
      }
      closeModal();
      await fetchPages();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      const { error: err } = await supabase.from('static_pages').delete().eq('id', id);
      if (err) throw err;
      setDeleteConfirm(null);
      await fetchPages();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function toggleActive(page: StaticPage) {
    try {
      const { error: err } = await supabase
        .from('static_pages')
        .update({ is_active: !page.is_active, updated_at: new Date().toISOString() })
        .eq('id', page.id);
      if (err) throw err;
      await fetchPages();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const showModal = creating || editing !== null;

  if (loading) {
    return (
      <PageSkeleton rows={6} cols={4} showStats={false} />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('superAdmin.staticPages.title')}</h1>
          <p className="text-gray-500 mt-1">{t('superAdmin.staticPages.subtitle')}</p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium"
        >
          <Plus className="w-4 h-4" />
          {t('superAdmin.staticPages.addPage')}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-red-700 text-sm flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid gap-4">
        {pages.map((page) => (
          <div
            key={page.id}
            className={`bg-white rounded-xl shadow-sm border p-5 transition-all ${
              page.is_active ? 'border-gray-100' : 'border-red-100 opacity-60'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 text-teal-600" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-gray-900">{page.title}</h3>
                    {!page.is_active && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">{t('common.inactive')}</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">/{page.slug}</p>
                  <p className="text-xs text-gray-500 mt-1 truncate max-w-md">
                    {page.content.substring(0, 100)}{page.content.length > 100 ? '...' : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0 ml-4">
                <button
                  onClick={() => toggleActive(page)}
                  className={`p-1.5 rounded-lg transition-colors ${
                    page.is_active ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-50'
                  }`}
                >
                  {page.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => openEdit(page)}
                  className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-50 hover:text-teal-600 transition-colors"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setDeleteConfirm(page.id)}
                  className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}

        {pages.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">{t('superAdmin.staticPages.noPages')}</p>
          </div>
        )}
      </div>

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-xl">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">{t('superAdmin.staticPages.deletePage')}</h3>
            </div>
            <p className="text-sm text-gray-500 mb-6">{t('common.irreversible')}</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition-colors">
                {t('common.cancel')}
              </button>
              <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 transition-colors">
                {t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full my-8">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">{creating ? t('superAdmin.staticPages.addNewPage') : t('superAdmin.staticPages.editPage')}</h2>
              <button onClick={closeModal} className="p-2 rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.title')} *</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => {
                      setForm((p) => ({
                        ...p,
                        title: e.target.value,
                        slug: creating ? e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') : p.slug,
                      }));
                    }}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('superAdmin.staticPages.slug')} *</label>
                  <input
                    type="text"
                    value={form.slug}
                    onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('superAdmin.staticPages.content')}</label>
                <textarea
                  value={form.content}
                  onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
                  rows={12}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm resize-none font-mono"
                />
              </div>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setForm((p) => ({ ...p, is_active: !p.is_active }))}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border transition-colors ${
                    form.is_active ? 'border-green-200 bg-green-50 text-green-700' : 'border-gray-200 bg-gray-50 text-gray-500'
                  }`}
                >
                  {form.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  <span className="text-sm font-medium">{form.is_active ? t('common.active') : t('common.inactive')}</span>
                </button>
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex gap-3 justify-end">
              <button onClick={closeModal} className="px-5 py-2.5 rounded-lg border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition-colors">
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium disabled:opacity-50"
              >
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
