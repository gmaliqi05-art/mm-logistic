import { useState, useEffect, useCallback } from 'react';
import { Loader2, Send, AlertTriangle, CheckCircle2, Search, FileText, User, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';

interface Contact {
  id: string;
  name: string;
  email: string;
  preferred_locale: string | null;
}

interface Invoice {
  id: string;
  invoice_number: string;
  total: number;
  currency: string;
  due_date: string;
  status: string;
  contact_id: string;
}

interface TemplateOption {
  code: string;
  name: string;
}

export default function ManualEmail() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedContactId, setSelectedContactId] = useState<string>('');
  const [manualEmail, setManualEmail] = useState('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>('');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('invoice_issued');
  const [locale, setLocale] = useState<string>('sq');
  const [contactSearch, setContactSearch] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    if (profile?.company_id) fetchData();
  }, [profile?.company_id]);

  async function fetchData() {
    setLoading(true);
    const companyId = profile!.company_id!;

    const [contactsRes, invoicesRes, templatesRes] = await Promise.all([
      supabase
        .from('acc_contacts')
        .select('id, name, email, preferred_locale')
        .eq('company_id', companyId)
        .not('email', 'is', null)
        .order('name'),
      supabase
        .from('acc_invoices')
        .select('id, invoice_number, total, currency, due_date, status, contact_id')
        .eq('company_id', companyId)
        .in('status', ['draft', 'sent', 'overdue', 'finalized'])
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('email_templates')
        .select('code, name')
        .or(`company_id.is.null,company_id.eq.${companyId}`)
        .in('audience', ['company', 'all'])
        .eq('is_active', true)
        .order('name'),
    ]);

    setContacts((contactsRes.data ?? []) as Contact[]);
    setInvoices((invoicesRes.data ?? []) as Invoice[]);
    setTemplates((templatesRes.data ?? []) as TemplateOption[]);
    setLoading(false);
  }

  const selectedContact = contacts.find(c => c.id === selectedContactId);
  const recipientEmail = selectedContact?.email || manualEmail;

  const contactInvoices = selectedContactId
    ? invoices.filter(inv => inv.contact_id === selectedContactId)
    : invoices;

  const selectedInvoice = invoices.find(i => i.id === selectedInvoiceId);

  const filteredContacts = contactSearch.trim()
    ? contacts.filter(c => `${c.name} ${c.email}`.toLowerCase().includes(contactSearch.toLowerCase()))
    : contacts;

  useEffect(() => {
    if (selectedContact?.preferred_locale) {
      setLocale(selectedContact.preferred_locale);
    }
  }, [selectedContactId]);

  const fetchPreview = useCallback(async () => {
    if (!selectedTemplate) return;
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
          template_code: selectedTemplate,
          company_id: profile?.company_id,
          locale,
          preview: true,
          data: buildTemplateData(),
        }),
      });
      if (resp.ok) {
        const result = await resp.json();
        setPreviewHtml(result.html || '');
      }
    } catch { /* ignore */ }
    setPreviewLoading(false);
  }, [selectedTemplate, locale, selectedInvoiceId, selectedContactId]);

  function buildTemplateData() {
    const data: Record<string, string> = {
      customer_name: selectedContact?.name || 'Klient',
      company_name: '',
    };

    if (selectedInvoice) {
      data.invoice_number = selectedInvoice.invoice_number || '';
      data.total_formatted = formatCurrency(selectedInvoice.total, selectedInvoice.currency);
      data.amount = data.total_formatted;
      data.due_date = formatDate(selectedInvoice.due_date);
      data.currency = selectedInvoice.currency || 'EUR';

      if (selectedInvoice.status === 'overdue' && selectedInvoice.due_date) {
        const diff = Math.floor((Date.now() - new Date(selectedInvoice.due_date).getTime()) / (1000 * 60 * 60 * 24));
        data.days_overdue = String(Math.max(0, diff));
      }
    }

    return data;
  }

  function formatCurrency(val: number | null, currency?: string) {
    const n = Number(val ?? 0);
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('ep_language') : null;
    const tag = saved === 'sq' ? 'sq-AL'
      : saved === 'en' ? 'en-GB'
      : saved === 'fr' ? 'fr-FR'
      : 'de-DE';
    try {
      return new Intl.NumberFormat(tag, { style: 'currency', currency: currency || 'EUR' }).format(n);
    } catch {
      return `${n.toFixed(2)} ${currency || 'EUR'}`;
    }
  }

  function formatDate(d: string | null) {
    if (!d) return '-';
    try {
      return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch { return d; }
  }

  async function handleSend() {
    if (!recipientEmail.trim()) {
      setError(t('company.manualEmail.pickClientOrEmail') || 'Ju lutem zgjidhni nje klient ose shkruani nje adrese email');
      return;
    }
    if (!selectedTemplate) {
      setError(t('company.manualEmail.pickTemplate') || 'Ju lutem zgjidhni nje template');
      return;
    }

    setSending(true);
    setError(null);
    setSent(false);

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
          template_code: selectedTemplate,
          to: [recipientEmail.trim()],
          company_id: profile!.company_id,
          locale,
          data: buildTemplateData(),
        }),
      });

      if (resp.ok) {
        setSent(true);
        setTimeout(() => setSent(false), 4000);
      } else {
        const err = await resp.json().catch(() => ({}));
        setError(err.error || 'Dergimi deshtoi');
      }
    } catch {
      setError(t('company.manualEmail.networkError') || 'Gabim rrjeti');
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {error}
        </div>
      )}

      {sent && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          <div>
            <p className="text-sm font-medium text-emerald-900">{t('companyAdmin.manualEmail.sentSuccess')}</p>
            <p className="text-xs text-emerald-700 mt-0.5">{t('companyAdmin.manualEmail.recipient')}: {recipientEmail}</p>
          </div>
        </div>
      )}

      <div className={`grid gap-6 ${showPreview ? 'lg:grid-cols-2' : 'lg:grid-cols-1'}`}>
        <div className="space-y-5">
          {/* Contact Selection */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                <User className="w-4 h-4 text-blue-700" />
              </div>
              <h3 className="text-sm font-semibold text-gray-900">{t('companyAdmin.manualEmail.recipient')}</h3>
            </div>

            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={contactSearch}
                  onChange={(e) => setContactSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder={t('companyAdmin.manualEmail.searchClient')}
                />
              </div>

              <select
                value={selectedContactId}
                onChange={(e) => { setSelectedContactId(e.target.value); setManualEmail(''); }}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="">{t('companyAdmin.manualEmail.selectClient')}</option>
                {filteredContacts.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.email})</option>
                ))}
              </select>

              <div className="flex items-center gap-3">
                <div className="h-px bg-gray-200 flex-1" />
                <span className="text-xs text-gray-400 font-medium">{t('companyAdmin.manualEmail.or')}</span>
                <div className="h-px bg-gray-200 flex-1" />
              </div>

              <input
                type="email"
                value={manualEmail}
                onChange={(e) => { setManualEmail(e.target.value); setSelectedContactId(''); }}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder={t('companyAdmin.manualEmail.manualEmailPlaceholder')}
              />
            </div>
          </div>

          {/* Template & Invoice Selection */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-teal-100 rounded-lg flex items-center justify-center">
                <FileText className="w-4 h-4 text-teal-700" />
              </div>
              <h3 className="text-sm font-semibold text-gray-900">{t('companyAdmin.manualEmail.content')}</h3>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('companyAdmin.manualEmail.template')}</label>
                <select
                  value={selectedTemplate}
                  onChange={(e) => setSelectedTemplate(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  {templates.map(tpl => (
                    <option key={tpl.code} value={tpl.code}>{tpl.name}</option>
                  ))}
                </select>
              </div>

              {contactInvoices.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('companyAdmin.manualEmail.invoice')}</label>
                  <select
                    value={selectedInvoiceId}
                    onChange={(e) => setSelectedInvoiceId(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="">{t('companyAdmin.manualEmail.noInvoiceGeneric')}</option>
                    {contactInvoices.map(inv => (
                      <option key={inv.id} value={inv.id}>
                        {inv.invoice_number} - {formatCurrency(inv.total, inv.currency)} ({inv.status})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('companyAdmin.manualEmail.language')}</label>
                <select
                  value={locale}
                  onChange={(e) => setLocale(e.target.value)}
                  className="w-full sm:w-48 px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="sq">{t('companyAdmin.manualEmail.langSq')}</option>
                  <option value="de">{t('companyAdmin.manualEmail.langDe')}</option>
                  <option value="en">{t('companyAdmin.manualEmail.langEn')}</option>
                  <option value="fr">{t('companyAdmin.manualEmail.langFr')}</option>
                </select>
              </div>
            </div>
          </div>

          {/* Summary & Send */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">{t('companyAdmin.manualEmail.summary')}</h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-gray-500">{t('companyAdmin.manualEmail.recipient')}:</span>
                <p className="font-medium text-gray-900 mt-0.5">{recipientEmail || '-'}</p>
              </div>
              <div>
                <span className="text-gray-500">{t('companyAdmin.manualEmail.template')}:</span>
                <p className="font-medium text-gray-900 mt-0.5">{templates.find(tpl => tpl.code === selectedTemplate)?.name || '-'}</p>
              </div>
              {selectedInvoice && (
                <>
                  <div>
                    <span className="text-gray-500">{t('companyAdmin.manualEmail.invoice')}:</span>
                    <p className="font-medium text-gray-900 mt-0.5">{selectedInvoice.invoice_number}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">{t('companyAdmin.manualEmail.total')}:</span>
                    <p className="font-medium text-gray-900 mt-0.5">{formatCurrency(selectedInvoice.total, selectedInvoice.currency)}</p>
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-gray-100">
              <button
                onClick={() => { setShowPreview(!showPreview); if (!showPreview) fetchPreview(); }}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                {showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                {showPreview ? t('companyAdmin.manualEmail.hidePreview') : t('companyAdmin.manualEmail.preview')}
              </button>
              <button
                onClick={handleSend}
                disabled={sending || !recipientEmail.trim() || !selectedTemplate}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-medium text-sm disabled:opacity-50"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {t('companyAdmin.manualEmail.sendEmail')}
              </button>
            </div>
          </div>
        </div>

        {/* Preview */}
        {showPreview && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden sticky top-4 max-h-[700px]">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-600 uppercase">{t('companyAdmin.manualEmail.preview')}</span>
              <button
                onClick={fetchPreview}
                disabled={previewLoading}
                className="text-xs text-teal-600 hover:text-teal-700 font-medium"
              >
                {previewLoading ? t('companyAdmin.manualEmail.loadingPreview') : t('companyAdmin.manualEmail.refresh')}
              </button>
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
                  title={t('common.emailPreviewTitle')}
                  sandbox="allow-same-origin"
                />
              ) : (
                <div className="flex items-center justify-center h-full text-sm text-gray-400">
                  {t('companyAdmin.manualEmail.clickPreview')}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
