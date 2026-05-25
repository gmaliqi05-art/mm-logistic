import { useState, useEffect } from 'react';
import {
  MapPin,
  Save,
  Loader2,
  AlertTriangle,
  CheckCircle,
  X,
  Navigation,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTranslation } from '../../i18n';
import { PageSkeleton } from '../../components/ui/Skeleton';

export default function HomepageMap() {
  const { t } = useTranslation();

  const mapKeys = [
    { key: 'map_latitude', label: t('superAdmin.map.latitude'), placeholder: '42.3702' },
    { key: 'map_longitude', label: t('superAdmin.map.longitude'), placeholder: '21.1553' },
    { key: 'map_zoom', label: t('superAdmin.map.zoomLevel'), placeholder: '15' },
    { key: 'map_address', label: t('common.address'), placeholder: 'Rr. Epopeja e Jezercit Nr. 402, Ferizaj 70000' },
    { key: 'map_enabled', label: t('superAdmin.map.enableMap'), type: 'toggle' },
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
      const keys = mapKeys.map((k) => k.key);
      const { data, error: err } = await supabase.from('platform_settings').select('key, value').in('key', keys);
      if (err) throw err;
      const map: Record<string, string> = {};
      (data ?? []).forEach((d) => { map[d.key] = d.value; });
      setSettings(map);
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
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
    } catch (err: any) { setError(err.message); } finally { setSaving(false); }
  }

  if (loading) {
    return <PageSkeleton rows={6} cols={4} showStats={false} />;
  }

  const isEnabled = settings['map_enabled'] === 'true';
  const lat = settings['map_latitude'] || '42.3702';
  const lng = settings['map_longitude'] || '21.1553';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('superAdmin.map.title')}</h1>
          <p className="text-gray-500 mt-1">{t('superAdmin.map.subtitle')}</p>
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

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-teal-600" />
              <h2 className="text-lg font-semibold text-gray-900">{t('superAdmin.map.mapSettings')}</h2>
            </div>
          </div>
          <div className="p-6 space-y-5">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
              <div>
                <p className="text-sm font-medium text-gray-900">{t('superAdmin.map.enableMap')}</p>
                <p className="text-xs text-gray-500 mt-0.5">{t('superAdmin.map.enableMapDesc')}</p>
              </div>
              <button
                onClick={() => setSettings((p) => ({ ...p, map_enabled: p['map_enabled'] === 'true' ? 'false' : 'true' }))}
                className={`relative w-12 h-6 rounded-full transition-colors ${isEnabled ? 'bg-teal-600' : 'bg-gray-300'}`}
              >
                <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('superAdmin.map.latitude')}</label>
                <input
                  type="text"
                  value={settings['map_latitude'] ?? ''}
                  onChange={(e) => setSettings((p) => ({ ...p, map_latitude: e.target.value }))}
                  placeholder="42.3702"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('superAdmin.map.longitude')}</label>
                <input
                  type="text"
                  value={settings['map_longitude'] ?? ''}
                  onChange={(e) => setSettings((p) => ({ ...p, map_longitude: e.target.value }))}
                  placeholder="21.1553"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('superAdmin.map.zoomLevel')}</label>
              <input
                type="number"
                min="1"
                max="20"
                value={settings['map_zoom'] ?? '15'}
                onChange={(e) => setSettings((p) => ({ ...p, map_zoom: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.address')}</label>
              <textarea
                value={settings['map_address'] ?? ''}
                onChange={(e) => setSettings((p) => ({ ...p, map_address: e.target.value }))}
                rows={2}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm resize-none"
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Navigation className="w-5 h-5 text-teal-600" />
              <h2 className="text-lg font-semibold text-gray-900">{t('superAdmin.map.mapPreview')}</h2>
            </div>
          </div>
          <div className="p-6">
            <div className="rounded-xl overflow-hidden border border-gray-200 h-80">
              <iframe
                title="Map Preview"
                width="100%"
                height="100%"
                style={{ border: 0 }}
                loading="lazy"
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${Number(lng) - 0.01}%2C${Number(lat) - 0.01}%2C${Number(lng) + 0.01}%2C${Number(lat) + 0.01}&layer=mapnik&marker=${lat}%2C${lng}`}
              />
            </div>
            <div className="mt-4 p-3 bg-gray-50 rounded-lg">
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-teal-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm text-gray-700">{settings['map_address'] || t('superAdmin.map.addressNotSet')}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Lat: {lat}, Lng: {lng}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
