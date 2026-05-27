import { useState } from 'react';
import {
  Settings as SettingsIcon,
  Save,
  Bell,
  Mail,
  MessageSquare,
  Shield,
  Server,
  Loader2,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';
import { useTranslation } from '../../i18n';

interface PlatformSettings {
  platformName: string;
  platformDescription: string;
  emailNotifications: boolean;
  smsNotifications: boolean;
  pushNotifications: boolean;
  deliveryAlerts: boolean;
  stockAlerts: boolean;
  systemAlerts: boolean;
  maintenanceMode: boolean;
  maintenanceMessage: string;
}

export default function SuperAdminSettings() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<PlatformSettings>({
    platformName: 'Euro Pallet',
    platformDescription: 'Platforma per menaxhimin e paletave dhe dergesave',
    emailNotifications: true,
    smsNotifications: false,
    pushNotifications: true,
    deliveryAlerts: true,
    stockAlerts: true,
    systemAlerts: true,
    maintenanceMode: false,
    maintenanceMessage: '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    try {
      setSaving(true);
      setError(null);
      setSaved(false);

      await new Promise((resolve) => setTimeout(resolve, 800));

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.message || t('common.errorSaving'));
    } finally {
      setSaving(false);
    }
  }

  function updateSetting<K extends keyof PlatformSettings>(key: K, value: PlatformSettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('superAdmin.settings.title')}</h1>
          <p className="text-gray-500 mt-1">{t('superAdmin.settings.subtitle')}</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : saved ? (
            <CheckCircle className="w-4 h-4" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {saving ? t('common.processing') : saved ? t('common.save') : t('common.saveChanges')}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {saved && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
          <p className="text-green-700 text-sm font-medium">{t('common.saveChanges')}</p>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-teal-600" />
            <h2 className="text-lg font-semibold text-gray-900">{t('common.information')}</h2>
          </div>
        </div>
        <div className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              {t('superAdmin.settings.platformName')}
            </label>
            <input
              type="text"
              value={settings.platformName}
              onChange={(e) => updateSetting('platformName', e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              {t('superAdmin.settings.platformDesc')}
            </label>
            <textarea
              value={settings.platformDescription}
              onChange={(e) => updateSetting('platformDescription', e.target.value)}
              rows={3}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm resize-none"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-teal-600" />
            <h2 className="text-lg font-semibold text-gray-900">{t('superAdmin.settings.notifications')}</h2>
          </div>
        </div>
        <div className="p-6 divide-y divide-gray-100">
          <div className="flex items-center justify-between py-4 first:pt-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center">
                <Mail className="w-5 h-5 text-teal-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{t('superAdmin.settings.emailNotif')}</p>
                <p className="text-xs text-gray-500">{t('superAdmin.settings.emailNotif')}</p>
              </div>
            </div>
            <button
              onClick={() => updateSetting('emailNotifications', !settings.emailNotifications)}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                settings.emailNotifications ? 'bg-teal-600' : 'bg-gray-300'
              }`}
            >
              <div
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  settings.emailNotifications ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-teal-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{t('superAdmin.settings.smsNotif')}</p>
                <p className="text-xs text-gray-500">{t('superAdmin.settings.smsNotif')}</p>
              </div>
            </div>
            <button
              onClick={() => updateSetting('smsNotifications', !settings.smsNotifications)}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                settings.smsNotifications ? 'bg-teal-600' : 'bg-gray-300'
              }`}
            >
              <div
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  settings.smsNotifications ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center">
                <Bell className="w-5 h-5 text-teal-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{t('superAdmin.settings.pushNotif')}</p>
                <p className="text-xs text-gray-500">{t('superAdmin.settings.pushNotif')}</p>
              </div>
            </div>
            <button
              onClick={() => updateSetting('pushNotifications', !settings.pushNotifications)}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                settings.pushNotifications ? 'bg-teal-600' : 'bg-gray-300'
              }`}
            >
              <div
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  settings.pushNotifications ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center">
                <Shield className="w-5 h-5 text-teal-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{t('superAdmin.settings.deliveryAlerts')}</p>
                <p className="text-xs text-gray-500">{t('superAdmin.settings.deliveryAlerts')}</p>
              </div>
            </div>
            <button
              onClick={() => updateSetting('deliveryAlerts', !settings.deliveryAlerts)}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                settings.deliveryAlerts ? 'bg-teal-600' : 'bg-gray-300'
              }`}
            >
              <div
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  settings.deliveryAlerts ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center">
                <Shield className="w-5 h-5 text-teal-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{t('superAdmin.settings.stockAlerts')}</p>
                <p className="text-xs text-gray-500">{t('superAdmin.settings.stockAlerts')}</p>
              </div>
            </div>
            <button
              onClick={() => updateSetting('stockAlerts', !settings.stockAlerts)}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                settings.stockAlerts ? 'bg-teal-600' : 'bg-gray-300'
              }`}
            >
              <div
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  settings.stockAlerts ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between py-4 last:pb-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center">
                <Shield className="w-5 h-5 text-teal-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{t('superAdmin.settings.systemAlerts')}</p>
                <p className="text-xs text-gray-500">{t('superAdmin.settings.systemAlerts')}</p>
              </div>
            </div>
            <button
              onClick={() => updateSetting('systemAlerts', !settings.systemAlerts)}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                settings.systemAlerts ? 'bg-teal-600' : 'bg-gray-300'
              }`}
            >
              <div
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  settings.systemAlerts ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-teal-600" />
            <h2 className="text-lg font-semibold text-gray-900">{t('superAdmin.settings.maintenance')}</h2>
          </div>
        </div>
        <div className="p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">{t('superAdmin.settings.maintenanceMode')}</p>
              <p className="text-xs text-gray-500">
                {t('superAdmin.settings.maintenanceWarning')}
              </p>
            </div>
            <button
              onClick={() => updateSetting('maintenanceMode', !settings.maintenanceMode)}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                settings.maintenanceMode ? 'bg-red-500' : 'bg-gray-300'
              }`}
            >
              <div
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  settings.maintenanceMode ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {settings.maintenanceMode && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                {t('superAdmin.settings.maintenanceMode')}
              </label>
              <textarea
                value={settings.maintenanceMessage}
                onChange={(e) => updateSetting('maintenanceMessage', e.target.value)}
                rows={3}
                placeholder={t('superAdmin.settings.maintenanceWarning')}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm resize-none"
              />
            </div>
          )}

          {settings.maintenanceMode && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                <p className="text-sm text-amber-700 font-medium">
                  {t('superAdmin.settings.maintenanceWarning')}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
