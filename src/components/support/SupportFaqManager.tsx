import { useState, useEffect } from 'react';
import {
  Search,
  Plus,
  Loader2,
  HelpCircle,
  Edit3,
  Trash2,
  X,
  Save,
  Tag,
  ChevronDown,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTranslation } from '../../i18n';
import type { FaqEntry } from '../../utils/faqMatcher';

export default function SupportFaqManager() {
  const { t } = useTranslation();
  const [faqs, setFaqs] = useState<FaqEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [categories, setCategories] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingFaq, setEditingFaq] = useState<FaqEntry | null>(null);
  const [saving, setSaving] = useState(false);
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null);

  const [form, setForm] = useState({
    category: '',
    question: '',
    answer: '',
    keywords: '',
    priority: 5,
  });

  useEffect(() => {
    fetchFaqs();
  }, []);

  async function fetchFaqs() {
    setLoading(true);
    const { data } = await supabase
      .from('support_faqs')
      .select('*')
      .order('category')
      .order('priority', { ascending: false });

    const items = (data ?? []) as FaqEntry[];
    setFaqs(items);
    const cats = [...new Set(items.map((f) => f.category))].filter(Boolean);
    setCategories(cats);
    setLoading(false);
  }

  function openCreate() {
    setEditingFaq(null);
    setForm({ category: '', question: '', answer: '', keywords: '', priority: 5 });
    setShowForm(true);
  }

  function openEdit(faq: FaqEntry) {
    setEditingFaq(faq);
    setForm({
      category: faq.category,
      question: faq.question,
      answer: faq.answer,
      keywords: faq.keywords.join(', '),
      priority: faq.priority,
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.question.trim() || !form.answer.trim()) return;
    setSaving(true);

    const keywordsArr = form.keywords
      .split(',')
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean);

    const payload = {
      category: form.category.trim(),
      question: form.question.trim(),
      answer: form.answer.trim(),
      keywords: keywordsArr,
      priority: form.priority,
      updated_at: new Date().toISOString(),
    };

    if (editingFaq) {
      await supabase.from('support_faqs').update(payload).eq('id', editingFaq.id);
    } else {
      await supabase.from('support_faqs').insert(payload);
    }

    setShowForm(false);
    setSaving(false);
    fetchFaqs();
  }

  async function handleDelete(id: string) {
    await supabase.from('support_faqs').update({ is_active: false }).eq('id', id);
    fetchFaqs();
  }

  const filteredFaqs = faqs.filter((f) => {
    const matchesCat = categoryFilter === 'all' || f.category === categoryFilter;
    const matchesSearch =
      !search ||
      f.question.toLowerCase().includes(search.toLowerCase()) ||
      f.answer.toLowerCase().includes(search.toLowerCase()) ||
      f.keywords.some((k) => k.includes(search.toLowerCase()));
    return matchesCat && matchesSearch;
  });

  const groupedFaqs: Record<string, FaqEntry[]> = {};
  for (const faq of filteredFaqs) {
    const cat = faq.category || 'Pa Kategori';
    if (!groupedFaqs[cat]) groupedFaqs[cat] = [];
    groupedFaqs[cat].push(faq);
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder={t('common.search') + '...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white"
        >
          <option value="all">{t('common.all')}</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          {t('common.add')} FAQ
        </button>
      </div>

      <div className="text-xs text-gray-400 mb-4">
        {filteredFaqs.length} FAQ ({faqs.length} {t('common.total')})
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
        </div>
      ) : (
        Object.entries(groupedFaqs).map(([cat, items]) => (
          <div key={cat} className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Tag className="w-4 h-4 text-teal-600" />
              <h3 className="text-sm font-semibold text-gray-700">{cat}</h3>
              <span className="text-xs text-gray-400">({items.length})</span>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
              {items.map((faq) => (
                <div key={faq.id}>
                  <button
                    onClick={() => setExpandedFaq(expandedFaq === faq.id ? null : faq.id)}
                    className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors text-left"
                  >
                    <HelpCircle className="w-4 h-4 text-teal-500 flex-shrink-0" />
                    <p className="text-sm text-gray-800 flex-1 truncate">{faq.question}</p>
                    <span className="text-xs text-gray-400 flex-shrink-0 mr-2">P{faq.priority}</span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${expandedFaq === faq.id ? 'rotate-180' : ''}`} />
                  </button>
                  {expandedFaq === faq.id && (
                    <div className="px-4 pb-3 bg-gray-50">
                      <p className="text-sm text-gray-600 leading-relaxed mb-2">{faq.answer}</p>
                      <div className="flex flex-wrap gap-1 mb-3">
                        {faq.keywords.map((k, i) => (
                          <span key={i} className="text-xs bg-teal-50 text-teal-600 px-2 py-0.5 rounded-full">{k}</span>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => openEdit(faq)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                        >
                          <Edit3 className="w-3 h-3" />
                          {t('common.edit')}
                        </button>
                        <button
                          onClick={() => handleDelete(faq.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                          {t('common.delete')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowForm(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingFaq ? t('common.edit') + ' FAQ' : t('common.add') + ' FAQ'}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.type')}</label>
                <input
                  type="text"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder={t('common.egAccountCompanyDepot')}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  list="faq-categories"
                />
                <datalist id="faq-categories">
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('support.subject')} *</label>
                <input
                  type="text"
                  value={form.question}
                  onChange={(e) => setForm({ ...form, question: e.target.value })}
                  placeholder={t('support.subjectPlaceholder')}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('support.message')} *</label>
                <textarea
                  value={form.answer}
                  onChange={(e) => setForm({ ...form, answer: e.target.value })}
                  placeholder={t('support.messagePlaceholder')}
                  rows={4}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Fjale kyce (te ndara me presje)
                </label>
                <input
                  type="text"
                  value={form.keywords}
                  onChange={(e) => setForm({ ...form, keywords: e.target.value })}
                  placeholder="fjalekalim, ndrysho, hyrje, login..."
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t('common.priority')} (0-10)
                </label>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) || 0 })}
                  className="w-24 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 p-6 border-t border-gray-100">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.question.trim() || !form.answer.trim()}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-teal-600 rounded-xl hover:bg-teal-700 transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
