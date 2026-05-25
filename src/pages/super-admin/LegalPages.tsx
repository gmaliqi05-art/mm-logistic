import { useState, useEffect } from 'react';
import { FileText, Plus, CreditCard as Edit3, Save, X, Loader2, AlertTriangle, Check, Globe as Globe2, Trash2, ExternalLink } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PageSkeleton } from '../../components/ui/Skeleton';
interface LegalDocument {
  id: string;
  slug: string;
  language: string;
  title: string;
  subtitle: string;
  content_json: Section[];
  last_updated: string;
  version: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface Section {
  title: string;
  content: string;
}

const DOCUMENT_SLUGS = [
  { slug: 'impressum', label: 'Impressum' },
  { slug: 'terms', label: 'Terms of Service' },
  { slug: 'privacy', label: 'Privacy Policy' },
  { slug: 'cookies', label: 'Cookie Policy' },
  { slug: 'dpa', label: 'Data Processing Agreement' },
  { slug: 'subprocessors', label: 'Subprocessors' },
  { slug: 'aup', label: 'Acceptable Use Policy' },
  { slug: 'refund', label: 'Refund Policy' },
];

const LANGUAGES = [
  { code: 'sq', label: 'Shqip' },
  { code: 'en', label: 'English' },
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Francais' },
];

export default function LegalPages() {
  const [documents, setDocuments] = useState<LegalDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [selectedSlug, setSelectedSlug] = useState('impressum');
  const [selectedLang, setSelectedLang] = useState('sq');
  const [editing, setEditing] = useState(false);

  const [editTitle, setEditTitle] = useState('');
  const [editSubtitle, setEditSubtitle] = useState('');
  const [editVersion, setEditVersion] = useState('');
  const [editLastUpdated, setEditLastUpdated] = useState('');
  const [editSections, setEditSections] = useState<Section[]>([]);

  useEffect(() => {
    fetchDocuments();
  }, []);

  async function fetchDocuments() {
    try {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('legal_documents')
        .select('*')
        .order('slug')
        .order('language');
      if (err) throw err;
      setDocuments(data ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error loading documents');
    } finally {
      setLoading(false);
    }
  }

  const currentDoc = documents.find(
    (d) => d.slug === selectedSlug && d.language === selectedLang
  );

  function openEdit() {
    if (currentDoc) {
      setEditTitle(currentDoc.title);
      setEditSubtitle(currentDoc.subtitle);
      setEditVersion(currentDoc.version);
      setEditLastUpdated(currentDoc.last_updated);
      setEditSections(Array.isArray(currentDoc.content_json) ? currentDoc.content_json : []);
    } else {
      const slugMeta = DOCUMENT_SLUGS.find((s) => s.slug === selectedSlug);
      setEditTitle(slugMeta?.label ?? '');
      setEditSubtitle('');
      setEditVersion('1.0');
      setEditLastUpdated(new Date().toLocaleDateString());
      setEditSections([{ title: '', content: '' }]);
    }
    setEditing(true);
  }

  function addSection() {
    setEditSections([...editSections, { title: '', content: '' }]);
  }

  function removeSection(idx: number) {
    setEditSections(editSections.filter((_, i) => i !== idx));
  }

  function updateSection(idx: number, field: 'title' | 'content', value: string) {
    const copy = editSections.slice();
    copy[idx] = { ...copy[idx], [field]: value };
    setEditSections(copy);
  }

  async function handleSave() {
    try {
      setSaving(true);
      setError(null);

      const payload = {
        slug: selectedSlug,
        language: selectedLang,
        title: editTitle.trim(),
        subtitle: editSubtitle.trim(),
        content_json: editSections.filter((s) => s.title.trim() || s.content.trim()),
        last_updated: editLastUpdated.trim(),
        version: editVersion.trim(),
        is_active: true,
        updated_at: new Date().toISOString(),
      };

      if (currentDoc) {
        const { error: err } = await supabase
          .from('legal_documents')
          .update(payload)
          .eq('id', currentDoc.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase
          .from('legal_documents')
          .insert(payload);
        if (err) throw err;
      }

      setEditing(false);
      setSuccess('Dokumenti u ruajt me sukses');
      setTimeout(() => setSuccess(null), 3000);
      await fetchDocuments();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error saving');
    } finally {
      setSaving(false);
    }
  }

  const docsForSlug = documents.filter((d) => d.slug === selectedSlug);
  const languagesWithContent = docsForSlug.map((d) => d.language);

  if (loading) {
    return (
      <PageSkeleton rows={6} cols={4} showStats={false} />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileText className="w-6 h-6 text-teal-600" />
            Faqe Ligjore
          </h1>
          <p className="text-gray-500 mt-1 text-sm">Menaxho dokumentet ligjore te platformes</p>
        </div>
        <a
          href="/legal"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium text-sm"
        >
          <ExternalLink className="w-4 h-4" />
          Shiko faqet publike
        </a>
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

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
          <Check className="w-5 h-5 text-green-600 flex-shrink-0" />
          <p className="text-green-800 text-sm">{success}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Document selector sidebar */}
        <div className="lg:col-span-1 space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1 mb-2">Dokumentet</p>
          {DOCUMENT_SLUGS.map((doc) => {
            const hasContent = documents.some((d) => d.slug === doc.slug);
            return (
              <button
                key={doc.slug}
                onClick={() => { setSelectedSlug(doc.slug); setEditing(false); }}
                className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-all flex items-center justify-between ${
                  selectedSlug === doc.slug
                    ? 'bg-teal-50 text-teal-800 border border-teal-200'
                    : 'text-gray-700 hover:bg-gray-50 border border-transparent'
                }`}
              >
                <span className="truncate">{doc.label}</span>
                {hasContent && (
                  <Check className="w-3.5 h-3.5 text-teal-600 flex-shrink-0" />
                )}
              </button>
            );
          })}
        </div>

        {/* Content area */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
            {/* Language tabs */}
            <div className="flex items-center gap-1 px-5 pt-5 pb-3 border-b border-gray-100">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => { setSelectedLang(lang.code); setEditing(false); }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                    selectedLang === lang.code
                      ? 'bg-teal-100 text-teal-800'
                      : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  <Globe2 className="w-3.5 h-3.5" />
                  {lang.label}
                  {languagesWithContent.includes(lang.code) && (
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                  )}
                </button>
              ))}
            </div>

            {!editing ? (
              <div className="p-5">
                {currentDoc ? (
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h2 className="text-xl font-bold text-gray-900">{currentDoc.title}</h2>
                        {currentDoc.subtitle && (
                          <p className="text-sm text-gray-500 mt-1">{currentDoc.subtitle}</p>
                        )}
                        <div className="flex items-center gap-3 mt-2">
                          <span className="text-xs text-gray-400">v{currentDoc.version}</span>
                          {currentDoc.last_updated && (
                            <span className="text-xs text-gray-400">Perditesuar: {currentDoc.last_updated}</span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={openEdit}
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-teal-700 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors"
                      >
                        <Edit3 className="w-4 h-4" />
                        Edito
                      </button>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {(currentDoc.content_json as Section[]).map((section, idx) => (
                        <div key={idx} className="py-3">
                          <h3 className="text-sm font-semibold text-gray-800">{section.title}</h3>
                          <p className="text-sm text-gray-600 mt-1 whitespace-pre-line line-clamp-4">{section.content}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500 mb-4">
                      Nuk ka permbajtje per kete dokument ne gjuhen e zgjedhur
                    </p>
                    <button
                      onClick={openEdit}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium"
                    >
                      <Plus className="w-4 h-4" />
                      Krijo Dokument
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-5 space-y-5">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Titulli</label>
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Nentitulli</label>
                    <input
                      type="text"
                      value={editSubtitle}
                      onChange={(e) => setEditSubtitle(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                    />
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Versioni</label>
                    <input
                      type="text"
                      value={editVersion}
                      onChange={(e) => setEditVersion(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                      placeholder="1.0"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Perditesuar me</label>
                    <input
                      type="text"
                      value={editLastUpdated}
                      onChange={(e) => setEditLastUpdated(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                      placeholder="17.05.2026"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-sm font-semibold text-gray-700">Seksionet</label>
                    <button
                      onClick={addSection}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-teal-700 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      Shto Seksion
                    </button>
                  </div>
                  <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
                    {editSections.map((section, idx) => (
                      <div key={idx} className="border border-gray-100 rounded-xl p-4 bg-gray-50/50 space-y-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-gray-400 w-6">#{idx + 1}</span>
                          <input
                            type="text"
                            value={section.title}
                            onChange={(e) => updateSection(idx, 'title', e.target.value)}
                            placeholder="Titulli i seksionit"
                            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm font-medium"
                          />
                          <button
                            onClick={() => removeSection(idx)}
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <textarea
                          value={section.content}
                          onChange={(e) => updateSection(idx, 'content', e.target.value)}
                          rows={4}
                          placeholder="Permbajtja e seksionit..."
                          className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm resize-none"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-4 border-t border-gray-100">
                  <button
                    onClick={() => setEditing(false)}
                    className="px-5 py-2.5 rounded-lg border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition-colors text-sm"
                  >
                    Anulo
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving || !editTitle.trim()}
                    className="inline-flex items-center gap-2 px-6 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium disabled:opacity-50 text-sm"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {saving ? 'Duke ruajtur...' : 'Ruaj'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
