import { useState, useEffect, useCallback } from 'react';
import { Clock, Loader2, Save, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';

interface Settings {
  shift_start: string;
  shift_end: string;
  lunch_start: string;
  lunch_end: string;
  morning_break_start: string;
  morning_break_end: string;
  afternoon_break_start: string;
  afternoon_break_end: string;
  daily_allowance_min: number;
  workdays: number[];
}

const DEFAULTS: Settings = {
  shift_start: '07:00',
  shift_end: '17:00',
  lunch_start: '12:00',
  lunch_end: '13:00',
  morning_break_start: '09:00',
  morning_break_end: '09:15',
  afternoon_break_start: '15:00',
  afternoon_break_end: '15:15',
  daily_allowance_min: 20,
  workdays: [1, 2, 3, 4, 5],
};

// Postgres `time` comes back as HH:MM:SS; <input type="time"> wants HH:MM.
const hm = (v: string | null | undefined) => (v ? v.slice(0, 5) : '');

function netProductiveMin(s: Settings): number {
  const mins = (a: string, b: string) =>
    (new Date(`1970-01-01T${b}:00`).getTime() - new Date(`1970-01-01T${a}:00`).getTime()) / 60000;
  const shift = mins(s.shift_start, s.shift_end);
  const breaks =
    mins(s.lunch_start, s.lunch_end) +
    mins(s.morning_break_start, s.morning_break_end) +
    mins(s.afternoon_break_start, s.afternoon_break_end);
  return Math.max(0, Math.round(shift - breaks - (s.daily_allowance_min || 0)));
}

const DOW = [1, 2, 3, 4, 5, 6, 7];

export default function DepotTimeSettingsCard() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [s, setS] = useState<Settings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const companyId = profile?.company_id ?? null;
  // ISO dow (Mon=1 … Sun=7); short labels are locale-neutral abbreviations.
  const dowLabels: Record<number, string> = {
    1: 'Hën', 2: 'Mar', 3: 'Mër', 4: 'Enj', 5: 'Pre', 6: 'Sht', 7: 'Die',
  };

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const { data } = await supabase
      .from('depot_time_settings')
      .select('*')
      .eq('company_id', companyId)
      .maybeSingle();
    if (data) {
      setS({
        shift_start: hm(data.shift_start),
        shift_end: hm(data.shift_end),
        lunch_start: hm(data.lunch_start),
        lunch_end: hm(data.lunch_end),
        morning_break_start: hm(data.morning_break_start),
        morning_break_end: hm(data.morning_break_end),
        afternoon_break_start: hm(data.afternoon_break_start),
        afternoon_break_end: hm(data.afternoon_break_end),
        daily_allowance_min: data.daily_allowance_min ?? 20,
        workdays: (data.workdays ?? [1, 2, 3, 4, 5]) as number[],
      });
    }
    setLoading(false);
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    if (!companyId) return;
    setSaving(true);
    setSaved(false);
    const { error } = await supabase.from('depot_time_settings').upsert(
      {
        company_id: companyId,
        ...s,
        workdays: [...s.workdays].sort((a, b) => a - b),
        updated_at: new Date().toISOString(),
        updated_by: profile!.id,
      },
      { onConflict: 'company_id' },
    );
    setSaving(false);
    if (!error) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  }

  const toggleDay = (d: number) =>
    setS((prev) => ({
      ...prev,
      workdays: prev.workdays.includes(d)
        ? prev.workdays.filter((x) => x !== d)
        : [...prev.workdays, d],
    }));

  const field = (label: string, key: keyof Settings, key2?: keyof Settings) => (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="time"
          value={s[key] as string}
          onChange={(e) => setS({ ...s, [key]: e.target.value })}
          className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
        />
        {key2 && (
          <>
            <span className="text-gray-400 text-sm">–</span>
            <input
              type="time"
              value={s[key2] as string}
              onChange={(e) => setS({ ...s, [key2]: e.target.value })}
              className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            />
          </>
        )}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="py-8 flex items-center justify-center text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Clock className="w-5 h-5 text-teal-600" />
        <div>
          <h3 className="text-base font-semibold text-gray-900">{t('depot.timeTracking.settingsTitle')}</h3>
          <p className="text-xs text-gray-500">{t('depot.timeTracking.settingsSubtitle')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {field(t('depot.timeTracking.shiftStart'), 'shift_start')}
        {field(t('depot.timeTracking.shiftEnd'), 'shift_end')}
        {field(t('depot.timeTracking.lunch'), 'lunch_start', 'lunch_end')}
        {field(t('depot.timeTracking.morningBreak'), 'morning_break_start', 'morning_break_end')}
        {field(t('depot.timeTracking.afternoonBreak'), 'afternoon_break_start', 'afternoon_break_end')}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{t('depot.timeTracking.allowance')}</label>
          <input
            type="number"
            min={0}
            value={s.daily_allowance_min}
            onChange={(e) => setS({ ...s, daily_allowance_min: Math.max(0, parseInt(e.target.value || '0', 10) || 0) })}
            className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm w-28 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">{t('depot.timeTracking.workdays')}</label>
        <div className="flex flex-wrap gap-1.5">
          {DOW.map((d) => {
            const on = s.workdays.includes(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(d)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  on ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {dowLabels[d]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between bg-teal-50 border border-teal-100 rounded-lg px-4 py-2.5">
        <span className="text-sm text-teal-800">{t('depot.timeTracking.netProductive')}</span>
        <span className="text-lg font-bold text-teal-700">
          {Math.floor(netProductiveMin(s) / 60)}h {netProductiveMin(s) % 60}m
        </span>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {t('depot.timeTracking.save')}
        </button>
        {saved && (
          <span className="inline-flex items-center gap-1.5 text-sm text-green-700">
            <CheckCircle2 className="w-4 h-4" />
            {t('depot.timeTracking.saved')}
          </span>
        )}
      </div>
    </div>
  );
}
