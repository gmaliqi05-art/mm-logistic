import { useEffect, useState } from 'react';
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
import { supabase } from '../../lib/supabase';
import { logSaAudit } from '../../lib/saAudit';

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

const DEFAULTS: PlatformSettings = {
  platformName: 'MM Logistic',
  platformDescription: '',
  emailNotifications: true,
  smsNotifications: false,
  pushNotifications: true,
  deliveryAlerts: true,
  stockAlerts: true,
  systemAlerts: true,
  maintenanceMode: false,
  maintenanceMessage: '',
};

const KEY_MAP: Record<keyof PlatformSettings, string> = {
  platformName: 'platform_name',
  platformDescription: 'platform_description',
  emailNotifications: 'notif_email_enabled',
  smsNotifications: 'notif_sms_enabled',
  pushNotifications: 'notif_push_enabled',
  deliveryAlerts: 'alerts_delivery_enabled',
  stockAlerts: 'alerts_stock_enabled',
  systemAlerts: 'alerts_system_enabled',
  maintenanceMode: 'maintenance_mode',
  maintenanceMessage: 'maintenance_message',
};

const BOOLEAN_KEYS: Array<keyof PlatformSettings> = [
  'emailNotifications',
  'smsNotifications',
  'pushNotifications',
  'deliveryAlerts',
  'stockAlerts',
  'systemAlerts',
  'maintenanceMode',
];

function parseBool(value: string | null | undefined, fallback: boolean): boolean {
  if (value === null || value === undefined) return fallback;
  return value === 'true' || value === '1';
}

export default function SuperAdminSettings() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<PlatformSettings>(DEFAULTS);
  const [original, setOriginal] = useState<PlatformSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      setLoading(true);
      const keys = Object.values(KEY_MAP);
      const { data, error: fetchError } = await supabase
        .from('platform_settings')
        .select('key, value')
        .in('key', keys);
      if (fetchError) throw fetchError;

      const next: PlatformSettings = { ...DEFAULTS };
      const map = new Map((data ?? []).map((row) => [row.key, row.value]));

      (Object.keys(KEY_MAP) as Array<keyof PlatformSettings>).forEach((field) => {
        const dbKey = KEY_MAP[field];
        const raw = map.get(dbKey);
        if (BOOLEAN_KEYS.includes(field)) {
          (next[field] as boolean) = parseBool(raw, DEFAULTS[field] as boolean);
        } else if (raw !== undefined && raw !== null) {
          (next[field] as string) = raw;
        }
      });

      setSettings(next);
      setOriginal(next);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('common.errorSaving');
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    try {
      setSaving(true);
      setError(null);
      setSaved(false);

      const rows = (Object.keys(KEY_MAP) as Array<keyof PlatformSettings>).map((field) => ({
        key: KEY_MAP[field],
        value: BOOLEAN_KEYS.includes(field)
          ? (settings[field] as boolean ? 'true' : 'false')
          : String(settings[field] ?? ''),
        updated_at: new Date().toISOString(),
      }));

      const { error: upsertError } = await supabase
        .from('platform_settings')
        .upsert(rows, { onConflict: 'key' });

      if (upsertError) throw upsertError;

      const changed: Record<string, { from: unknown; to: unknown }> = {};
      (Object.keys(KEY_MAP) as Array<keyof PlatformSettings>).forEach((field) => {
        if (settings[field] !== original[field]) {
          changed[field] = { from: original[field], to: settings[field] };
        }
      });

      if (Object.keys(changed).length > 0) {
        await logSaAudit({
          action: 'settings_change',
          entity_type: 'platform_settings',
          entity_label: 'Platform Settings',
          details: { changed },
        });
      }

      setOriginal(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('common.errorSaving');
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  function updateSetting<K extends keyof PlatformSettings>(key: K, value: PlatformSettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
      </div>
    );
  }

  const renderToggle = (
    field: keyof PlatformSettings,
    icon: typeof Mail,
    label: string,
    description: string,
    danger = false
  ) => {
    const Icon = icon;
    const value = settings[field] as boolean;
    return (
      <div className="flex items-center justify-between py-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${danger ? 'bg-red-50 text-red-600' : 'bg-teal-50 text-teal-600'}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">{label}</p>
            <p className="text-xs text-gray-500">{description}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => updateSetting(field, !value as PlatformSettings[typeof field])}
          className={`relative w-12 h-6 rounded-full transition-colors ${
            value ? (danger ? 'bg-red-500' : 'bg-teal-600') : 'bg-gray-300'
          }`}
          aria-label={label}
        >
          <div
            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
              value ? 'translate-x-6' : 'translate-x-0'
            }`}
          />
        </button>
      </div>
    );
  };

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
        <div className="p-6 border-b border-gray-100 flex items-center gap-2">
          <SettingsIcon className="w-5 h-5 text-teal-600" />
          <h2 className="text-lg font-semibold text-gray-900">{t('common.information')}</h2>
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
        <div className="p-6 border-b border-gray-100 flex items-center gap-2">
          <Bell className="w-5 h-5 text-teal-600" />
          <h2 className="text-lg font-semibold text-gray-900">{t('superAdmin.settings.notifications')}</h2>
        </div>
        <div className="p-6 divide-y divide-gray-100">
          {renderToggle('emailNotifications', Mail, t('superAdmin.settings.emailNotif'), t('superAdmin.settings.emailNotif'))}
          {renderToggle('smsNotifications', MessageSquare, t('superAdmin.settings.smsNotif'), t('superAdmin.settings.smsNotif'))}
          {renderToggle('pushNotifications', Bell, t('superAdmin.settings.pushNotif'), t('superAdmin.settings.pushNotif'))}
          {renderToggle('deliveryAlerts', Shield, t('superAdmin.settings.deliveryAlerts'), t('superAdmin.settings.deliveryAlerts'))}
          {renderToggle('stockAlerts', Shield, t('superAdmin.settings.stockAlerts'), t('superAdmin.settings.stockAlerts'))}
          {renderToggle('systemAlerts', Shield, t('superAdmin.settings.systemAlerts'), t('superAdmin.settings.systemAlerts'))}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-6 border-b border-gray-100 flex items-center gap-2">
          <Server className="w-5 h-5 text-teal-600" />
          <h2 className="text-lg font-semibold text-gray-900">{t('superAdmin.settings.maintenance')}</h2>
        </div>
        <div className="p-6 space-y-5">
          {renderToggle('maintenanceMode', Server, t('superAdmin.settings.maintenanceMode'), t('superAdmin.settings.maintenanceWarning'), true)}

          {settings.maintenanceMode && (
            <>
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

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                <p className="text-sm text-amber-700 font-medium">
                  {t('superAdmin.settings.maintenanceWarning')}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
