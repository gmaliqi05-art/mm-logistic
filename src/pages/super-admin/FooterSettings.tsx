import { useState, useEffect } from 'react';
import {
  Save,
  Loader2,
  AlertTriangle,
  CheckCircle,
  X,
  FileText,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTranslation } from '../../i18n';
import { PageSkeleton } from '../../components/ui/Skeleton';

export default function FooterSettings() {
  const { t } = useTranslation();

  const footerKeys = [
    { key: 'footer_company_name', label: t('superAdmin.footer.companyName'), type: 'text' },
    { key: 'footer_description', label: t('common.description'), type: 'textarea' },
    { key: 'footer_copyright', label: t('superAdmin.footer.copyright'), type: 'text' },
    { key: 'footer_nui', label: t('superAdmin.footer.nui'), type: 'text' },
    { key: 'platform_email', label: t('common.email'), type: 'text' },
    { key: 'platform_phone', label: t('common.phone'), type: 'text' },
  ];

  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    try {
      setLoading(true);
      const keys = footerKeys.map((k) => k.key);
      const { data, error: err } = await supabase
        .from('platform_settings')
        .select('key, value')
        .in('key', keys);
      if (err) throw err;
      const map: Record<string, string> = {};
      (data ?? []).forEach((d) => { map[d.key] = d.value; });
      setSettings(map);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    try {
      setSaving(true);
      setError(null);
      setSaved(false);

      for (const [key, value] of Object.entries(settings)) {
        const { error: err } = await supabase
          .from('platform_settings')
          .update({ value, updated_at: new Date().toISOString() })
          .eq('key', key);
        if (err) throw err;
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.message);
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('superAdmin.footer.title')}</h1>
          <p className="text-gray-500 mt-1">{t('superAdmin.footer.subtitle')}</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium disabled:opacity-50"
        >
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
            <FileText className="w-5 h-5 text-teal-600" />
            <h2 className="text-lg font-semibold text-gray-900">{t('superAdmin.footer.footerInfo')}</h2>
          </div>
        </div>
        <div className="p-6 space-y-5">
          {footerKeys.map((fk) => (
            <div key={fk.key}>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{fk.label}</label>
              {fk.type === 'textarea' ? (
                <textarea
                  value={settings[fk.key] ?? ''}
                  onChange={(e) => setSettings((p) => ({ ...p, [fk.key]: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm resize-none"
                />
              ) : (
                <input
                  type="text"
                  value={settings[fk.key] ?? ''}
                  onChange={(e) => setSettings((p) => ({ ...p, [fk.key]: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">{t('superAdmin.footer.footerPreview')}</h3>
        <div className="bg-slate-900 rounded-xl p-8 text-white">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 bg-teal-600 rounded-lg">
              <FileText className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-sm">{settings['footer_company_name'] || t('common.company')}</span>
          </div>
          <p className="text-slate-400 text-xs mb-3">{settings['footer_description'] || t('common.description') + '...'}</p>
          <p className="text-slate-500 text-xs">{t('superAdmin.footer.nui')}: {settings['footer_nui'] || '-'}</p>
          <div className="mt-4 pt-4 border-t border-slate-800">
            <p className="text-slate-500 text-xs">{settings['footer_copyright'] || 'Copyright...'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
