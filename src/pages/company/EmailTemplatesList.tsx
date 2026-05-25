import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Loader2, FileText, Copy, ToggleLeft, ToggleRight, Send, Eye, AlertTriangle, Search, Globe, Info, Receipt } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';

interface TemplateRow {
  id: string;
  code: string;
  name: string;
  description: string;
  category: string;
  audience: string;
  is_system: boolean;
  is_active: boolean;
  company_id: string | null;
  updated_at: string;
  subject_sq: string;
  subject_de: string;
  subject_en: string;
}

const INVOICE_CODES = [
  'invoice_issued',
  'invoice_paid',
  'invoice_overdue',
  'invoice_final_reminder',
  'payment_received_thank_you',
  'statement_monthly',
];

export default function EmailTemplatesList() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'invoice' | 'custom'>('all');
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.company_id) fetchTemplates();
  }, [profile?.company_id]);

  async function fetchTemplates() {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('email_templates')
      .select('id, code, name, description, category, audience, is_system, is_active, company_id, updated_at, subject_sq, subject_de, subject_en')
      .or(`company_id.is.null,company_id.eq.${profile!.company_id}`)
      .in('audience', ['company', 'all'])
      .order('category')
      .order('name');

    if (err) {
      setError(err.message);
    } else {
      setTemplates((data ?? []) as TemplateRow[]);
    }
    setLoading(false);
  }

  async function handleToggleActive(tpl: TemplateRow) {
    if (!tpl.company_id) return;
    await supabase
      .from('email_templates')
      .update({ is_active: !tpl.is_active, updated_at: new Date().toISOString() })
      .eq('id', tpl.id);
    await fetchTemplates();
  }

  async function handleDuplicate(tpl: TemplateRow) {
    const { data: fullTpl } = await supabase
      .from('email_templates')
      .select('*')
      .eq('id', tpl.id)
      .maybeSingle();

    if (!fullTpl) return;

    const newCode = tpl.company_id
      ? `${tpl.code}_copy`
      : `${tpl.code}_custom`;

    const { id: _id, created_at: _ca, updated_at: _ua, ...rest } = fullTpl as any;

    await supabase.from('email_templates').insert({
      ...rest,
      code: newCode,
      name: `${tpl.name} (kopje)`,
      company_id: profile!.company_id,
      is_system: false,
      is_active: true,
      audience: 'company',
    });

    await fetchTemplates();
    navigate(`/company/email/templates/${newCode}`);
  }

  async function handleTestSend(tpl: TemplateRow) {
    if (!testEmail.trim()) return;
    setTestSending(true);
    setTestResult(null);
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email`;
      const resp = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          template_code: tpl.code,
          to: [testEmail.trim()],
          company_id: profile!.company_id,
          locale: 'sq',
          test: true,
          data: {
            invoice_number: 'INV-2026-TEST',
            amount: '1.250,00 EUR',
            total_formatted: '1.250,00 EUR',
            due_date: '15.06.2026',
            issue_date: '01.06.2026',
            customer_name: 'Test Klient',
            company_name: 'Kompania Juaj',
            iban: 'DE89 3704 0044 0532 0130 00',
            bic: 'COBADEFFXXX',
            bank_name: 'Commerzbank',
            days_overdue: '14',
            open_count: '3',
            total_outstanding: '4.500,00 EUR',
            statement_period: 'Maj 2026',
            oldest_invoice_date: '01.04.2026',
            payment_date: '18.05.2026',
          },
        }),
      });
      if (resp.ok) {
        setTestResult('success');
      } else {
        const err = await resp.json().catch(() => ({}));
        setTestResult(err.error || 'Deshtoi');
      }
    } catch {
      setTestResult('Gabim rrjeti');
    } finally {
      setTestSending(false);
    }
  }

  const invoiceTemplates = templates.filter(t => INVOICE_CODES.includes(t.code) || (t.company_id && INVOICE_CODES.some(ic => t.code.startsWith(ic))));
  const customTemplates = templates.filter(t => t.company_id && !INVOICE_CODES.includes(t.code) && !INVOICE_CODES.some(ic => t.code.startsWith(ic)));
  const otherGlobalTemplates = templates.filter(t => !t.company_id && !INVOICE_CODES.includes(t.code));

  const getFiltered = () => {
    let list: TemplateRow[];
    if (filter === 'invoice') list = invoiceTemplates;
    else if (filter === 'custom') list = customTemplates;
    else list = templates;

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t => `${t.name} ${t.code} ${t.description}`.toLowerCase().includes(q));
    }
    return list;
  };

  const filtered = getFiltered();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      )}

      <div className="p-4 bg-teal-50 border border-teal-200 rounded-xl">
        <div className="flex gap-3">
          <Info className="w-5 h-5 text-teal-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-teal-900">Si funksionojne template-t e email-eve</p>
            <p className="text-xs text-teal-700 mt-1">
              Template-t e faturimit perdoren per te derguar automatikisht ose manualisht email klienteve tuaj kur krijoni/dergoni fatura,
              rikujtesa pagese, ose pasqyra mujore. Mund te personalizoni cdo template duke bere nje kopje, ose te krijoni te reja nga zero.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-64 pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder={t('common.searchPlaceholder')}
            />
          </div>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <option value="all">Te gjitha</option>
            <option value="invoice">Per faturat</option>
            <option value="custom">Te personalizuara</option>
          </select>
        </div>
        <button
          onClick={() => navigate('/company/email/templates/new')}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium text-sm"
        >
          <Plus className="w-4 h-4" />
          Krijo Template
        </button>
      </div>

      {filter === 'all' && !search.trim() ? (
        <div className="space-y-8">
          {invoiceTemplates.length > 0 && (
            <TemplateSection
              title="Template per faturat"
              icon={<Receipt className="w-4 h-4 text-teal-600" />}
              templates={invoiceTemplates}
              profile={profile}
              navigate={navigate}
              onToggle={handleToggleActive}
              onDuplicate={handleDuplicate}
              testingId={testingId}
              setTestingId={setTestingId}
              testEmail={testEmail}
              setTestEmail={setTestEmail}
              testSending={testSending}
              testResult={testResult}
              onTestSend={handleTestSend}
              setTestResult={setTestResult}
            />
          )}
          {customTemplates.length > 0 && (
            <TemplateSection
              title="Template te personalizuara"
              icon={<FileText className="w-4 h-4 text-amber-600" />}
              templates={customTemplates}
              profile={profile}
              navigate={navigate}
              onToggle={handleToggleActive}
              onDuplicate={handleDuplicate}
              testingId={testingId}
              setTestingId={setTestingId}
              testEmail={testEmail}
              setTestEmail={setTestEmail}
              testSending={testSending}
              testResult={testResult}
              onTestSend={handleTestSend}
              setTestResult={setTestResult}
            />
          )}
          {otherGlobalTemplates.length > 0 && (
            <TemplateSection
              title="Template te tjera te sistemit"
              icon={<Globe className="w-4 h-4 text-slate-500" />}
              templates={otherGlobalTemplates}
              profile={profile}
              navigate={navigate}
              onToggle={handleToggleActive}
              onDuplicate={handleDuplicate}
              testingId={testingId}
              setTestingId={setTestingId}
              testEmail={testEmail}
              setTestEmail={setTestEmail}
              testSending={testSending}
              testResult={testResult}
              onTestSend={handleTestSend}
              setTestResult={setTestResult}
            />
          )}
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <FileText className="w-10 h-10 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">Nuk u gjeten template</p>
            </div>
          ) : (
            filtered.map((tpl) => (
              <TemplateCard
                key={tpl.id}
                tpl={tpl}
                profile={profile}
                navigate={navigate}
                onToggle={handleToggleActive}
                onDuplicate={handleDuplicate}
                testingId={testingId}
                setTestingId={setTestingId}
                testEmail={testEmail}
                setTestEmail={setTestEmail}
                testSending={testSending}
                testResult={testResult}
                onTestSend={handleTestSend}
                setTestResult={setTestResult}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  templates: TemplateRow[];
  profile: any;
  navigate: any;
  onToggle: (tpl: TemplateRow) => void;
  onDuplicate: (tpl: TemplateRow) => void;
  testingId: string | null;
  setTestingId: (id: string | null) => void;
  testEmail: string;
  setTestEmail: (e: string) => void;
  testSending: boolean;
  testResult: string | null;
  onTestSend: (tpl: TemplateRow) => void;
  setTestResult: (r: string | null) => void;
}

function TemplateSection({ title, icon, templates, ...rest }: SectionProps) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{templates.length}</span>
      </div>
      <div className="grid gap-3">
        {templates.map((tpl) => (
          <TemplateCard key={tpl.id} tpl={tpl} {...rest} />
        ))}
      </div>
    </div>
  );
}

interface CardProps {
  tpl: TemplateRow;
  profile: any;
  navigate: any;
  onToggle: (tpl: TemplateRow) => void;
  onDuplicate: (tpl: TemplateRow) => void;
  testingId: string | null;
  setTestingId: (id: string | null) => void;
  testEmail: string;
  setTestEmail: (e: string) => void;
  testSending: boolean;
  testResult: string | null;
  onTestSend: (tpl: TemplateRow) => void;
  setTestResult: (r: string | null) => void;
}

function TemplateCard({ tpl, profile, navigate, onToggle, onDuplicate, testingId, setTestingId, testEmail, setTestEmail, testSending, testResult, onTestSend, setTestResult }: CardProps) {
  const { t } = useTranslation();
  const isOwn = !!tpl.company_id;

  return (
    <div
      className={`bg-white rounded-xl border p-4 transition-all hover:shadow-sm ${
        !tpl.is_active ? 'opacity-60 border-gray-200' : 'border-gray-200'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-gray-900">{tpl.name}</h3>
            {isOwn ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-teal-50 text-teal-700 border border-teal-200">
                Kompania juaj
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-50 text-slate-600 border border-slate-200">
                <Globe className="w-3 h-3" /> Globale
              </span>
            )}
            {!tpl.is_active && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-red-50 text-red-600 border border-red-200">
                Joaktive
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1 line-clamp-1">
            {tpl.description || tpl.subject_sq || tpl.code}
          </p>
          <p className="text-[10px] text-gray-400 mt-1 font-mono">{tpl.code}</p>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {isOwn && (
            <button
              onClick={() => navigate(`/company/email/templates/${tpl.code}`)}
              className="p-2 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
              title="Edito"
            >
              <Eye className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => onDuplicate(tpl)}
            className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
            title={isOwn ? 'Dupliko' : 'Personalizo per kompanine'}
          >
            <Copy className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              setTestingId(testingId === tpl.id ? null : tpl.id);
              setTestResult(null);
              setTestEmail(profile?.email || '');
            }}
            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="Dergo test"
          >
            <Send className="w-4 h-4" />
          </button>
          {isOwn && (
            <button
              onClick={() => onToggle(tpl)}
              className={`p-2 rounded-lg transition-colors ${
                tpl.is_active
                  ? 'text-teal-500 hover:text-red-600 hover:bg-red-50'
                  : 'text-gray-400 hover:text-teal-600 hover:bg-teal-50'
              }`}
              title={tpl.is_active ? 'Deaktivizo' : 'Aktivizo'}
            >
              {tpl.is_active ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {testingId === tpl.id && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="flex items-center gap-2">
            <input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder={t('common.emailForTest')}
            />
            <button
              onClick={() => onTestSend(tpl)}
              disabled={testSending || !testEmail.trim()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {testSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Dergo Test
            </button>
          </div>
          {testResult && (
            <p className={`text-xs mt-2 ${testResult === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
              {testResult === 'success' ? 'Email i testit u dergua me sukses!' : testResult}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
