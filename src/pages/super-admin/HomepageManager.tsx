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
  Image,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  ExternalLink,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTranslation } from '../../i18n';

interface HomepageContent {
  id: string;
  section_type: string;
  title: string;
  subtitle: string;
  content: string;
  image_url: string;
  link_url: string;
  link_text: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const emptyContent: Omit<HomepageContent, 'id' | 'created_at' | 'updated_at'> = {
  section_type: 'banner',
  title: '',
  subtitle: '',
  content: '',
  image_url: '',
  link_url: '',
  link_text: '',
  sort_order: 0,
  is_active: true,
};

export default function HomepageManager() {
  const { t } = useTranslation();

  const sectionTypes = [
    { value: 'hero', label: 'Hero Banner', color: 'bg-teal-100 text-teal-700' },
    { value: 'banner', label: 'Banner', color: 'bg-blue-100 text-blue-700' },
    { value: 'ad', label: t('home.ad'), color: 'bg-amber-100 text-amber-700' },
    { value: 'feature', label: t('superAdmin.plans.features'), color: 'bg-green-100 text-green-700' },
    { value: 'testimonial', label: 'Testimonial', color: 'bg-cyan-100 text-cyan-700' },
  ];

  const [items, setItems] = useState<HomepageContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<HomepageContent | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState(emptyContent);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  useEffect(() => {
    fetchContent();
  }, []);

  async function fetchContent() {
    try {
      setLoading(true);
      setError(null);
      const { data, error: err } = await supabase
        .from('homepage_content')
        .select('*')
        .order('sort_order');
      if (err) throw err;
      setItems(data ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.errorLoading'));
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditingItem(null);
    setFormData({ ...emptyContent, sort_order: items.length });
    setIsCreating(true);
  }

  function openEdit(item: HomepageContent) {
    setIsCreating(false);
    setEditingItem(item);
    setFormData({
      section_type: item.section_type,
      title: item.title,
      subtitle: item.subtitle,
      content: item.content,
      image_url: item.image_url,
      link_url: item.link_url,
      link_text: item.link_text,
      sort_order: item.sort_order,
      is_active: item.is_active,
    });
  }

  function closeModal() {
    setEditingItem(null);
    setIsCreating(false);
    setFormData(emptyContent);
  }

  async function handleSave() {
    if (!formData.title.trim()) {
      setError(t('common.title') + ' ' + t('common.error'));
      return;
    }

    try {
      setSaving(true);
      setError(null);

      if (isCreating) {
        const { error: err } = await supabase.from('homepage_content').insert({
          section_type: formData.section_type,
          title: formData.title.trim(),
          subtitle: formData.subtitle.trim(),
          content: formData.content.trim(),
          image_url: formData.image_url.trim(),
          link_url: formData.link_url.trim(),
          link_text: formData.link_text.trim(),
          sort_order: formData.sort_order,
          is_active: formData.is_active,
        });
        if (err) throw err;
      } else if (editingItem) {
        const { error: err } = await supabase
          .from('homepage_content')
          .update({
            section_type: formData.section_type,
            title: formData.title.trim(),
            subtitle: formData.subtitle.trim(),
            content: formData.content.trim(),
            image_url: formData.image_url.trim(),
            link_url: formData.link_url.trim(),
            link_text: formData.link_text.trim(),
            sort_order: formData.sort_order,
            is_active: formData.is_active,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingItem.id);
        if (err) throw err;
      }

      closeModal();
      await fetchContent();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.errorSaving'));
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(item: HomepageContent) {
    try {
      const { error: err } = await supabase
        .from('homepage_content')
        .update({ is_active: !item.is_active, updated_at: new Date().toISOString() })
        .eq('id', item.id);
      if (err) throw err;
      await fetchContent();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function handleDelete(id: string) {
    try {
      const { error: err } = await supabase.from('homepage_content').delete().eq('id', id);
      if (err) throw err;
      setDeleteConfirm(null);
      await fetchContent();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function handleReorder(id: string, direction: 'up' | 'down') {
    const idx = items.findIndex((i) => i.id === id);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= items.length) return;

    try {
      const a = items[idx];
      const b = items[swapIdx];
      await Promise.all([
        supabase
          .from('homepage_content')
          .update({ sort_order: b.sort_order, updated_at: new Date().toISOString() })
          .eq('id', a.id),
        supabase
          .from('homepage_content')
          .update({ sort_order: a.sort_order, updated_at: new Date().toISOString() })
          .eq('id', b.id),
      ]);
      await fetchContent();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  const getTypeConfig = (type: string) =>
    sectionTypes.find((s) => s.value === type) || { value: type, label: type, color: 'bg-gray-100 text-gray-700' };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600" />
      </div>
    );
  }

  const showModal = isCreating || editingItem !== null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('superAdmin.homepage.title')}</h1>
          <p className="text-gray-500 mt-1">{t('superAdmin.homepage.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium text-sm"
          >
            <ExternalLink className="w-4 h-4" />
            {t('nav.homepage')}
          </a>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium"
          >
            <Plus className="w-4 h-4" />
            {t('superAdmin.homepage.addSection')}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-red-700 text-sm">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid gap-4">
        {items.map((item, idx) => {
          const typeConfig = getTypeConfig(item.section_type);
          return (
            <div
              key={item.id}
              className={`bg-white rounded-xl shadow-sm border transition-all ${
                item.is_active ? 'border-gray-100' : 'border-red-100 opacity-60'
              }`}
            >
              <div className="p-5">
                <div className="flex gap-4">
                  {item.image_url && (
                    <button
                      onClick={() => setPreviewImage(item.image_url)}
                      className="flex-shrink-0 w-24 h-24 rounded-xl overflow-hidden group relative"
                    >
                      <img
                        src={item.image_url}
                        alt={item.title}
                        className="w-full h-full object-cover transition-transform group-hover:scale-110"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                        <Eye className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </button>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${typeConfig.color}`}>
                        {typeConfig.label}
                      </span>
                      {!item.is_active && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                          {t('common.inactive')}
                        </span>
                      )}
                      <span className="text-xs text-gray-400">#{item.sort_order}</span>
                    </div>
                    <h3 className="text-base font-bold text-gray-900 truncate">{item.title}</h3>
                    {item.subtitle && (
                      <p className="text-sm text-gray-500 truncate mt-0.5">{item.subtitle}</p>
                    )}
                    {item.link_url && (
                      <div className="flex items-center gap-1 mt-1">
                        <ExternalLink className="w-3 h-3 text-teal-500" />
                        <span className="text-xs text-teal-600 truncate">{item.link_url}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleReorder(item.id, 'up')}
                      disabled={idx === 0}
                      className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleReorder(item.id, 'down')}
                      disabled={idx === items.length - 1}
                      className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                    <div className="w-px h-6 bg-gray-200 mx-1" />
                    <button
                      onClick={() => handleToggleActive(item)}
                      className={`p-1.5 rounded-lg transition-colors ${
                        item.is_active
                          ? 'text-green-600 hover:bg-green-50'
                          : 'text-gray-400 hover:bg-gray-50'
                      }`}
                    >
                      {item.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => openEdit(item)}
                      className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-50 hover:text-teal-600 transition-colors"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(item.id)}
                      className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {items.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
            <Globe className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">{t('superAdmin.homepage.noSections')}</p>
          </div>
        )}
      </div>

      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-4xl w-full">
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute -top-10 right-0 text-white hover:text-gray-300 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={previewImage}
              alt="Preview"
              className="w-full rounded-xl"
            />
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-xl">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">{t('superAdmin.homepage.confirmDelete')}</h3>
            </div>
            <p className="text-sm text-gray-500 mb-6">
              {t('common.areYouSure')}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 transition-colors"
              >
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
              <h2 className="text-lg font-bold text-gray-900">
                {isCreating ? t('superAdmin.homepage.addSection') : t('superAdmin.homepage.editSection')}
              </h2>
              <button
                onClick={closeModal}
                className="p-2 rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('superAdmin.homepage.sectionType')}</label>
                  <select
                    value={formData.section_type}
                    onChange={(e) => setFormData((p) => ({ ...p, section_type: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm bg-white"
                  >
                    {sectionTypes.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('superAdmin.homepage.sortOrder')}</label>
                    <input
                      type="number"
                      min={0}
                      value={formData.sort_order}
                      onChange={(e) =>
                        setFormData((p) => ({ ...p, sort_order: Number(e.target.value) }))
                      }
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      onClick={() => setFormData((p) => ({ ...p, is_active: !p.is_active }))}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border transition-colors w-full ${
                        formData.is_active
                          ? 'border-green-200 bg-green-50 text-green-700'
                          : 'border-gray-200 bg-gray-50 text-gray-500'
                      }`}
                    >
                      {formData.is_active ? (
                        <Eye className="w-4 h-4" />
                      ) : (
                        <EyeOff className="w-4 h-4" />
                      )}
                      <span className="text-sm font-medium">
                        {formData.is_active ? t('common.active') : t('common.inactive')}
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.title')} *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.description')}</label>
                <input
                  type="text"
                  value={formData.subtitle}
                  onChange={(e) => setFormData((p) => ({ ...p, subtitle: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.notes')}</label>
                <textarea
                  value={formData.content}
                  onChange={(e) => setFormData((p) => ({ ...p, content: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t('superAdmin.homepage.imageUrl')}
                </label>
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={formData.image_url}
                    onChange={(e) => setFormData((p) => ({ ...p, image_url: e.target.value }))}
                    placeholder="https://images.pexels.com/..."
                    className="flex-1 px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                  />
                  {formData.image_url && (
                    <button
                      onClick={() => setPreviewImage(formData.image_url)}
                      className="px-3 py-2.5 bg-gray-100 rounded-lg text-gray-600 hover:bg-gray-200 transition-colors"
                    >
                      <Image className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {formData.image_url && (
                  <div className="mt-3 rounded-xl overflow-hidden border border-gray-200 h-32">
                    <img
                      src={formData.image_url}
                      alt="Preview"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                )}
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {t('superAdmin.homepage.linkUrl')}
                  </label>
                  <input
                    type="text"
                    value={formData.link_url}
                    onChange={(e) => setFormData((p) => ({ ...p, link_url: e.target.value }))}
                    placeholder="/register ose https://..."
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {t('superAdmin.homepage.linkText')}
                  </label>
                  <input
                    type="text"
                    value={formData.link_text}
                    onChange={(e) => setFormData((p) => ({ ...p, link_text: e.target.value }))}
                    placeholder={t('home.learnMore')}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-100 flex gap-3 justify-end">
              <button
                onClick={closeModal}
                className="px-5 py-2.5 rounded-lg border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {saving ? t('common.processing') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
