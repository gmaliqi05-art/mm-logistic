import { useState, useEffect } from 'react';
import {
  Save,
  Loader2,
  AlertTriangle,
  CheckCircle,
  X,
  Smartphone,
  QrCode,
  ExternalLink,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTranslation } from '../../i18n';
import { PageSkeleton } from '../../components/ui/Skeleton';

export default function AppDownload() {
  const { t } = useTranslation();

  const settingsKeys = [
    { key: 'app_store_url', label: 'App Store URL (iOS)', placeholder: 'https://apps.apple.com/...' },
    { key: 'play_store_url', label: 'Play Store URL (Android)', placeholder: 'https://play.google.com/store/apps/...' },
    { key: 'app_download_enabled', label: t('superAdmin.appDownload.enableDownload'), type: 'toggle' },
  ];

  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { fetchSettings(); }, []);

  async function fetchSettings() {
    try {
      setLoading(true);
      const keys = settingsKeys.map((k) => k.key);
      const { data, error: err } = await supabase.from('platform_settings').select('key, value').in('key', keys);
      if (err) throw err;
      const map: Record<string, string> = {};
      (data ?? []).forEach((d) => { map[d.key] = d.value; });
      setSettings(map);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }

  async function handleSave() {
    try {
      setSaving(true);
      setError(null);
      setSaved(false);
      for (const [key, value] of Object.entries(settings)) {
        const { error: err } = await supabase.from('platform_settings').update({ value, updated_at: new Date().toISOString() }).eq('key', key);
        if (err) throw err;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  }

  function getQRImageUrl(url: string, size = 200) {
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(url)}`;
  }

  if (loading) {
    return <PageSkeleton rows={6} cols={4} showStats={false} />;
  }

  const isEnabled = settings['app_download_enabled'] === 'true';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('superAdmin.appDownload.title')}</h1>
          <p className="text-gray-500 mt-1">{t('superAdmin.appDownload.subtitle')}</p>
        </div>
        <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saving ? t('common.saving') : saved ? t('common.saved') : t('common.saveChanges')}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-red-700 text-sm flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      {saved && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
          <p className="text-green-700 text-sm font-medium">{t('common.savedSuccess')}</p>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-teal-600" />
            <h2 className="text-lg font-semibold text-gray-900">{t('superAdmin.appDownload.downloadSettings')}</h2>
          </div>
        </div>
        <div className="p-6 space-y-5">
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
            <div>
              <p className="text-sm font-medium text-gray-900">{t('superAdmin.appDownload.enableDownload')}</p>
              <p className="text-xs text-gray-500 mt-0.5">{t('superAdmin.appDownload.enableDownloadDesc')}</p>
            </div>
            <button
              onClick={() => setSettings((p) => ({ ...p, app_download_enabled: p['app_download_enabled'] === 'true' ? 'false' : 'true' }))}
              className={`relative w-12 h-6 rounded-full transition-colors ${isEnabled ? 'bg-teal-600' : 'bg-gray-300'}`}
            >
              <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">App Store URL (iOS)</label>
            <input
              type="text"
              value={settings['app_store_url'] ?? ''}
              onChange={(e) => setSettings((p) => ({ ...p, app_store_url: e.target.value }))}
              placeholder="https://apps.apple.com/..."
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Play Store URL (Android)</label>
            <input
              type="text"
              value={settings['play_store_url'] ?? ''}
              onChange={(e) => setSettings((p) => ({ ...p, play_store_url: e.target.value }))}
              placeholder="https://play.google.com/store/apps/..."
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
            />
          </div>
        </div>
      </div>

      {(settings['app_store_url'] || settings['play_store_url']) && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-teal-600" />
              <h2 className="text-lg font-semibold text-gray-900">{t('superAdmin.appDownload.qrCodesForDownload')}</h2>
            </div>
          </div>
          <div className="p-6 grid sm:grid-cols-2 gap-8">
            {settings['app_store_url'] && (
              <div className="flex flex-col items-center">
                <div className="w-48 h-48 bg-white rounded-xl border-2 border-gray-100 p-3 mb-4">
                  <img src={getQRImageUrl(settings['app_store_url'])} alt="iOS QR" className="w-full h-full" />
                </div>
                <p className="text-sm font-semibold text-gray-900">iOS (App Store)</p>
                <a href={settings['app_store_url']} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 mt-1">
                  <ExternalLink className="w-3 h-3" />{t('superAdmin.appDownload.openLink')}
                </a>
              </div>
            )}
            {settings['play_store_url'] && (
              <div className="flex flex-col items-center">
                <div className="w-48 h-48 bg-white rounded-xl border-2 border-gray-100 p-3 mb-4">
                  <img src={getQRImageUrl(settings['play_store_url'])} alt="Android QR" className="w-full h-full" />
                </div>
                <p className="text-sm font-semibold text-gray-900">Android (Play Store)</p>
                <a href={settings['play_store_url']} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 mt-1">
                  <ExternalLink className="w-3 h-3" />{t('superAdmin.appDownload.openLink')}
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
