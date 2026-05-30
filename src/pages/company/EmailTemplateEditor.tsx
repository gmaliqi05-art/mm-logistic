import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Loader2, Eye, EyeOff, CheckCircle2, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';

type Locale = 'sq' | 'de' | 'en';

interface TemplateData {
  id?: string;
  code: string;
  name: string;
  description: string;
  category: string;
  is_active: boolean;
  company_id: string | null;
  preheader_sq: string;
  preheader_de: string;
  preheader_en: string;
  subject_sq: string;
  subject_de: string;
  subject_en: string;
  heading_sq: string;
  heading_de: string;
  heading_en: string;
  intro_sq: string;
  intro_de: string;
  intro_en: string;
  body_html_sq: string;
  body_html_de: string;
  body_html_en: string;
  cta_label_sq: string;
  cta_label_de: string;
  cta_label_en: string;
  cta_url: string;
  variables: string[];
}

const EMPTY: TemplateData = {
  code: '', name: '', description: '', category: 'transactional',
  is_active: true, company_id: null,
  preheader_sq: '', preheader_de: '', preheader_en: '',
  subject_sq: '', subject_de: '', subject_en: '',
  heading_sq: '', heading_de: '', heading_en: '',
  intro_sq: '', intro_de: '', intro_en: '',
  body_html_sq: '', body_html_de: '', body_html_en: '',
  cta_label_sq: '', cta_label_de: '', cta_label_en: '',
  cta_url: '', variables: [],
};

const COMMON_VARS = [
  'invoice_number', 'amount', 'total_formatted', 'due_date', 'issue_date',
  'customer_name', 'company_name', 'iban', 'bic', 'bank_name',
  'days_overdue', 'brand_name', 'app_base_url', 'payment_link',
  'company_phone', 'company_address', 'contact_person',
  'payment_date', 'invoice_url', 'statement_period',
  'open_count', 'total_outstanding', 'oldest_invoice_date',
];

export default function EmailTemplateEditor() {
  const { t } = useTranslation();
  const { code } = useParams<{ code: string }>();
  const isNew = code === 'new';
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [data, setData] = useState<TemplateData>(EMPTY);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locale, setLocale] = useState<Locale>('sq');
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [copiedVar, setCopiedVar] = useState<string | null>(null);

  useEffect(() => {
    if (!isNew && code && profile?.company_id) {
      loadTemplate();
    }
  }, [code, profile?.company_id]);

  async function loadTemplate() {
    setLoading(true);
    // Try company-specific first
    let { data: tpl } = await supabase
      .from('email_templates')
      .select('*')
      .eq('code', code!)
      .eq('company_id', profile!.company_id!)
      .maybeSingle();

    // Fallback to global
    if (!tpl) {
      const { data: globalTpl } = await supabase
        .from('email_templates')
        .select('*')
        .eq('code', code!)
        .is('company_id', null)
        .maybeSingle();
      tpl = globalTpl;
    }

    if (tpl) {
      setData({
        id: tpl.id,
        code: tpl.code,
        name: tpl.name ?? '',
        description: tpl.description ?? '',
        category: tpl.category ?? 'transactional',
        is_active: tpl.is_active ?? true,
        company_id: tpl.company_id,
        preheader_sq: tpl.preheader_sq ?? '',
        preheader_de: tpl.preheader_de ?? '',
        preheader_en: tpl.preheader_en ?? '',
        subject_sq: tpl.subject_sq ?? '',
        subject_de: tpl.subject_de ?? '',
        subject_en: tpl.subject_en ?? '',
        heading_sq: tpl.heading_sq ?? '',
        heading_de: tpl.heading_de ?? '',
        heading_en: tpl.heading_en ?? '',
        intro_sq: tpl.intro_sq ?? '',
        intro_de: tpl.intro_de ?? '',
        intro_en: tpl.intro_en ?? '',
        body_html_sq: tpl.body_html_sq ?? '',
        body_html_de: tpl.body_html_de ?? '',
        body_html_en: tpl.body_html_en ?? '',
        cta_label_sq: tpl.cta_label_sq ?? '',
        cta_label_de: tpl.cta_label_de ?? '',
        cta_label_en: tpl.cta_label_en ?? '',
        cta_url: tpl.cta_url ?? '',
        variables: tpl.variables ?? [],
      });
    }
    setLoading(false);
  }

  function field(key: string): keyof TemplateData {
    return `${key}_${locale}` as keyof TemplateData;
  }

  function setField(key: string, value: string) {
    setData((prev) => ({ ...prev, [field(key)]: value }));
  }

  function getField(key: string): string {
    return (data[field(key)] as string) || '';
  }

  async function handleSave() {
    if (!data.code.trim() || !data.name.trim()) {
      setError(t('company.emailTemplate.codeAndNameRequired') || 'Kodi dhe emri jane te detyrueshem');
      return;
    }
    setSaving(true);
    setError(null);

    const payload: Record<string, unknown> = {
      code: data.code.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
      name: data.name,
      description: data.description,
      category: data.category,
      is_active: data.is_active,
      is_system: false,
      company_id: profile!.company_id,
      preheader_sq: data.preheader_sq,
      preheader_de: data.preheader_de,
      preheader_en: data.preheader_en,
      subject_sq: data.subject_sq,
      subject_de: data.subject_de,
      subject_en: data.subject_en,
      heading_sq: data.heading_sq,
      heading_de: data.heading_de,
      heading_en: data.heading_en,
      intro_sq: data.intro_sq,
      intro_de: data.intro_de,
      intro_en: data.intro_en,
      body_html_sq: data.body_html_sq,
      body_html_de: data.body_html_de,
      body_html_en: data.body_html_en,
      cta_label_sq: data.cta_label_sq,
      cta_label_de: data.cta_label_de,
      cta_label_en: data.cta_label_en,
      cta_url: data.cta_url,
      variables: data.variables,
      updated_at: new Date().toISOString(),
      updated_by: profile!.id,
    };

    let err: any;
    if (data.id && data.company_id === profile!.company_id) {
      ({ error: err } = await supabase
        .from('email_templates')
        .update(payload)
        .eq('id', data.id));
    } else {
      ({ error: err } = await supabase
        .from('email_templates')
        .insert(payload));
    }

    if (err) {
      setError(err.message);
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      if (isNew) {
        navigate(`/company/email/templates/${data.code}`, { replace: true });
      }
    }
    setSaving(false);
  }

  const fetchPreview = useCallback(async () => {
    setPreviewLoading(true);
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email`;
      const resp = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          template_code: data.code || 'invoice_issued',
          company_id: profile?.company_id,
          locale,
          preview: true,
          data: {
            invoice_number: 'INV-2026-0042',
            amount: '1.250,00 EUR',
            total_formatted: '1.250,00 EUR',
            due_date: '15.06.2026',
            issue_date: '01.06.2026',
            customer_name: 'Agim Bytyqi',
            company_name: 'Kompania Juaj sh.p.k.',
            iban: 'DE89 3704 0044 0532 0130 00',
            bic: 'COBADEFFXXX',
            bank_name: 'Commerzbank',
            days_overdue: '7',
          },
        }),
      });
      if (resp.ok) {
        const result = await resp.json();
        setPreviewHtml(result.html || '');
      }
    } catch { /* ignore */ }
    setPreviewLoading(false);
  }, [data.code, locale, profile?.company_id]);

  useEffect(() => {
    if (showPreview && data.code) {
      const timer = setTimeout(fetchPreview, 600);
      return () => clearTimeout(timer);
    }
  }, [showPreview, fetchPreview]);

  function copyVariable(v: string) {
    navigator.clipboard.writeText(`{{${v}}}`);
    setCopiedVar(v);
    setTimeout(() => setCopiedVar(null), 1200);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
      </div>
    );
  }

  const isReadOnly = !isNew && data.company_id !== profile?.company_id;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => navigate('/company/email/templates')}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="w-4 h-4" />{t('common.back')}</button>
        <div className="flex items-center gap-2">
          {saved && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
              <CheckCircle2 className="w-3.5 h-3.5" />{t('common.ruajtur')}</span>
          )}
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-gray-200 text-sm font-medium hover:bg-gray-50"
          >
            {showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {showPreview ? 'Fshih preview' : 'Preview'}
          </button>
          {!isReadOnly && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-bold hover:bg-teal-700 disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Ruaj
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {error}
        </div>
      )}

      {isReadOnly && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">{t('common.kyEshteTemplateGlobalPerTa')}</div>
      )}

      <div className={`grid gap-5 ${showPreview ? 'lg:grid-cols-2' : 'lg:grid-cols-1'}`}>
        {/* Editor */}
        <div className="space-y-5">
          {/* Basic info */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">{t('common.informacionetBaze')}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('common.name')}</label>
                <input
                  type="text"
                  value={data.name}
                  onChange={(e) => setData((d) => ({ ...d, name: e.target.value }))}
                  disabled={isReadOnly}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-gray-50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Kodi</label>
                <input
                  type="text"
                  value={data.code}
                  onChange={(e) => setData((d) => ({ ...d, code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') }))}
                  disabled={!isNew}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-gray-50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('common.kategoria')}</label>
                <select
                  value={data.category}
                  onChange={(e) => setData((d) => ({ ...d, category: e.target.value }))}
                  disabled={isReadOnly}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-gray-50"
                >
                  <option value="transactional">Transaksionale</option>
                  <option value="marketing">Marketing</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('common.description')}</label>
                <input
                  type="text"
                  value={data.description}
                  onChange={(e) => setData((d) => ({ ...d, description: e.target.value }))}
                  disabled={isReadOnly}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-gray-50"
                />
              </div>
            </div>
          </div>

          {/* Locale tabs + content */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">{t('common.content')}</h3>
              <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                {(['sq', 'de', 'en'] as Locale[]).map((loc) => (
                  <button
                    key={loc}
                    onClick={() => setLocale(loc)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      locale === loc
                        ? 'bg-teal-600 text-white'
                        : 'bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {loc.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Subject (tema)</label>
                <input
                  type="text"
                  value={getField('subject')}
                  onChange={(e) => setField('subject', e.target.value)}
                  disabled={isReadOnly}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-gray-50"
                  placeholder="p.sh. Fatura {{invoice_number}} - {{amount}}"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Preheader (tekst paraprak)</label>
                <input
                  type="text"
                  value={getField('preheader')}
                  onChange={(e) => setField('preheader', e.target.value)}
                  disabled={isReadOnly}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-gray-50"
                  placeholder="Tekst qe shfaqet ne inbox"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Heading (titulli)</label>
                <input
                  type="text"
                  value={getField('heading')}
                  onChange={(e) => setField('heading', e.target.value)}
                  disabled={isReadOnly}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-gray-50"
                  placeholder="Titulli kryesor"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Intro (hyrja)</label>
                <textarea
                  rows={3}
                  value={getField('intro')}
                  onChange={(e) => setField('intro', e.target.value)}
                  disabled={isReadOnly}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none disabled:bg-gray-50"
                  placeholder="Paragraf hyrjes (pranon HTML)"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Body HTML (trupi kryesor)</label>
                <textarea
                  rows={8}
                  value={getField('body_html')}
                  onChange={(e) => setField('body_html', e.target.value)}
                  disabled={isReadOnly}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500 resize-y disabled:bg-gray-50"
                  placeholder="<p>{t('common.permbajtjaKryesoreEEmailIt')}</p>"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">CTA Label (butoni)</label>
                  <input
                    type="text"
                    value={getField('cta_label')}
                    onChange={(e) => setField('cta_label', e.target.value)}
                    disabled={isReadOnly}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-gray-50"
                    placeholder="p.sh. Shiko Faturen"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">CTA URL</label>
                  <input
                    type="text"
                    value={data.cta_url}
                    onChange={(e) => setData((d) => ({ ...d, cta_url: e.target.value }))}
                    disabled={isReadOnly}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-gray-50"
                    placeholder="{{app_base_url}}/invoices/{{invoice_number}}"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Variables */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">Variablat e disponueshme</h3>
            <p className="text-xs text-gray-500">Kliko per te kopjuar ne clipboard (formato: {'{{variable}}'})</p>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_VARS.map((v) => (
                <button
                  key={v}
                  onClick={() => copyVariable(v)}
                  className={`px-2.5 py-1 rounded-md text-xs font-mono transition-all ${
                    copiedVar === v
                      ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300'
                      : 'bg-gray-100 text-gray-700 hover:bg-teal-50 hover:text-teal-700'
                  }`}
                >
                  {copiedVar === v ? 'Kopjuar!' : `{{${v}}}`}
                </button>
              ))}
            </div>
          </div>

          {/* Active toggle */}
          {!isReadOnly && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={data.is_active}
                  onChange={(e) => setData((d) => ({ ...d, is_active: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                />
                <span className="text-sm font-medium text-gray-700">{t('common.templateAktivDergohetKurThirret')}</span>
              </label>
            </div>
          )}
        </div>

        {/* Preview pane */}
        {showPreview && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden sticky top-4">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-600 uppercase">Preview</span>
                <button
                  onClick={fetchPreview}
                  className="text-xs text-teal-600 hover:text-teal-700 font-medium"
                >
                  Rifresko
                </button>
              </div>
            </div>
            <div className="h-[600px] overflow-auto">
              {previewLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-6 h-6 text-teal-600 animate-spin" />
                </div>
              ) : previewHtml ? (
                <iframe
                  srcDoc={previewHtml}
                  className="w-full h-full border-0"
                  title="Email Preview"
                  sandbox="allow-same-origin"
                />
              ) : (
                <div className="flex items-center justify-center h-full text-sm text-gray-400">
                  Kliko "Rifresko" per preview
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
