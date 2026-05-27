import { useState, useEffect } from 'react';
import { BookOpen, Plus, CreditCard as Edit3, Trash2, Save, X, Loader2, AlertTriangle, Eye, EyeOff, ArrowUp, ArrowDown } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTranslation } from '../../i18n';
import { PageSkeleton } from '../../components/ui/Skeleton';

interface ManualSection {
  id: string;
  title: string;
  content: string;
  target_role: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const roleColors: Record<string, string> = {
  all: 'bg-gray-100 text-gray-700',
  company_admin: 'bg-teal-100 text-teal-700',
  depot_worker: 'bg-blue-100 text-blue-700',
  driver: 'bg-amber-100 text-amber-700',
  super_admin: 'bg-red-100 text-red-700',
};

const emptySection = { title: '', content: '', target_role: 'all', sort_order: 0, is_active: true };

export default function UserManual() {
  const { t } = useTranslation();

  const roleOptions = [
    { value: 'all', label: t('superAdmin.manual.allRoles') },
    { value: 'company_admin', label: t('roles.company_admin') },
    { value: 'depot_worker', label: t('roles.depot_worker') },
    { value: 'driver', label: t('roles.driver') },
    { value: 'super_admin', label: t('roles.super_admin') },
  ];

  const [sections, setSections] = useState<ManualSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ManualSection | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptySection);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [filterRole, setFilterRole] = useState('all');

  useEffect(() => { fetchSections(); }, []);

  async function fetchSections() {
    try {
      setLoading(true);
      const { data, error: err } = await supabase.from('user_manual_sections').select('*').order('sort_order');
      if (err) throw err;
      setSections(data ?? []);
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setLoading(false); }
  }

  function openCreate() { setEditing(null); setForm({ ...emptySection, sort_order: sections.length }); setCreating(true); }
  function openEdit(s: ManualSection) { setCreating(false); setEditing(s); setForm({ title: s.title, content: s.content, target_role: s.target_role, sort_order: s.sort_order, is_active: s.is_active }); }
  function closeModal() { setEditing(null); setCreating(false); setForm(emptySection); }

  async function handleSave() {
    if (!form.title.trim()) { setError(t('superAdmin.manual.titleRequired')); return; }
    try {
      setSaving(true);
      setError(null);
      if (creating) {
        const { error: err } = await supabase.from('user_manual_sections').insert({
          title: form.title.trim(), content: form.content, target_role: form.target_role,
          sort_order: form.sort_order, is_active: form.is_active,
        });
        if (err) throw err;
      } else if (editing) {
        const { error: err } = await supabase.from('user_manual_sections').update({
          title: form.title.trim(), content: form.content, target_role: form.target_role,
          sort_order: form.sort_order, is_active: form.is_active, updated_at: new Date().toISOString(),
        }).eq('id', editing.id);
        if (err) throw err;
      }
      closeModal();
      await fetchSections();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    try {
      const { error: err } = await supabase.from('user_manual_sections').delete().eq('id', id);
      if (err) throw err;
      setDeleteConfirm(null);
      await fetchSections();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  }

  async function toggleActive(s: ManualSection) {
    try {
      const { error: err } = await supabase.from('user_manual_sections').update({ is_active: !s.is_active, updated_at: new Date().toISOString() }).eq('id', s.id);
      if (err) throw err;
      await fetchSections();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  }

  async function handleReorder(id: string, direction: 'up' | 'down') {
    const idx = sections.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sections.length) return;
    try {
      const a = sections[idx];
      const b = sections[swapIdx];
      await Promise.all([
        supabase.from('user_manual_sections').update({ sort_order: b.sort_order }).eq('id', a.id),
        supabase.from('user_manual_sections').update({ sort_order: a.sort_order }).eq('id', b.id),
      ]);
      await fetchSections();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  }

  const filtered = filterRole === 'all' ? sections : sections.filter((s) => s.target_role === filterRole || s.target_role === 'all');
  const showModal = creating || editing !== null;

  if (loading) {
    return <PageSkeleton rows={6} cols={4} showStats={false} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('superAdmin.manual.title')}</h1>
          <p className="text-gray-500 mt-1">{t('superAdmin.manual.subtitle')}</p>
        </div>
        <button onClick={openCreate} className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium">
          <Plus className="w-4 h-4" />{t('superAdmin.manual.addSection')}
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
        {roleOptions.map((r) => (
          <button key={r.value} onClick={() => setFilterRole(r.value)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filterRole === r.value ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {r.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4">
        {filtered.map((section, idx) => {
          const roleLabel = roleOptions.find((r) => r.value === section.target_role)?.label || section.target_role;
          const roleColor = roleColors[section.target_role] || roleColors.all;
          return (
            <div key={section.id} className={`bg-white rounded-xl shadow-sm border p-5 transition-all ${section.is_active ? 'border-gray-100' : 'border-red-100 opacity-60'}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <BookOpen className="w-4 h-4 text-teal-600 flex-shrink-0" />
                    <h3 className="text-sm font-bold text-gray-900">{section.title}</h3>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${roleColor}`}>{roleLabel}</span>
                    {!section.is_active && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">{t('common.inactive')}</span>}
                  </div>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">{section.content}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => handleReorder(section.id, 'up')} disabled={idx === 0} className="p-1 rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
                  <button onClick={() => handleReorder(section.id, 'down')} disabled={idx === filtered.length - 1} className="p-1 rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
                  <button onClick={() => toggleActive(section)} className={`p-1.5 rounded-lg transition-colors ${section.is_active ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-50'}`}>{section.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}</button>
                  <button onClick={() => openEdit(section)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-50 hover:text-teal-600 transition-colors"><Edit3 className="w-4 h-4" /></button>
                  <button onClick={() => setDeleteConfirm(section.id)} className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
            <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">{t('superAdmin.manual.noSections')}</p>
          </div>
        )}
      </div>

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-xl"><Trash2 className="w-5 h-5 text-red-600" /></div>
              <h3 className="text-lg font-bold text-gray-900">{t('superAdmin.manual.deleteSection')}</h3>
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
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full my-8">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">{creating ? t('superAdmin.manual.addSection') : t('superAdmin.manual.editSection')}</h2>
              <button onClick={closeModal} className="p-2 rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.title')} *</label>
                <input type="text" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('superAdmin.manual.targetRole')}</label>
                <select value={form.target_role} onChange={(e) => setForm((p) => ({ ...p, target_role: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm bg-white">
                  {roleOptions.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('superAdmin.manual.content')}</label>
                <textarea value={form.content} onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))} rows={10} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm resize-none" />
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
