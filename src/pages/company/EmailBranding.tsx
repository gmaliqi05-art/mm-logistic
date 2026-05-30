import { useState, useEffect } from 'react';
import { Loader2, Save, CheckCircle2, AlertTriangle, Palette, Upload, RotateCcw, Eye } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';

interface BrandingSettings {
  brand_name: string;
  brand_logo_url: string;
  brand_primary_color: string;
  brand_secondary_color: string;
  reply_to_email: string;
  from_name: string;
}

const DEFAULTS: BrandingSettings = {
  brand_name: '',
  brand_logo_url: '',
  brand_primary_color: '#0f766e',
  brand_secondary_color: '#0f172a',
  reply_to_email: '',
  from_name: '',
};

export default function EmailBranding() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [settings, setSettings] = useState<BrandingSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasRecord, setHasRecord] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (profile?.company_id) fetchSettings();
  }, [profile?.company_id]);

  async function fetchSettings() {
    setLoading(true);
    const { data } = await supabase
      .from('company_email_settings')
      .select('brand_name, brand_logo_url, brand_primary_color, brand_secondary_color, reply_to_email, from_name')
      .eq('company_id', profile!.company_id!)
      .maybeSingle();

    if (data) {
      setHasRecord(true);
      setSettings({
        brand_name: data.brand_name || '',
        brand_logo_url: data.brand_logo_url || '',
        brand_primary_color: data.brand_primary_color || '#0f766e',
        brand_secondary_color: data.brand_secondary_color || '#0f172a',
        reply_to_email: data.reply_to_email || '',
        from_name: data.from_name || '',
      });
    }
    setLoading(false);
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError(t('company.emailBranding.imagesOnly') || 'Vetem imazhe (PNG, JPG, SVG) lejohen');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError(t('company.emailBranding.fileTooLarge') || 'Skedari eshte shume i madh (max 2MB)');
      return;
    }

    setUploading(true);
    setError(null);
    const ext = file.name.split('.').pop();
    const path = `email-logos/${profile!.company_id}/logo.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from('attachments')
      .upload(path, file, { upsert: true });

    if (uploadErr) {
      setError(uploadErr.message);
    } else {
      const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(path);
      setSettings(s => ({ ...s, brand_logo_url: urlData.publicUrl }));
    }
    setUploading(false);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const companyId = profile!.company_id!;

    const payload = {
      company_id: companyId,
      ...settings,
      updated_at: new Date().toISOString(),
    };

    let err: any;
    if (hasRecord) {
      ({ error: err } = await supabase
        .from('company_email_settings')
        .update(payload)
        .eq('company_id', companyId));
    } else {
      ({ error: err } = await supabase
        .from('company_email_settings')
        .insert(payload));
      if (!err) setHasRecord(true);
    }

    if (err) {
      setError(err.message);
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
    setSaving(false);
  }

  function handleReset() {
    setSettings(DEFAULTS);
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

      <div className={`grid gap-6 ${showPreview ? 'lg:grid-cols-2' : 'lg:grid-cols-1'}`}>
        <div className="space-y-6">
          {/* Brand Identity */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <Palette className="w-5 h-5 text-teal-700" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900">{t('common.identitetiIEmailIt')}</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  Personalizoni pamjen e email-eve qe dergoni tek klientet tuaj
                </p>
              </div>
            </div>

            <div className="space-y-4 ml-14">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Emri i kompanise (ne email)</label>
                <input
                  type="text"
                  value={settings.brand_name}
                  onChange={(e) => setSettings(s => ({ ...s, brand_name: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="p.sh. ABC Logistics GmbH"
                />
                <p className="text-[11px] text-gray-400 mt-1">Shfaqet ne header-in e email-it si dergues</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">From Name (emri i derguesit)</label>
                <input
                  type="text"
                  value={settings.from_name}
                  onChange={(e) => setSettings(s => ({ ...s, from_name: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="p.sh. Faturimi - ABC Logistics"
                />
                <p className="text-[11px] text-gray-400 mt-1">Emri qe shfaqet ne inbox te marresit</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Reply-To Email</label>
                <input
                  type="email"
                  value={settings.reply_to_email}
                  onChange={(e) => setSettings(s => ({ ...s, reply_to_email: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="p.sh. finance@kompania-juaj.com"
                />
                <p className="text-[11px] text-gray-400 mt-1">{t('common.adresaKuKlientetMundTePergjigjen')}</p>
              </div>
            </div>
          </div>

          {/* Logo */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <Upload className="w-5 h-5 text-blue-700" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900">{t('common.logoPerEmail')}</h3>
                <p className="text-sm text-gray-500 mt-0.5">{t('common.logoQeShfaqetNeHeaderIn')}</p>
              </div>
            </div>

            <div className="ml-14 space-y-3">
              {settings.brand_logo_url && (
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <img
                    src={settings.brand_logo_url}
                    alt="Logo"
                    className="max-h-16 object-contain"
                  />
                </div>
              )}
              <div className="flex items-center gap-3">
                <label className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors">
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {uploading ? 'Duke ngarkuar...' : 'Ngarko logo'}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="hidden"
                    disabled={uploading}
                  />
                </label>
                {settings.brand_logo_url && (
                  <button
                    onClick={() => setSettings(s => ({ ...s, brand_logo_url: '' }))}
                    className="text-xs text-red-600 hover:text-red-700"
                  >
                    Hiq logon
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Colors */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
            <h3 className="text-base font-semibold text-gray-900 ml-14">Ngjyrat</h3>
            <div className="ml-14 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Ngjyra primare (butona, header)</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={settings.brand_primary_color}
                    onChange={(e) => setSettings(s => ({ ...s, brand_primary_color: e.target.value }))}
                    className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={settings.brand_primary_color}
                    onChange={(e) => setSettings(s => ({ ...s, brand_primary_color: e.target.value }))}
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Ngjyra sekondare (footer, tekst)</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={settings.brand_secondary_color}
                    onChange={(e) => setSettings(s => ({ ...s, brand_secondary_color: e.target.value }))}
                    className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={settings.brand_secondary_color}
                    onChange={(e) => setSettings(s => ({ ...s, brand_secondary_color: e.target.value }))}
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <button
              onClick={handleReset}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              <RotateCcw className="w-4 h-4" />
              Rivendos default
            </button>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <Eye className="w-4 h-4" />
                {showPreview ? 'Fshih Preview' : 'Preview'}
              </button>
              {saved && (
                <span className="inline-flex items-center gap-1 text-sm text-emerald-600">
                  <CheckCircle2 className="w-4 h-4" />{t('common.ruajtur')}</span>
              )}
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-medium text-sm disabled:opacity-60"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Ruaj Branding
              </button>
            </div>
          </div>
        </div>

        {/* Preview */}
        {showPreview && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden sticky top-4">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <span className="text-xs font-semibold text-gray-600 uppercase">Preview i Email-it</span>
            </div>
            <div className="p-4">
              <div
                className="rounded-lg border border-gray-200 overflow-hidden"
                style={{ fontFamily: 'Arial, sans-serif' }}
              >
                {/* Header */}
                <div
                  className="px-6 py-5 text-center"
                  style={{ backgroundColor: settings.brand_primary_color }}
                >
                  {settings.brand_logo_url ? (
                    <img src={settings.brand_logo_url} alt="Logo" className="mx-auto max-h-10 object-contain" />
                  ) : (
                    <span className="text-lg font-bold text-white">
                      {settings.brand_name || 'Kompania Juaj'}
                    </span>
                  )}
                </div>

                {/* Body */}
                <div className="px-6 py-8 bg-white">
                  <h2 className="text-lg font-bold text-gray-900 mb-3">{t('common.faturaInv')}</h2>
                  <p className="text-sm text-gray-600 mb-4">
                    Ju dergojme faturen <strong>INV-2026-0042</strong> me total <strong>1.250,00 EUR</strong>.
                  </p>
                  <p className="text-sm text-gray-600 mb-6">
                    <strong>Afati i pageses:</strong> 15.06.2026
                  </p>
                  <a
                    href="#"
                    className="inline-block px-6 py-3 text-white text-sm font-bold rounded-lg no-underline"
                    style={{ backgroundColor: settings.brand_primary_color }}
                  >
                    Shiko faturen
                  </a>
                </div>

                {/* Footer */}
                <div
                  className="px-6 py-4 text-center"
                  style={{ backgroundColor: settings.brand_secondary_color }}
                >
                  <p className="text-xs text-gray-300">
                    {settings.brand_name || 'Kompania Juaj'} | {settings.reply_to_email || 'finance@kompania.com'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
