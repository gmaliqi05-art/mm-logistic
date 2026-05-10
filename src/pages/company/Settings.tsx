import { useState, useEffect, useRef } from 'react';
import { Building2, Upload, Save, Loader2, Image as ImageIcon, Radio, FileText, Bell, Plug } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import BackButton from '../../components/BackButton';
import PushNotificationSettings from '../../components/PushNotificationSettings';

type TabKey = 'profile' | 'invoice' | 'integrations' | 'notifications';

const CURRENCIES = ['EUR', 'CHF', 'ALL', 'RSD', 'BAM', 'MKD', 'RON', 'BGN', 'PLN', 'GBP', 'USD'];

export default function CompanySettings() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('profile');

  const [companyName, setCompanyName] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [companyPhone, setCompanyPhone] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [taxNumber, setTaxNumber] = useState('');
  const [website, setWebsite] = useState('');

  const [invoicePrefix, setInvoicePrefix] = useState('RE');
  const [defaultCurrency, setDefaultCurrency] = useState('EUR');
  const [defaultVatRate, setDefaultVatRate] = useState<number>(19);
  const [defaultPaymentTerms, setDefaultPaymentTerms] = useState<number>(14);
  const [invoiceHeaderNote, setInvoiceHeaderNote] = useState('');
  const [invoiceFooterText, setInvoiceFooterText] = useState('');

  const [trafficProvider, setTrafficProvider] = useState<'none' | 'tomtom'>('none');
  const [trafficApiKey, setTrafficApiKey] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile?.company_id) fetchCompanyData();
  }, [profile?.company_id]);

  async function fetchCompanyData() {
    try {
      setLoading(true);
      setError(null);
      const { data, error: err } = await supabase
        .from('companies')
        .select('*')
        .eq('id', profile!.company_id!)
        .maybeSingle();
      if (err) throw err;
      if (data) {
        setCompanyName(data.name || '');
        setCompanyAddress(data.address || '');
        setCompanyPhone(data.phone || '');
        setCompanyEmail(data.email || '');
        setLogoUrl(data.logo_url || '');
        setVatNumber(data.vat_number || '');
        setTaxNumber(data.tax_number || '');
        setWebsite(data.website || '');
        setInvoicePrefix(data.invoice_prefix || 'RE');
        setDefaultCurrency(data.default_currency || 'EUR');
        setDefaultVatRate(Number(data.default_vat_rate ?? 19));
        setDefaultPaymentTerms(Number(data.default_payment_terms_days ?? 14));
        setInvoiceHeaderNote(data.invoice_header_note || '');
        setInvoiceFooterText(data.invoice_footer_text || '');
        setTrafficProvider((data.traffic_provider as 'none' | 'tomtom') || 'none');
        setTrafficApiKey(data.traffic_api_key || '');
      }
    } catch (err: any) {
      setError(err.message || t('common.errorLoading'));
    } finally {
      setLoading(false);
    }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setError(t('settings.uploadImageTypes'));
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError(t('settings.imageTooLarge'));
      return;
    }
    try {
      setUploading(true);
      setError(null);
      const fileExt = file.name.split('.').pop();
      const fileName = `${profile!.company_id}-${Date.now()}.${fileExt}`;
      const filePath = `company-logos/${fileName}`;
      const { error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(filePath, file, { cacheControl: '3600', upsert: false });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(filePath);
      setLogoUrl(urlData.publicUrl);
      setSuccess(t('settings.logoUploadedSuccess'));
    } catch (err: any) {
      setError(err.message || t('settings.logoUploadFailed'));
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    if (!companyName.trim()) {
      setError(t('settings.companyNameRequired'));
      return;
    }
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      const { error: err } = await supabase
        .from('companies')
        .update({
          name: companyName.trim(),
          address: companyAddress.trim(),
          phone: companyPhone.trim(),
          email: companyEmail.trim(),
          logo_url: logoUrl,
          vat_number: vatNumber.trim() || null,
          tax_number: taxNumber.trim() || null,
          website: website.trim() || null,
          invoice_prefix: invoicePrefix.trim() || 'RE',
          default_currency: defaultCurrency,
          default_vat_rate: defaultVatRate,
          default_payment_terms_days: defaultPaymentTerms,
          invoice_header_note: invoiceHeaderNote,
          invoice_footer_text: invoiceFooterText,
          traffic_provider: trafficProvider,
          traffic_api_key: trafficProvider === 'tomtom' ? trafficApiKey.trim() || null : null,
        })
        .eq('id', profile!.company_id!);
      if (err) throw err;
      setSuccess(t('settings.changesSaved'));
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || t('settings.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const tabs: { key: TabKey; label: string; icon: typeof Building2 }[] = [
    { key: 'profile', label: 'Profili i kompanise', icon: Building2 },
    { key: 'invoice', label: 'Fatura & te dhena ligjore', icon: FileText },
    { key: 'integrations', label: 'Integrimet', icon: Plug },
    { key: 'notifications', label: 'Njoftimet', icon: Bell },
  ];

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="mb-6">
        <BackButton to="/company" />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <Building2 className="w-6 h-6 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{t('settings.companySettings')}</h1>
              <p className="text-sm text-gray-600 mt-1">{t('settings.companyDesc')}</p>
            </div>
          </div>
        </div>

        <div className="border-b border-gray-200 overflow-x-auto">
          <div className="flex gap-1 px-4">
            {tabs.map((tb) => {
              const Icon = tb.icon;
              const active = tab === tb.key;
              return (
                <button
                  key={tb.key}
                  onClick={() => setTab(tb.key)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    active ? 'border-teal-600 text-teal-700' : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tb.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>
          )}
          {success && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">{success}</div>
          )}

          {tab === 'profile' && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('settings.companyLogo')}</label>
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    {logoUrl ? (
                      <img src={logoUrl} alt="Logo" className="w-32 h-32 rounded-lg object-cover border-2 border-gray-200" />
                    ) : (
                      <div className="w-32 h-32 rounded-lg bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center">
                        <ImageIcon className="w-12 h-12 text-gray-400" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      {uploading ? t('common.uploading') : t('settings.uploadLogo')}
                    </button>
                    <p className="text-xs text-gray-500 mt-2">{t('settings.logoHint')}</p>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('settings.companyName')} *</label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('common.address')}</label>
                <textarea
                  value={companyAddress}
                  onChange={(e) => setCompanyAddress(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('common.phone')}</label>
                  <input
                    type="tel"
                    value={companyPhone}
                    onChange={(e) => setCompanyPhone(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('common.email')}</label>
                  <input
                    type="email"
                    value={companyEmail}
                    onChange={(e) => setCompanyEmail(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Website</label>
                <input
                  type="url"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>
            </div>
          )}

          {tab === 'invoice' && (
            <div className="space-y-5">
              <div className="bg-sky-50 border border-sky-200 rounded-lg p-4 text-sm text-sky-900">
                Keto te dhena shfaqen ne te gjitha faturat, fletedergesat dhe raportet e kompanise.
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Numri i TVSH-se (VAT)</label>
                  <input
                    type="text"
                    value={vatNumber}
                    onChange={(e) => setVatNumber(e.target.value)}
                    placeholder="DE123456789"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Numri i tatimit (Tax ID)</label>
                  <input
                    type="text"
                    value={taxNumber}
                    onChange={(e) => setTaxNumber(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Prefiksi i Fatures</label>
                  <input
                    type="text"
                    value={invoicePrefix}
                    onChange={(e) => setInvoicePrefix(e.target.value.toUpperCase())}
                    maxLength={6}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">P.sh. RE-2026-0001</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Monedha default</label>
                  <select
                    value={defaultCurrency}
                    onChange={(e) => setDefaultCurrency(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">TVSH default (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={defaultVatRate}
                    onChange={(e) => setDefaultVatRate(Number(e.target.value))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Afati i pageses (dite)</label>
                <input
                  type="number"
                  min={0}
                  max={365}
                  value={defaultPaymentTerms}
                  onChange={(e) => setDefaultPaymentTerms(Number(e.target.value))}
                  className="w-full md:w-48 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Shenim ne krye te fatures</label>
                <textarea
                  value={invoiceHeaderNote}
                  onChange={(e) => setInvoiceHeaderNote(e.target.value)}
                  rows={2}
                  placeholder="Opsionale — shenim qe shfaqet nen te dhenat e kompanise."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Teksti ne fund te fatures</label>
                <textarea
                  value={invoiceFooterText}
                  onChange={(e) => setInvoiceFooterText(e.target.value)}
                  rows={3}
                  placeholder="P.sh. Ju faleminderit per bashkepunimin. Kushtet e pageses: 14 dite."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Parashikim ne fature</h3>
                <div className="bg-white border border-slate-200 rounded p-4 text-sm">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      {logoUrl && <img src={logoUrl} alt="" className="w-12 h-12 object-contain" />}
                      <div>
                        <div className="font-bold text-gray-900">{companyName || 'Emri i kompanise'}</div>
                        <div className="text-xs text-gray-500 whitespace-pre-line">{companyAddress || 'Adresa'}</div>
                        <div className="text-xs text-gray-500">
                          {companyEmail} {companyPhone ? `• ${companyPhone}` : ''}
                        </div>
                        {vatNumber && <div className="text-xs text-gray-500">TVSH: {vatNumber}</div>}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-500">Fatura</div>
                      <div className="font-bold text-gray-900">{invoicePrefix}-2026-0001</div>
                    </div>
                  </div>
                  {invoiceHeaderNote && <div className="mt-2 text-xs text-gray-600">{invoiceHeaderNote}</div>}
                  {invoiceFooterText && (
                    <div className="mt-4 pt-3 border-t border-slate-200 text-xs text-gray-600 whitespace-pre-line">
                      {invoiceFooterText}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === 'integrations' && (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Radio className="w-5 h-5 text-teal-600 mt-0.5" />
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Integrim trafiku (TomTom)</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Aktivizoje vetem nese shoferet e kompanise kane pajisje ose llogari TomTom.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Ofrues i trafikut</label>
                  <select
                    value={trafficProvider}
                    onChange={(e) => setTrafficProvider(e.target.value as 'none' | 'tomtom')}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="none">Pa integrim</option>
                    <option value="tomtom">TomTom</option>
                  </select>
                </div>
                {trafficProvider === 'tomtom' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">TomTom API Key</label>
                    <input
                      type="password"
                      value={trafficApiKey}
                      onChange={(e) => setTrafficApiKey(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'notifications' && <PushNotificationSettings />}

          {tab !== 'notifications' && (
            <div className="flex justify-end pt-4 border-t border-gray-200">
              <button
                onClick={handleSave}
                disabled={saving || !companyName.trim()}
                className="inline-flex items-center gap-2 px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? t('common.saving') : t('common.saveChanges')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
