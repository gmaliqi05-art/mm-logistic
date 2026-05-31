import { useState, useEffect, useRef } from 'react';
import { Image as ImageIcon, Upload, Save, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTranslation } from '../../i18n';
import { PageSkeleton } from '../../components/ui/Skeleton';

type LogoVariant = 'light' | 'social';

export default function PlatformBranding() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [uploadingLight, setUploadingLight] = useState(false);
  const [uploadingSocial, setUploadingSocial] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState('');
  const [logoSocialUrl, setLogoSocialUrl] = useState('');
  const [platformName, setPlatformName] = useState('MM Logistic');
  const [platformShortName, setPlatformShortName] = useState('MML');
  const lightInputRef = useRef<HTMLInputElement>(null);
  const socialInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      setLoading(true);
      setError(null);

      const { data } = await supabase
        .from('platform_settings')
        .select('key, value')
        .in('key', ['platform_logo', 'platform_logo_social', 'platform_name', 'platform_short_name']);

      if (data) {
        data.forEach((setting) => {
          if (setting.key === 'platform_logo') setLogoUrl(setting.value || '');
          if (setting.key === 'platform_logo_social') setLogoSocialUrl(setting.value || '');
          if (setting.key === 'platform_name') setPlatformName(setting.value || 'MM Logistic');
          if (setting.key === 'platform_short_name') setPlatformShortName(setting.value || 'MML');
        });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.errorLoading'));
    } finally {
      setLoading(false);
    }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>, variant: LogoVariant) {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      setError(t('superAdmin.branding.imageFormat'));
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError(t('superAdmin.branding.imageTooLarge'));
      return;
    }

    const setUploading = variant === 'light' ? setUploadingLight : setUploadingSocial;

    try {
      setUploading(true);
      setError(null);

      const fileExt = file.name.split('.').pop();
      const prefix = variant === 'social' ? 'platform-logo-social' : 'platform-logo';
      const fileName = `${prefix}-${Date.now()}.${fileExt}`;
      const filePath = `platform/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(filePath);

      if (variant === 'social') setLogoSocialUrl(urlData.publicUrl);
      else setLogoUrl(urlData.publicUrl);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.logoUploadFailed'));
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const updates = [
        { key: 'platform_logo', value: logoUrl, description: t('common.platformLogoTransparentDesc') },
        { key: 'platform_logo_social', value: logoSocialUrl, description: t('common.platformLogoSocialDesc') },
        { key: 'platform_logo_icon', value: logoUrl, description: t('common.platformLogoFaviconDesc') },
        { key: 'platform_name', value: platformName, description: t('common.platformName') },
        { key: 'platform_short_name', value: platformShortName, description: t('common.platformShortName') },
      ];

      for (const update of updates) {
        const { data: existing } = await supabase
          .from('platform_settings')
          .select('id')
          .eq('key', update.key)
          .maybeSingle();

        if (existing) {
          await supabase
            .from('platform_settings')
            .update({ value: update.value, updated_at: new Date().toISOString() })
            .eq('key', update.key);
        } else {
          await supabase.from('platform_settings').insert({
            key: update.key,
            value: update.value,
            description: update.description,
          });
        }
      }

      setSuccess('Cilësimet u ruajtën me sukses! Rifreskoni faqen (Ctrl+F5) për të parë ndryshimet.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.errorSaving'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <PageSkeleton rows={6} cols={4} showStats={false} />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('common.logoBrandingTitle')}</h1>
        <p className="text-gray-500 mt-1">{t('common.managePlatformLogos')}</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
            ×
          </button>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-green-700 text-sm">{success}</p>
          </div>
          <button onClick={() => setSuccess(null)} className="text-green-500 hover:text-green-700">
            ×
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LogoUploadCard
          title={t('common.logoKryesoreTransparente')}
          subtitle={t('common.usedInNavbarSidebarLoginFaviconPwa')}
          previewBg="bg-gray-50"
          logoUrl={logoUrl}
          onUpload={(e) => handleLogoUpload(e, 'light')}
          uploading={uploadingLight}
          inputRef={lightInputRef}
          recommendation="Rekomandohet: 512x512px, PNG me sfond transparent"
        />
        <LogoUploadCard
          title={t('common.logoPerRrjeteSociale')}
          subtitle={t('common.usedWhenLinkSharedSocial')}
          previewBg="bg-slate-900"
          logoUrl={logoSocialUrl}
          onUpload={(e) => handleLogoUpload(e, 'social')}
          uploading={uploadingSocial}
          inputRef={socialInputRef}
          recommendation="Rekomandohet: 1200x630px, PNG me sfond (optimale per OG)"
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Emri i Platformes</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Emri i plote</label>
            <input
              type="text"
              value={platformName}
              onChange={(e) => setPlatformName(e.target.value)}
              placeholder="MM Logistic"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1.5">{t('common.shownInNavbarSidebarHomepageTitle')}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Emri i shkurter (akronim)</label>
            <input
              type="text"
              value={platformShortName}
              onChange={(e) => setPlatformShortName(e.target.value)}
              placeholder="MML"
              maxLength={10}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1.5">{t('common.smallSpaceOrClosedSidebar')}</p>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-teal-600 text-white rounded-lg font-semibold hover:bg-teal-700 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Duke ruajtur...' : 'Ruaj Ndryshimet'}
        </button>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-blue-900 mb-1">Ku perdoret secila logo</h3>
            <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
              <li><strong>{t('common.logoKryesoreTransparente2')}</strong>{t('common.appliedToNavbarSidebarLoginRegisterInvoiceFaviconPwa')}</li>
              <li><strong>{t('common.logoPerRrjeteSocialeMeSfond')}</strong>: kur linku ndahet ne Facebook, WhatsApp, Twitter, LinkedIn, iMessage</li>
            </ul>
            <p className="text-sm text-blue-700 mt-2">{t('common.pasRuajtjesBejCtrlFPer')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function LogoUploadCard({
  title,
  subtitle,
  previewBg,
  logoUrl,
  onUpload,
  uploading,
  inputRef,
  recommendation,
}: {
  title: string;
  subtitle: string;
  previewBg: string;
  logoUrl: string;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  uploading: boolean;
  inputRef: React.RefObject<HTMLInputElement>;
  recommendation: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-5 border-b border-gray-100">
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
      </div>
      <div className="p-5 space-y-4">
        <div className={`${previewBg} rounded-lg border-2 border-dashed border-gray-200 p-8 flex items-center justify-center min-h-[180px]`}>
          {logoUrl ? (
            <img src={logoUrl} alt={title} className="max-w-full max-h-[140px] object-contain" />
          ) : (
            <ImageIcon className="w-12 h-12 text-gray-400" />
          )}
        </div>
        <input ref={inputRef} type="file" accept="image/*" onChange={onUpload} className="hidden" />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-700 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {uploading ? t('common.uploading') : t('common.uploadLogo')}
        </button>
        <p className="text-xs text-gray-500 text-center">{recommendation}</p>
      </div>
    </div>
  );
}
