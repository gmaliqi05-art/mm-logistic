import { useState, useEffect, useRef } from 'react';
import { Building2, Upload, Save, Loader2, Image as ImageIcon, Radio } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import BackButton from '../../components/BackButton';
import PushNotificationSettings from '../../components/PushNotificationSettings';

export default function CompanySettings() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [companyPhone, setCompanyPhone] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [trafficProvider, setTrafficProvider] = useState<'none' | 'tomtom'>('none');
  const [trafficApiKey, setTrafficApiKey] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile?.company_id) {
      fetchCompanyData();
    }
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
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('attachments')
        .getPublicUrl(filePath);

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

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <BackButton to="/company" />
      </div>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <Building2 className="w-6 h-6 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {t('settings.companySettings')}
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                {t('settings.companyDesc')}
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
              {success}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('settings.companyLogo')}
              </label>
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  {logoUrl ? (
                    <img
                      src={logoUrl}
                      alt="Company Logo"
                      className="w-32 h-32 rounded-lg object-cover border-2 border-gray-200"
                    />
                  ) : (
                    <div className="w-32 h-32 rounded-lg bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center">
                      <ImageIcon className="w-12 h-12 text-gray-400" />
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {uploading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4" />
                    )}
                    {uploading ? t('common.uploading') : t('settings.uploadLogo')}
                  </button>
                  <p className="text-xs text-gray-500 mt-2">
                    {t('settings.logoHint')}
                  </p>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('settings.companyName')} *
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder={t('settings.companyName')}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('common.address')}
              </label>
              <textarea
                value={companyAddress}
                onChange={(e) => setCompanyAddress(e.target.value)}
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder={t('settings.companyAddress')}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('common.phone')}
                </label>
                <input
                  type="tel"
                  value={companyPhone}
                  onChange={(e) => setCompanyPhone(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="+355 69 123 4567"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('common.email')}
                </label>
                <input
                  type="email"
                  value={companyEmail}
                  onChange={(e) => setCompanyEmail(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="info@kompania.com"
                />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-200">
            <div className="flex items-start gap-3 mb-4">
              <Radio className="w-5 h-5 text-teal-600 mt-0.5" />
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Integrim trafiku (TomTom)</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Aktivizoje vetem nese shoferet e kompanise kane pajisje ose llogari TomTom. Pa kete, nuk do te gjenerohen alerte trafiku.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Ofrues i trafikut</label>
                <select
                  value={trafficProvider}
                  onChange={(e) => setTrafficProvider(e.target.value as 'none' | 'tomtom')}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                    placeholder="..."
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-gray-200">
            <button
              onClick={handleSave}
              disabled={saving || !companyName.trim()}
              className="inline-flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {saving ? t('common.saving') : t('common.saveChanges')}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 mt-6 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('settings.notificationSettings')}</h2>
        <PushNotificationSettings />
      </div>
    </div>
  );
}
