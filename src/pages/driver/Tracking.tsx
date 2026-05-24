import { useEffect, useMemo, useState } from 'react';
import { MapPin, Navigation, AlertTriangle, CheckCircle2, Power, Clock, Route, Zap, Timer } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useDriverTracking } from '../../contexts/DriverTrackingContext';
import { supabase } from '../../lib/supabase';
import { useTranslation } from '../../i18n';
import DriverNavigation from './Navigation';

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

export default function DriverTracking() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const {
    enabled,
    setEnabled,
    autoTracking,
    setAutoTracking,
    shiftStartHour,
    shiftEndHour,
    activeDelivery,
    state,
    autoStartNote,
    clearAutoStartNote,
    isWithinWorkingWindow,
    overtimeUntil,
    stopOvertime,
  } = useDriverTracking();

  const [trafficAlert, setTrafficAlert] = useState<{ id: string; delay_minutes: number; severity: string; message: string } | null>(null);
  const [now, setNow] = useState<number>(Date.now());
  const [view, setView] = useState<'tracking' | 'navigation'>('tracking');

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    const loadAlert = async () => {
      const { data } = await supabase
        .from('route_traffic_alerts')
        .select('id, delay_minutes, severity, message')
        .eq('driver_id', profile.id)
        .is('resolved_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) setTrafficAlert(data as typeof trafficAlert);
    };
    void loadAlert();
    const ch = supabase
      .channel(`driver_traffic_${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'route_traffic_alerts', filter: `driver_id=eq.${profile.id}` }, () => {
        void loadAlert();
      })
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(ch);
    };
  }, [profile?.id]);

  async function acknowledgeTraffic() {
    if (!trafficAlert) return;
    await supabase
      .from('route_traffic_alerts')
      .update({ acknowledged_at: new Date().toISOString() })
      .eq('id', trafficAlert.id);
    setTrafficAlert(null);
  }

  const overtimeRemaining = useMemo(() => {
    if (!overtimeUntil) return null;
    return overtimeUntil.getTime() - now;
  }, [overtimeUntil, now]);

  const statusLabel = useMemo(() => {
    if (!enabled) return t('driver.tracking.statusOff');
    if (overtimeUntil) {
      const tm = overtimeUntil.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return t('driver.tracking.statusActiveOvertime').replace('{time}', tm);
    }
    if (isWithinWorkingWindow) return t('driver.tracking.statusActiveOnSchedule');
    return t('driver.tracking.statusActiveManual');
  }, [enabled, overtimeUntil, isWithinWorkingWindow, t]);

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
        <button
          onClick={() => setView('tracking')}
          className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-colors ${
            view === 'tracking' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <MapPin className="w-4 h-4" />
          {t('driver.tracking.tabTracking')}
        </button>
        <button
          onClick={() => setView('navigation')}
          className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-colors ${
            view === 'navigation' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Navigation className="w-4 h-4" />
          {t('driver.tracking.tabNavigation')}
        </button>
      </div>

      {view === 'navigation' ? (
        <div className="-mx-4">
          <DriverNavigation />
        </div>
      ) : (
      <>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('driver.tracking.title')}</h1>
        <p className="text-sm text-slate-600 mt-1">{t('driver.tracking.subtitle')}</p>
      </div>

      {activeDelivery ? (
        <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
          <div className="text-xs text-teal-800 font-semibold uppercase tracking-wide">{t('driver.tracking.activeDelivery')}</div>
          <div className="text-lg font-bold text-slate-900 mt-1">{activeDelivery.note_number}</div>
          {activeDelivery.delivery_address && <div className="text-sm text-slate-600 mt-1">{activeDelivery.delivery_address}</div>}
        </div>
      ) : (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-600">
          {t('driver.tracking.noActiveDelivery')}
        </div>
      )}

      {trafficAlert && (
        <div className={`rounded-xl border p-4 flex items-start gap-3 ${
          trafficAlert.severity === 'high'
            ? 'bg-red-50 border-red-300 text-red-900'
            : trafficAlert.severity === 'moderate'
            ? 'bg-amber-50 border-amber-300 text-amber-900'
            : 'bg-amber-50 border-amber-200 text-amber-800'
        }`}>
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold">{t('driver.tracking.trafficAlertTitle').replace('{minutes}', String(trafficAlert.delay_minutes))}</div>
            <p className="text-xs mt-1 opacity-90">{trafficAlert.message}</p>
          </div>
          <button onClick={acknowledgeTraffic} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/80 hover:bg-white">
            {t('driver.tracking.acknowledge')}
          </button>
        </div>
      )}

      <button
        onClick={() => { setEnabled(!enabled); clearAutoStartNote(); }}
        className={`w-full flex items-center justify-center gap-2 py-4 rounded-xl font-semibold text-white transition ${enabled ? 'bg-red-600 hover:bg-red-700' : 'bg-teal-600 hover:bg-teal-700'}`}
      >
        <Power className="w-5 h-5" />
        {enabled ? t('driver.tracking.stopSharing') : t('driver.tracking.startSharing')}
      </button>

      {overtimeUntil && overtimeRemaining !== null && overtimeRemaining > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <Timer className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-amber-900">{t('driver.tracking.overtimeTitle')}</div>
            <p className="text-xs text-amber-800 mt-0.5">
              {t('driver.tracking.overtimeRemainingPrefix')} <strong>{formatCountdown(overtimeRemaining)}</strong>. {t('driver.tracking.overtimeRemainingSuffix')}
            </p>
          </div>
          <button
            onClick={() => { void stopOvertime(); }}
            className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white text-amber-800 hover:bg-amber-100 border border-amber-300"
          >
            {t('driver.tracking.stopNow')}
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 flex-1">
            <Zap className={`w-5 h-5 mt-0.5 ${autoTracking ? 'text-teal-600' : 'text-slate-400'}`} />
            <div>
              <div className="text-sm font-semibold text-slate-900">{t('driver.tracking.autoTracking')}</div>
              <p className="text-xs text-slate-500 mt-0.5">
                {t('driver.tracking.autoTrackingHint')
                  .replace('{start}', String(shiftStartHour))
                  .replace('{end}', String(shiftEndHour))}
              </p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={autoTracking}
              onChange={(e) => { void setAutoTracking(e.target.checked); }}
            />
            <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:bg-teal-600 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all" />
          </label>
        </div>
      </div>

      {autoStartNote && enabled && (
        <div className="flex items-start gap-2 text-xs text-teal-800 bg-teal-50 border border-teal-200 rounded-lg p-2.5">
          <Zap className="w-4 h-4 mt-0.5 flex-shrink-0 text-teal-600" />
          <span>{autoStartNote}</span>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">{t('driver.tracking.statusLabel')}</span>
          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${state.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
            {state.active ? <CheckCircle2 className="w-3 h-3" /> : <Power className="w-3 h-3" />}
            {statusLabel}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Clock className="w-3.5 h-3.5" />
          <span>{t('driver.tracking.workingHoursPrefix')} {shiftStartHour}:00 - {shiftEndHour}:00</span>
        </div>
        {state.error && (
          <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{state.error}</span>
          </div>
        )}
        {state.lat !== null && state.lng !== null && (
          <>
            <div className="flex items-center gap-2 text-sm text-slate-700">
              <MapPin className="w-4 h-4 text-slate-400" />
              <span className="font-mono">{state.lat.toFixed(5)}, {state.lng.toFixed(5)}</span>
            </div>
            {state.accuracy !== null && (
              <div className="text-xs text-slate-500">{t('driver.tracking.accuracy')}: {Math.round(state.accuracy)}m</div>
            )}
            {state.speed !== null && (
              <div className="flex items-center gap-2 text-sm text-slate-700">
                <Navigation className="w-4 h-4 text-slate-400" />
                <span>{Math.round((state.speed ?? 0) * 3.6)} km/h</span>
              </div>
            )}
            {state.lastSentAt && (
              <div className="text-[11px] text-slate-400">{t('driver.tracking.lastSent')}: {new Date(state.lastSentAt).toLocaleTimeString()}</div>
            )}
          </>
        )}
      </div>

      <Link
        to="/driver/route-planner"
        className="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition"
      >
        <span className="flex items-center gap-2 font-semibold">
          <Route className="w-5 h-5" /> {t('driver.tracking.planRoute')}
        </span>
        <span className="text-xs opacity-70">HGV</span>
      </Link>
      </>
      )}
    </div>
  );
}
