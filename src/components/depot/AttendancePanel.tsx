import { useState, useEffect, useCallback } from 'react';
import { Clock, Play, LogOut, Loader2, CheckCircle2, RotateCcw, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';

interface DepotWorker {
  id: string;
  full_name: string | null;
  worker_category: string | null;
}

interface Shift {
  id: string;
  worker_id: string;
  clock_in: string;
  clock_out: string | null;
}

interface ShiftSettings {
  shift_start: string; // HH:MM
  shift_end: string;
}

function localToday(): string {
  return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
}

function nowHM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function tsFor(dateStr: string, hm: string): string {
  return new Date(`${dateStr}T${hm}:00`).toISOString();
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/**
 * Depot manager attendance control for repair (reparatur) work hours. Activating
 * a worker opens a `depot_work_shifts` row (clock-in at the standard shift
 * start); ending the day sets clock_out (e.g. a worker leaves at 11:00). This
 * bounds each worker's productive window so repair time reflects real hours.
 */
export default function AttendancePanel({ onChange }: { onChange?: () => void }) {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [workers, setWorkers] = useState<DepotWorker[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [settings, setSettings] = useState<ShiftSettings>({ shift_start: '07:00', shift_end: '17:00' });
  const [busy, setBusy] = useState<string | null>(null);
  const [endingId, setEndingId] = useState<string | null>(null);
  const [endTime, setEndTime] = useState(nowHM());

  const companyId = profile?.company_id ?? null;
  const depotId = profile?.depot_id ?? null;
  const day = localToday();

  const load = useCallback(async () => {
    if (!companyId) return;
    const wq = supabase
      .from('profiles')
      .select('id, full_name, worker_category')
      .eq('company_id', companyId)
      .eq('role', 'depot_worker')
      .eq('worker_category', 'reparature')
      .eq('is_active', true)
      .order('full_name');
    if (depotId) wq.eq('depot_id', depotId);

    const sq = supabase
      .from('depot_work_shifts')
      .select('id, worker_id, clock_in, clock_out')
      .eq('company_id', companyId)
      .eq('work_date', day);
    if (depotId) sq.eq('depot_id', depotId);

    const stq = supabase
      .from('depot_time_settings')
      .select('shift_start, shift_end')
      .eq('company_id', companyId)
      .maybeSingle();

    const [wRes, sRes, stRes] = await Promise.all([wq, sq, stq]);
    if (!wRes.error) setWorkers((wRes.data ?? []) as DepotWorker[]);
    if (!sRes.error) setShifts((sRes.data ?? []) as Shift[]);
    if (stRes.data) {
      setSettings({
        shift_start: (stRes.data.shift_start as string)?.slice(0, 5) || '07:00',
        shift_end: (stRes.data.shift_end as string)?.slice(0, 5) || '17:00',
      });
    }
  }, [companyId, depotId, day]);

  useEffect(() => { void load(); }, [load]);

  const shiftByWorker = new Map(shifts.map((s) => [s.worker_id, s]));

  async function activate(workerId: string) {
    if (!companyId || !depotId) return;
    setBusy(workerId);
    try {
      await supabase.from('depot_work_shifts').upsert(
        {
          company_id: companyId,
          depot_id: depotId,
          worker_id: workerId,
          work_date: day,
          clock_in: tsFor(day, settings.shift_start),
          clock_out: null,
          opened_by: profile!.id,
        },
        { onConflict: 'worker_id,work_date' },
      );
      await load();
      onChange?.();
    } finally {
      setBusy(null);
    }
  }

  async function activateAll() {
    if (!companyId || !depotId) return;
    const pending = workers.filter((w) => !shiftByWorker.get(w.id));
    if (pending.length === 0) return;
    setBusy('__all__');
    try {
      await supabase.from('depot_work_shifts').upsert(
        pending.map((w) => ({
          company_id: companyId,
          depot_id: depotId,
          worker_id: w.id,
          work_date: day,
          clock_in: tsFor(day, settings.shift_start),
          clock_out: null,
          opened_by: profile!.id,
        })),
        { onConflict: 'worker_id,work_date' },
      );
      await load();
      onChange?.();
    } finally {
      setBusy(null);
    }
  }

  async function endDay(workerId: string) {
    const s = shiftByWorker.get(workerId);
    if (!s) return;
    setBusy(workerId);
    try {
      await supabase
        .from('depot_work_shifts')
        .update({ clock_out: tsFor(day, endTime), closed_by: profile!.id, updated_at: new Date().toISOString() })
        .eq('id', s.id);
      setEndingId(null);
      await load();
      onChange?.();
    } finally {
      setBusy(null);
    }
  }

  async function reopen(workerId: string) {
    const s = shiftByWorker.get(workerId);
    if (!s) return;
    setBusy(workerId);
    try {
      await supabase
        .from('depot_work_shifts')
        .update({ clock_out: null, updated_at: new Date().toISOString() })
        .eq('id', s.id);
      await load();
      onChange?.();
    } finally {
      setBusy(null);
    }
  }

  const pendingCount = workers.filter((w) => !shiftByWorker.get(w.id)).length;

  return (
    <section className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
            <Clock className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-800">{t('depot.timeTracking.attendanceTitle')}</h2>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {t('depot.timeTracking.standardShift')}: {settings.shift_start} – {settings.shift_end}
            </p>
          </div>
        </div>
        {pendingCount > 0 && (
          <button
            onClick={activateAll}
            disabled={busy !== null || !depotId}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 flex-shrink-0"
          >
            {busy === '__all__' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Users className="w-3 h-3" />}
            {t('depot.timeTracking.activateAll')}
          </button>
        )}
      </div>

      {!depotId ? (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
          {t('depot.timeTracking.needDepot')}
        </p>
      ) : workers.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-3">{t('depot.timeTracking.noWorkers')}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {workers.map((w) => {
            const s = shiftByWorker.get(w.id);
            const working = s && !s.clock_out;
            const ended = s && s.clock_out;
            const isEnding = endingId === w.id;
            return (
              <div
                key={w.id}
                className={`flex items-center gap-2.5 p-2.5 rounded-lg border ${
                  working ? 'border-emerald-300 bg-emerald-50/60' : ended ? 'border-gray-200 bg-gray-50' : 'border-gray-200 bg-white'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    working ? 'bg-emerald-600 text-white' : ended ? 'bg-slate-300 text-white' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {ended ? <CheckCircle2 className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{w.full_name || '-'}</p>
                  <p className={`text-[11px] ${working ? 'text-emerald-700' : ended ? 'text-slate-500' : 'text-slate-400'}`}>
                    {working
                      ? `${t('depot.timeTracking.working')} · ${t('depot.timeTracking.since')} ${fmtTime(s!.clock_in)}`
                      : ended
                      ? `${t('depot.timeTracking.ended')} · ${fmtTime(s!.clock_in)}–${fmtTime(s!.clock_out!)}`
                      : t('depot.timeTracking.notStarted')}
                  </p>
                </div>

                {!s && (
                  <button
                    onClick={() => activate(w.id)}
                    disabled={busy !== null}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 flex-shrink-0"
                  >
                    {busy === w.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                    {t('depot.timeTracking.activate')}
                  </button>
                )}

                {working && !isEnding && (
                  <button
                    onClick={() => { setEndTime(nowHM()); setEndingId(w.id); }}
                    disabled={busy !== null}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-rose-700 bg-white border border-rose-200 rounded-lg hover:bg-rose-50 transition-colors disabled:opacity-50 flex-shrink-0"
                  >
                    <LogOut className="w-3 h-3" />
                    {t('depot.timeTracking.endDay')}
                  </button>
                )}

                {working && isEnding && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="border border-gray-300 rounded-lg px-1.5 py-1 text-xs w-24 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    />
                    <button
                      onClick={() => endDay(w.id)}
                      disabled={busy !== null}
                      className="inline-flex items-center px-2 py-1.5 text-xs font-semibold text-white bg-rose-600 rounded-lg hover:bg-rose-700 disabled:opacity-50"
                    >
                      {busy === w.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                    </button>
                    <button
                      onClick={() => setEndingId(null)}
                      className="px-1.5 py-1.5 text-xs text-gray-400 hover:text-gray-600"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {ended && (
                  <button
                    onClick={() => reopen(w.id)}
                    disabled={busy !== null}
                    title={t('depot.timeTracking.activate')}
                    className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-slate-500 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 flex-shrink-0"
                  >
                    {busy === w.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
