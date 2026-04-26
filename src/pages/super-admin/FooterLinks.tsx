import { useState, useEffect } from 'react';
import {
  Link2,
  Plus,
  Edit3,
  Trash2,
  Save,
  X,
  Loader2,
  AlertTriangle,
  Eye,
  EyeOff,
  ExternalLink,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTranslation } from '../../i18n';

interface FooterLink {
  id: string;
  category: string;
  label: string;
  url: string;
  icon_name: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

const emptyLink = { category: 'social', label: '', url: '', icon_name: '', is_active: true, sort_order: 0 };

export default function FooterLinks() {
  const { t } = useTranslation();

  const categories = [
    { value: 'social', label: 'Social Media', color: 'bg-blue-100 text-blue-700' },
    { value: 'platform', label: t('home.footerPlatform'), color: 'bg-teal-100 text-teal-700' },
    { value: 'company', label: t('common.company'), color: 'bg-amber-100 text-amber-700' },
    { value: 'legal', label: 'Ligjore', color: 'bg-gray-100 text-gray-700' },
  ];

  const [links, setLinks] = useState<FooterLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<FooterLink | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyLink);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => { fetchLinks(); }, []);

  async function fetchLinks() {
    try {
      setLoading(true);
      const { data, error: err } = await supabase.from('footer_links').select('*').order('category').order('sort_order');
      if (err) throw err;
      setLinks(data ?? []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyLink, sort_order: links.length });
    setCreating(true);
  }

  function openEdit(link: FooterLink) {
    setCreating(false);
    setEditing(link);
    setForm({ category: link.category, label: link.label, url: link.url, icon_name: link.icon_name, is_active: link.is_active, sort_order: link.sort_order });
  }

  function closeModal() { setEditing(null); setCreating(false); setForm(emptyLink); }

  async function handleSave() {
    if (!form.label.trim() || !form.url.trim()) { setError(t('common.name') + ' & URL ' + t('common.error')); return; }
    try {
      setSaving(true);
      setError(null);
      if (creating) {
        const { error: err } = await supabase.from('footer_links').insert({
          category: form.category, label: form.label.trim(), url: form.url.trim(),
          icon_name: form.icon_name.trim(), is_active: form.is_active, sort_order: form.sort_order,
        });
        if (err) throw err;
      } else if (editing) {
        const { error: err } = await supabase.from('footer_links').update({
          category: form.category, label: form.label.trim(), url: form.url.trim(),
          icon_name: form.icon_name.trim(), is_active: form.is_active, sort_order: form.sort_order,
        }).eq('id', editing.id);
        if (err) throw err;
      }
      closeModal();
      await fetchLinks();
    } catch (err: any) { setError(err.message); } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    try {
      const { error: err } = await supabase.from('footer_links').delete().eq('id', id);
      if (err) throw err;
      setDeleteConfirm(null);
      await fetchLinks();
    } catch (err: any) { setError(err.message); }
  }

  async function toggleActive(link: FooterLink) {
    try {
      const { error: err } = await supabase.from('footer_links').update({ is_active: !link.is_active }).eq('id', link.id);
      if (err) throw err;
      await fetchLinks();
    } catch (err: any) { setError(err.message); }
  }

  const getCatConfig = (cat: string) => categories.find((c) => c.value === cat) || { value: cat, label: cat, color: 'bg-gray-100 text-gray-700' };
  const filtered = filter === 'all' ? links : links.filter((l) => l.category === filter);
  const showModal = creating || editing !== null;

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-teal-600" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('nav.footerSocial')}</h1>
          <p className="text-gray-500 mt-1">{t('superAdmin.homepage.subtitle')}</p>
        </div>
        <button onClick={openCreate} className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium">
          <Plus className="w-4 h-4" />{t('common.add')}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-red-700 text-sm flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setFilter('all')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === 'all' ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          {t('common.all')} ({links.length})
        </button>
        {categories.map((cat) => {
          const count = links.filter((l) => l.category === cat.value).length;
          return (
            <button key={cat.value} onClick={() => setFilter(cat.value)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === cat.value ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {cat.label} ({count})
            </button>
          );
        })}
      </div>

      <div className="grid gap-3">
        {filtered.map((link) => {
          const catCfg = getCatConfig(link.category);
          return (
            <div key={link.id} className={`bg-white rounded-xl shadow-sm border p-4 flex items-center gap-4 transition-all ${link.is_active ? 'border-gray-100' : 'border-red-100 opacity-60'}`}>
              <div className="w-9 h-9 rounded-lg bg-teal-50 flex items-center justify-center flex-shrink-0">
                <Link2 className="w-4 h-4 text-teal-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-gray-900">{link.label}</p>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${catCfg.color}`}>{catCfg.label}</span>
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <ExternalLink className="w-3 h-3 text-gray-400" />
                  <p className="text-xs text-gray-500 truncate">{link.url}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => toggleActive(link)} className={`p-1.5 rounded-lg transition-colors ${link.is_active ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-50'}`}>
                  {link.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
                <button onClick={() => openEdit(link)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-50 hover:text-teal-600 transition-colors"><Edit3 className="w-4 h-4" /></button>
                <button onClick={() => setDeleteConfirm(link.id)} className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
            <Link2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">{t('common.noData')}</p>
          </div>
        )}
      </div>

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-xl"><Trash2 className="w-5 h-5 text-red-600" /></div>
              <h3 className="text-lg font-bold text-gray-900">{t('common.delete')}?</h3>
            </div>
            <p className="text-sm text-gray-500 mb-6">{t('common.areYouSure')}</p>
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
              <h2 className="text-lg font-bold text-gray-900">{creating ? `${t('common.add')}` : `${t('common.edit')}`}</h2>
              <button onClick={closeModal} className="p-2 rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.type')}</label>
                <select value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm bg-white">
                  {categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.name')} *</label>
                <input type="text" value={form.label} onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">URL *</label>
                <input type="text" value={form.url} onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))} placeholder="https://..." className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Icon</label>
                <input type="text" value={form.icon_name} onChange={(e) => setForm((p) => ({ ...p, icon_name: e.target.value }))} placeholder="p.sh. Facebook, Instagram" className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm" />
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
                {saving ? t('common.processing') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
