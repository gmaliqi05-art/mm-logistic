import { useState, useEffect } from 'react';
import { Loader2, Save, CheckCircle2, AlertTriangle, Mail, Bell, Clock, Zap, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';

interface Settings {
  auto_send_on_finalize: boolean;
  auto_reminder_enabled: boolean;
  reminder_day_0: boolean;
  reminder_day_7: boolean;
  reminder_day_14: boolean;
  reminder_day_30: boolean;
  default_locale: string;
  invoice_template_code: string;
  reminder_template_code: string;
  final_reminder_template_code: string;
  send_time_start: string;
  send_time_end: string;
  cc_admin_on_invoice: boolean;
  cc_email: string;
}

const DEFAULTS: Settings = {
  auto_send_on_finalize: false,
  auto_reminder_enabled: true,
  reminder_day_0: true,
  reminder_day_7: true,
  reminder_day_14: true,
  reminder_day_30: false,
  default_locale: 'sq',
  invoice_template_code: 'invoice_issued',
  reminder_template_code: 'invoice_overdue',
  final_reminder_template_code: 'invoice_final_reminder',
  send_time_start: '09:00',
  send_time_end: '17:00',
  cc_admin_on_invoice: false,
  cc_email: '',
};

interface TemplateOption {
  code: string;
  name: string;
}

export default function AutomationRules() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasRecord, setHasRecord] = useState(false);

  useEffect(() => {
    if (profile?.company_id) fetchData();
  }, [profile?.company_id]);

  async function fetchData() {
    setLoading(true);
    const companyId = profile!.company_id!;

    const [settingsRes, templatesRes] = await Promise.all([
      supabase.from('company_email_settings').select('*').eq('company_id', companyId).maybeSingle(),
      supabase.from('email_templates')
        .select('code, name')
        .or(`company_id.is.null,company_id.eq.${companyId}`)
        .in('audience', ['company', 'all'])
        .eq('is_active', true)
        .order('name'),
    ]);

    if (settingsRes.data) {
      setHasRecord(true);
      const d = settingsRes.data as any;
      setSettings({
        auto_send_on_finalize: d.auto_send_on_finalize ?? false,
        auto_reminder_enabled: d.auto_reminder_enabled ?? true,
        reminder_day_0: d.reminder_day_0 ?? true,
        reminder_day_7: d.reminder_day_7 ?? true,
        reminder_day_14: d.reminder_day_14 ?? true,
        reminder_day_30: d.reminder_day_30 ?? false,
        default_locale: d.default_locale ?? 'sq',
        invoice_template_code: d.invoice_template_code ?? 'invoice_issued',
        reminder_template_code: d.reminder_template_code ?? 'invoice_overdue',
        final_reminder_template_code: d.final_reminder_template_code ?? 'invoice_final_reminder',
        send_time_start: d.send_time_start ?? '09:00',
        send_time_end: d.send_time_end ?? '17:00',
        cc_admin_on_invoice: d.cc_admin_on_invoice ?? false,
        cc_email: d.cc_email ?? '',
      });
    }

    setTemplates((templatesRes.data ?? []) as TemplateOption[]);
    setLoading(false);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Auto-send on finalize */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Zap className="w-5 h-5 text-teal-700" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-gray-900">{t('common.dergimAutomatikIFatures')}</h3>
            <p className="text-sm text-gray-500 mt-0.5">{t('common.kurFinalizoniNjeFatureEmailI')}</p>
          </div>
        </div>

        <label className="flex items-center gap-3 cursor-pointer ml-14">
          <input
            type="checkbox"
            checked={settings.auto_send_on_finalize}
            onChange={(e) => setSettings(s => ({ ...s, auto_send_on_finalize: e.target.checked }))}
            className="w-5 h-5 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
          />
          <span className="text-sm font-medium text-gray-700">{t('common.dergoFaturenAutomatikishtMeEmailPas')}</span>
        </label>

        <div className="ml-14 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{t('common.templatePerFaturen')}</label>
            <select
              value={settings.invoice_template_code}
              onChange={(e) => setSettings(s => ({ ...s, invoice_template_code: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {templates.map(t => (
                <option key={t.code} value={t.code}>{t.name} ({t.code})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{t('common.gjuhaDefault')}</label>
            <select
              value={settings.default_locale}
              onChange={(e) => setSettings(s => ({ ...s, default_locale: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="sq">Shqip</option>
              <option value="de">{t('common.gjermanisht')}</option>
              <option value="en">{t('common.anglisht')}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Auto-reminders */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Bell className="w-5 h-5 text-amber-700" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-gray-900">Rikujtim automatik pagese</h3>
            <p className="text-sm text-gray-500 mt-0.5">{t('common.sistemetDergonAutomatikishtEmailRikujtimiPer')}</p>
          </div>
        </div>

        <label className="flex items-center gap-3 cursor-pointer ml-14">
          <input
            type="checkbox"
            checked={settings.auto_reminder_enabled}
            onChange={(e) => setSettings(s => ({ ...s, auto_reminder_enabled: e.target.checked }))}
            className="w-5 h-5 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
          />
          <span className="text-sm font-medium text-gray-700">
            Aktivizo rikujtimet automatike per pagese
          </span>
        </label>

        {settings.auto_reminder_enabled && (
          <div className="ml-14 space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">{t('common.kurTeDergohenRikujtimet')}</p>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.reminder_day_0}
                  onChange={(e) => setSettings(s => ({ ...s, reminder_day_0: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                />
                <span className="text-sm text-gray-700">Diten e afatit te pageses (Dita 0)</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.reminder_day_7}
                  onChange={(e) => setSettings(s => ({ ...s, reminder_day_7: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                />
                <span className="text-sm text-gray-700">7 dite pas afatit (+7 dite vonese)</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.reminder_day_14}
                  onChange={(e) => setSettings(s => ({ ...s, reminder_day_14: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                />
                <span className="text-sm text-gray-700">14 dite pas afatit (+14 dite vonese)</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.reminder_day_30}
                  onChange={(e) => setSettings(s => ({ ...s, reminder_day_30: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                />
                <span className="text-sm text-gray-700">30 dite pas afatit - Rikujtim i fundit (+30 dite vonese)</span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('common.templatePerRikujtimDita')}</label>
                <select
                  value={settings.reminder_template_code}
                  onChange={(e) => setSettings(s => ({ ...s, reminder_template_code: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  {templates.map(t => (
                    <option key={t.code} value={t.code}>{t.name} ({t.code})</option>
                  ))}
                </select>
              </div>
              {settings.reminder_day_30 && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('common.templatePerRikujtimTeFunditDita')}</label>
                  <select
                    value={settings.final_reminder_template_code}
                    onChange={(e) => setSettings(s => ({ ...s, final_reminder_template_code: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    {templates.map(t => (
                      <option key={t.code} value={t.code}>{t.name} ({t.code})</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Send Time Window */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Clock className="w-5 h-5 text-blue-700" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-gray-900">Ora e dergimit</h3>
            <p className="text-sm text-gray-500 mt-0.5">{t('common.emailEtAutomatikeDergohenVetemBrenda')}</p>
          </div>
        </div>

        <div className="ml-14 grid grid-cols-2 gap-4 max-w-sm">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nga ora</label>
            <input
              type="time"
              value={settings.send_time_start}
              onChange={(e) => setSettings(s => ({ ...s, send_time_start: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Deri ne ora</label>
            <input
              type="time"
              value={settings.send_time_end}
              onChange={(e) => setSettings(s => ({ ...s, send_time_end: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
        </div>
      </div>

      {/* CC Admin */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Mail className="w-5 h-5 text-slate-700" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-gray-900">Kopje per administratorin</h3>
            <p className="text-sm text-gray-500 mt-0.5">{t('common.merrniNjeKopjeCcTeCdo')}</p>
          </div>
        </div>

        <div className="ml-14 space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.cc_admin_on_invoice}
              onChange={(e) => setSettings(s => ({ ...s, cc_admin_on_invoice: e.target.checked }))}
              className="w-5 h-5 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
            />
            <span className="text-sm font-medium text-gray-700">{t('common.dergoKopjeTeEmailItTek')}</span>
          </label>

          {settings.cc_admin_on_invoice && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('common.adresaCc')}</label>
              <input
                type="email"
                value={settings.cc_email}
                onChange={(e) => setSettings(s => ({ ...s, cc_email: e.target.value }))}
                className="w-full sm:w-80 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="p.sh. admin@kompania-juaj.com"
              />
            </div>
          )}
        </div>
      </div>

      {/* Visual timeline */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Clock className="w-5 h-5 text-blue-700" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900">Rrjedha e faturimit</h3>
            <p className="text-sm text-gray-500 mt-0.5">Si funksionon procesi automatik i dergimit</p>
          </div>
        </div>

        <div className="ml-14 relative">
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />
          <div className="space-y-4">
            <TimelineStep
              icon={<FileText className="w-3.5 h-3.5" />}
              title={t('common.faturaKrijohetDheFinalizohet')}
              description={settings.auto_send_on_finalize
                ? 'Email me PDF dergohet automatikisht tek klienti'
                : 'Hapet dialogu per dergim manual te fatures'
              }
              active
            />
            {settings.auto_reminder_enabled && settings.reminder_day_0 && (
              <TimelineStep
                icon={<Bell className="w-3.5 h-3.5" />}
                title="Dita e afatit"
                description="Rikujtim i pare: Fatura ka arritur afatin e pageses"
                active
              />
            )}
            {settings.auto_reminder_enabled && settings.reminder_day_7 && (
              <TimelineStep
                icon={<Bell className="w-3.5 h-3.5" />}
                title="+7 dite pas afatit"
                description="Rikujtim i dyte: Fatura eshte 7 dite ne vonese"
                active
              />
            )}
            {settings.auto_reminder_enabled && settings.reminder_day_14 && (
              <TimelineStep
                icon={<Bell className="w-3.5 h-3.5" />}
                title="+14 dite pas afatit"
                description="Rikujtim i trete: Fatura eshte 14 dite ne vonese"
                active
              />
            )}
            {settings.auto_reminder_enabled && settings.reminder_day_30 && (
              <TimelineStep
                icon={<AlertTriangle className="w-3.5 h-3.5" />}
                title="+30 dite pas afatit"
                description="Rikujtim i fundit: Paralajmerim para veprimit ligjor"
                active
              />
            )}
            <TimelineStep
              icon={<CheckCircle2 className="w-3.5 h-3.5" />}
              title={t('common.faturaPaguhet')}
              description="Statusi ndryshohet ne 'paguar', ndalojne rikujtimet"
              active={false}
            />
          </div>
        </div>
      </div>

      {/* Save button */}
      <div className="flex items-center justify-end gap-3">
        {saved && (
          <span className="inline-flex items-center gap-1 text-sm text-emerald-600">
            <CheckCircle2 className="w-4 h-4" /> Rregullat u ruajten
          </span>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-medium text-sm disabled:opacity-60"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Ruaj Rregullat
        </button>
      </div>
    </div>
  );
}

function TimelineStep({ icon, title, description, active }: {
  icon: React.ReactNode;
  title: string;
  description: string;
  active: boolean;
}) {
  return (
    <div className="relative flex items-start gap-3 pl-0">
      <div className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
        active ? 'bg-teal-100 text-teal-700' : 'bg-gray-100 text-gray-400'
      }`}>
        {icon}
      </div>
      <div className="pt-0.5">
        <p className={`text-sm font-medium ${active ? 'text-gray-900' : 'text-gray-400'}`}>{title}</p>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
      </div>
    </div>
  );
}
