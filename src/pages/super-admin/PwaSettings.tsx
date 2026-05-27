import { useState, useEffect } from 'react';
import {
  Smartphone,
  Save,
  Loader2,
  AlertTriangle,
  CheckCircle,
  X,
  Palette,
  Monitor,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTranslation } from '../../i18n';
import { PageSkeleton } from '../../components/ui/Skeleton';

export default function PwaSettings() {
  const { t } = useTranslation();

  const pwaKeys = [
    { key: 'pwa_app_name', label: t('superAdmin.pwa.appName'), type: 'text' },
    { key: 'pwa_short_name', label: t('superAdmin.pwa.shortName'), type: 'text' },
    { key: 'pwa_description', label: t('common.description'), type: 'textarea' },
    { key: 'pwa_theme_color', label: t('superAdmin.pwa.themeColor'), type: 'color' },
    { key: 'pwa_background_color', label: t('superAdmin.pwa.backgroundColor'), type: 'color' },
    { key: 'pwa_display', label: t('superAdmin.pwa.displayMode'), type: 'select', options: ['standalone', 'fullscreen', 'minimal-ui', 'browser'] },
    { key: 'pwa_enabled', label: t('superAdmin.pwa.enablePwa'), type: 'toggle' },
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
      const keys = pwaKeys.map((k) => k.key);
      const { data, error: err } = await supabase.from('platform_settings').select('key, value').in('key', keys);
      if (err) throw err;
      const map: Record<string, string> = {};
      (data ?? []).forEach((d) => { map[d.key] = d.value; });
      setSettings(map);
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setLoading(false); }
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
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setSaving(false); }
  }

  if (loading) {
    return <PageSkeleton rows={6} cols={4} showStats={false} />;
  }

  const isEnabled = settings['pwa_enabled'] === 'true';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('superAdmin.pwa.title')}</h1>
          <p className="text-gray-500 mt-1">{t('superAdmin.pwa.subtitle')}</p>
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

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-teal-600" />
                <h2 className="text-lg font-semibold text-gray-900">{t('superAdmin.pwa.pwaSettings')}</h2>
              </div>
            </div>
            <div className="p-6 space-y-5">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div>
                  <p className="text-sm font-medium text-gray-900">{t('superAdmin.pwa.enablePwa')}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{t('superAdmin.pwa.enablePwaDesc')}</p>
                </div>
                <button
                  onClick={() => setSettings((p) => ({ ...p, pwa_enabled: p['pwa_enabled'] === 'true' ? 'false' : 'true' }))}
                  className={`relative w-12 h-6 rounded-full transition-colors ${isEnabled ? 'bg-teal-600' : 'bg-gray-300'}`}
                >
                  <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('superAdmin.pwa.appName')}</label>
                  <input type="text" value={settings['pwa_app_name'] ?? ''} onChange={(e) => setSettings((p) => ({ ...p, pwa_app_name: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('superAdmin.pwa.shortName')}</label>
                  <input type="text" value={settings['pwa_short_name'] ?? ''} onChange={(e) => setSettings((p) => ({ ...p, pwa_short_name: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.description')}</label>
                <textarea value={settings['pwa_description'] ?? ''} onChange={(e) => setSettings((p) => ({ ...p, pwa_description: e.target.value }))} rows={2} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm resize-none" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('superAdmin.pwa.displayMode')}</label>
                <select value={settings['pwa_display'] ?? 'standalone'} onChange={(e) => setSettings((p) => ({ ...p, pwa_display: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm bg-white">
                  <option value="standalone">Standalone</option>
                  <option value="fullscreen">Fullscreen</option>
                  <option value="minimal-ui">Minimal UI</option>
                  <option value="browser">Browser</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Palette className="w-5 h-5 text-teal-600" />
                <h2 className="text-lg font-semibold text-gray-900">{t('superAdmin.pwa.colors')}</h2>
              </div>
            </div>
            <div className="p-6">
              <div className="grid sm:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('superAdmin.pwa.themeColor')}</label>
                  <div className="flex items-center gap-3">
                    <input type="color" value={settings['pwa_theme_color'] ?? '#0d9488'} onChange={(e) => setSettings((p) => ({ ...p, pwa_theme_color: e.target.value }))} className="w-12 h-10 rounded-lg border border-gray-200 cursor-pointer" />
                    <input type="text" value={settings['pwa_theme_color'] ?? '#0d9488'} onChange={(e) => setSettings((p) => ({ ...p, pwa_theme_color: e.target.value }))} className="flex-1 px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm font-mono" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('superAdmin.pwa.backgroundColor')}</label>
                  <div className="flex items-center gap-3">
                    <input type="color" value={settings['pwa_background_color'] ?? '#ffffff'} onChange={(e) => setSettings((p) => ({ ...p, pwa_background_color: e.target.value }))} className="w-12 h-10 rounded-lg border border-gray-200 cursor-pointer" />
                    <input type="text" value={settings['pwa_background_color'] ?? '#ffffff'} onChange={(e) => setSettings((p) => ({ ...p, pwa_background_color: e.target.value }))} className="flex-1 px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm font-mono" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 h-fit">
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Monitor className="w-5 h-5 text-teal-600" />
              <h2 className="text-lg font-semibold text-gray-900">{t('superAdmin.pwa.preview')}</h2>
            </div>
          </div>
          <div className="p-6 flex flex-col items-center">
            <div className="w-48 border-4 border-gray-800 rounded-3xl overflow-hidden shadow-xl">
              <div className="h-6" style={{ backgroundColor: settings['pwa_theme_color'] || '#0d9488' }} />
              <div className="h-64 flex flex-col items-center justify-center" style={{ backgroundColor: settings['pwa_background_color'] || '#ffffff' }}>
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-3 shadow-lg" style={{ backgroundColor: settings['pwa_theme_color'] || '#0d9488' }}>
                  <Smartphone className="w-8 h-8 text-white" />
                </div>
                <p className="text-xs font-bold text-center px-4" style={{ color: settings['pwa_theme_color'] || '#0d9488' }}>
                  {settings['pwa_short_name'] || 'App'}
                </p>
              </div>
              <div className="h-4 bg-gray-800" />
            </div>
            <div className="mt-4 text-center">
              <p className="text-sm font-semibold text-gray-900">{settings['pwa_app_name'] || t('superAdmin.pwa.appName')}</p>
              <p className="text-xs text-gray-500 mt-0.5">{settings['pwa_description'] || t('common.description')}</p>
              <div className="mt-2 flex items-center justify-center gap-2">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${isEnabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {isEnabled ? t('superAdmin.pwa.pwaActive') : t('superAdmin.pwa.pwaInactive')}
                </span>
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-700">
                  {settings['pwa_display'] || 'standalone'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
