import { useState, useEffect, useCallback } from 'react';
import { Plus, AlertTriangle, X, Loader2, CreditCard as Edit3, Trash2, Tags, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { PageSkeleton } from '../../components/ui/Skeleton';
import { useTranslation } from '../../i18n';
import type { AccExpenseCategory } from '../../types/accounting';

type CategoryType = 'income' | 'expense' | 'other';

interface CategoryForm {
  name: string;
  description: string;
  category_type: CategoryType;
}

const emptyForm: CategoryForm = {
  name: '',
  description: '',
  category_type: 'expense',
};

export default function ExpenseCategories() {
  const { profile } = useAuth();
  const { t } = useTranslation();

  const [categories, setCategories] = useState<AccExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CategoryForm>(emptyForm);

  useEffect(() => {
    if (profile?.company_id) fetchCategories();
  }, [profile?.company_id]);

  const fetchCategories = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error: err } = await supabase
        .from('acc_expense_categories')
        .select('*')
        .eq('company_id', profile!.company_id!)
        .order('name', { ascending: true });
      if (err) throw err;
      setCategories(data ?? []);
    } catch (err: any) {
      setError(err.message || t('common.errorLoading'));
    } finally {
      setLoading(false);
    }
  }, [profile?.company_id]);

  const filteredCategories = categories.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q);
  });

  const getTypeBadge = (type: CategoryType) => {
    const styles: Record<CategoryType, { bg: string; label: string }> = {
      income: { bg: 'bg-green-100 text-green-700', label: t('accounting.expenseCategories.income') },
      expense: { bg: 'bg-red-100 text-red-700', label: t('accounting.expenseCategories.expense') },
      other: { bg: 'bg-gray-100 text-gray-700', label: t('accounting.expenseCategories.other') },
    };
    const s = styles[type];
    return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${s.bg}`}>{s.label}</span>;
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (cat: AccExpenseCategory) => {
    setEditingId(cat.id);
    setForm({
      name: cat.name,
      description: cat.description || '',
      category_type: cat.category_type,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setError(t('accounting.expenseCategories.nameRequired'));
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const payload = {
        company_id: profile!.company_id!,
        name: form.name.trim(),
        description: form.description.trim(),
        category_type: form.category_type,
      };

      if (editingId) {
        const { error: err } = await supabase
          .from('acc_expense_categories')
          .update(payload)
          .eq('id', editingId);
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from('acc_expense_categories').insert(payload);
        if (err) throw err;
      }

      setShowModal(false);
      setEditingId(null);
      setForm(emptyForm);
      await fetchCategories();
    } catch (err: any) {
      setError(err.message || t('common.errorSaving'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(t('accounting.expenseCategories.confirmDelete'))) return;
    try {
      setError(null);
      const { error: err } = await supabase
        .from('acc_expense_categories')
        .delete()
        .eq('id', id);
      if (err) throw err;
      await fetchCategories();
    } catch (err: any) {
      setError(err.message || t('common.error'));
    }
  };

  if (loading) {
    return <PageSkeleton showStats={false} rows={6} cols={3} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('accounting.expenseCategories.title')}</h1>
          <p className="text-gray-500 mt-1">{t('accounting.expenseCategories.subtitle')}</p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium text-sm"
        >
          <Plus className="w-4 h-4" />
          {t('accounting.expenseCategories.addCategory')}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-red-700 text-sm">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('accounting.expenseCategories.searchPlaceholder')}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        {filteredCategories.length === 0 ? (
          <div className="py-16 text-center">
            <Tags className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p className="text-gray-500 font-medium">{t('accounting.expenseCategories.noCategories')}</p>
            <p className="text-gray-400 text-sm mt-1">{t('accounting.expenseCategories.noCategoriesHint')}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filteredCategories.map((cat) => (
              <div key={cat.id} className="px-6 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors">
                <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                  <Tags className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-900">{cat.name}</p>
                    {getTypeBadge(cat.category_type)}
                  </div>
                  {cat.description && (
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{cat.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => openEdit(cat)}
                    className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(cat.id)}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingId ? t('accounting.expenseCategories.editCategory') : t('accounting.expenseCategories.newCategory')}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.name')} *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                  placeholder={t('accounting.expenseCategories.namePlaceholder')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.description')}</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm resize-none"
                  placeholder={t('accounting.expenseCategories.descriptionPlaceholder')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.type')}</label>
                <select
                  value={form.category_type}
                  onChange={(e) => setForm({ ...form, category_type: e.target.value as CategoryType })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                >
                  <option value="income">{t('accounting.expenseCategories.income')}</option>
                  <option value="expense">{t('accounting.expenseCategories.expense')}</option>
                  <option value="other">{t('accounting.expenseCategories.other')}</option>
                </select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-100">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingId ? t('common.saveChanges') : t('accounting.expenseCategories.addCategory')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
