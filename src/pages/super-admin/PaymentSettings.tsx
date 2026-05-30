import { useState, useEffect } from 'react';
import {
  CreditCard,
  Save,
  Loader2,
  AlertTriangle,
  CheckCircle,
  Eye,
  EyeOff,
  X,
  Shield,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTranslation } from '../../i18n';

interface SettingRow {
  id: string;
  key: string;
  value: string;
  description: string;
}

const stripeFields = [
  { key: 'stripe_publishable_key', label: 'Publishable Key', secret: false, placeholder: 'pk_test_...' },
  { key: 'stripe_secret_key', label: 'Secret Key', secret: true, placeholder: 'sk_test_...' },
  { key: 'stripe_webhook_secret', label: 'Webhook Secret', secret: true, placeholder: 'whsec_...' },
];

const paypalFields = [
  { key: 'paypal_client_id', label: 'Client ID', secret: false, placeholder: 'PayPal Client ID' },
  { key: 'paypal_client_secret', label: 'Client Secret', secret: true, placeholder: 'PayPal Client Secret' },
  { key: 'paypal_mode', label: 'Mode', secret: false, placeholder: 'sandbox ose live' },
];

export default function PaymentSettings() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<Map<string, SettingRow>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [visibleSecrets, setVisibleSecrets] = useState<Set<string>>(new Set());
  const [paymentEnabled, setPaymentEnabled] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    try {
      setLoading(true);
      setError(null);
      const { data, error: err } = await supabase
        .from('platform_settings')
        .select('*')
        .in('key', [
          ...stripeFields.map((f) => f.key),
          ...paypalFields.map((f) => f.key),
          'payment_enabled',
        ]);
      if (err) throw err;

      const map = new Map<string, SettingRow>();
      (data ?? []).forEach((row: SettingRow) => map.set(row.key, row));
      setSettings(map);
      setPaymentEnabled(map.get('payment_enabled')?.value === 'true');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.errorLoading'));
    } finally {
      setLoading(false);
    }
  }

  function updateSetting(key: string, value: string) {
    setSettings((prev) => {
      const next = new Map(prev);
      const existing = next.get(key);
      if (existing) {
        next.set(key, { ...existing, value });
      }
      return next;
    });
    setSaved(false);
  }

  function toggleSecret(key: string) {
    setVisibleSecrets((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleSave() {
    try {
      setSaving(true);
      setError(null);
      setSaved(false);

      const updates = Array.from(settings.values()).map((row) => ({
        id: row.id,
        key: row.key,
        value: row.value,
        description: row.description,
        updated_at: new Date().toISOString(),
      }));

      const enabledSetting = settings.get('payment_enabled');
      if (enabledSetting) {
        const idx = updates.findIndex((u) => u.key === 'payment_enabled');
        if (idx >= 0) {
          updates[idx].value = paymentEnabled ? 'true' : 'false';
        }
      }

      for (const update of updates) {
        const { error: err } = await supabase
          .from('platform_settings')
          .update({ value: update.value, updated_at: update.updated_at })
          .eq('id', update.id);
        if (err) throw err;
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.errorSaving'));
    } finally {
      setSaving(false);
    }
  }

  function renderFieldGroup(
    title: string,
    icon: React.ReactNode,
    fields: typeof stripeFields,
    description: string
  ) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            {icon}
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
              <p className="text-sm text-gray-500 mt-0.5">{description}</p>
            </div>
          </div>
        </div>
        <div className="p-6 space-y-5">
          {fields.map((field) => {
            const row = settings.get(field.key);
            const value = row?.value ?? '';
            const isSecret = field.secret;
            const isVisible = visibleSecrets.has(field.key);

            return (
              <div key={field.key}>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {field.label}
                  {row?.description && (
                    <span className="ml-2 text-xs text-gray-400 font-normal">
                      ({row.description})
                    </span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type={isSecret && !isVisible ? 'password' : 'text'}
                    value={value}
                    onChange={(e) => updateSetting(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm pr-10 font-mono"
                  />
                  {isSecret && (
                    <button
                      type="button"
                      onClick={() => toggleSecret(field.key)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {isVisible ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  )}
                </div>
                {value && !isSecret && (
                  <div className="mt-1 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3 text-green-500" />
                    <span className="text-xs text-green-600">{t('common.active')}</span>
                  </div>
                )}
                {value && isSecret && (
                  <div className="mt-1 flex items-center gap-1">
                    <Shield className="w-3 h-3 text-green-500" />
                    <span className="text-xs text-green-600">{t('common.save')}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('nav.payments')}</h1>
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
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {saved && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
          <p className="text-green-700 text-sm font-medium">{t('common.saveChanges')}</p>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-teal-50 rounded-xl">
              <CreditCard className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">{t('nav.payments')}</p>
              <p className="text-xs text-gray-500">{t('superAdmin.settings.subtitle')}</p>
            </div>
          </div>
          <button
            onClick={() => {
              setPaymentEnabled(!paymentEnabled);
              setSaved(false);
            }}
            className={`relative w-14 h-7 rounded-full transition-colors ${
              paymentEnabled ? 'bg-teal-600' : 'bg-gray-300'
            }`}
          >
            <div
              className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${
                paymentEnabled ? 'translate-x-7' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {!paymentEnabled && (
          <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200">
            <p className="text-sm text-amber-700">
              {t('common.inactive')}
            </p>
          </div>
        )}
      </div>

      {renderFieldGroup(
        'Stripe',
        <div className="p-2.5 bg-slate-100 rounded-xl">
          <CreditCard className="w-5 h-5 text-slate-700" />
        </div>,
        stripeFields,
        t('nav.payments')
      )}

      {renderFieldGroup(
        'PayPal',
        <div className="p-2.5 bg-blue-50 rounded-xl">
          <span className="text-blue-600 font-bold text-sm block w-5 h-5 text-center leading-5">PP</span>
        </div>,
        paypalFields,
        'PayPal'
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-5 h-5 text-teal-600" />
          <h2 className="text-lg font-semibold text-gray-900">{t('common.information')}</h2>
        </div>
        <div className="space-y-3 text-sm text-gray-600">
          <p>
            Te gjitha celesat ruhen te enkriptuar ne database dhe nuk transmetohen kurre ne frontend.
          </p>
          <p>
            Per Stripe, perdorni celesat test (pk_test_/sk_test_) per provim dhe celesat live per prodhim.
          </p>
          <p>{t('common.sigurohuniQeWebhookUIStripe')}</p>
        </div>
      </div>
    </div>
  );
}
