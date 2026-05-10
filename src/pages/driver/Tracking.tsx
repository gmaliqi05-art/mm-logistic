import { useEffect, useMemo, useState } from 'react';
import { MapPin, Navigation, AlertTriangle, CheckCircle2, Power, Clock, Route, Zap, Timer } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useDriverTracking } from '../../contexts/DriverTrackingContext';
import { supabase } from '../../lib/supabase';

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
    if (!enabled) return 'I fikur';
    if (overtimeUntil) return `Aktiv (overtime deri ne ${overtimeUntil.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`;
    if (isWithinWorkingWindow) return 'Aktiv (brenda orarit)';
    return 'Aktiv (manuale, jashte orarit)';
  }, [enabled, overtimeUntil, isWithinWorkingWindow]);

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Live Tracking</h1>
        <p className="text-sm text-slate-600 mt-1">Gjurmimi vazhdon edhe kur kalon ne faqe tjeter, per sa kohe eshte i ndezur.</p>
      </div>

      {activeDelivery ? (
        <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
          <div className="text-xs text-teal-800 font-semibold uppercase tracking-wide">Active delivery</div>
          <div className="text-lg font-bold text-slate-900 mt-1">{activeDelivery.note_number}</div>
          {activeDelivery.delivery_address && <div className="text-sm text-slate-600 mt-1">{activeDelivery.delivery_address}</div>}
        </div>
      ) : (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-600">
          Nuk ka dergese aktive ne rruge. Mund te ndash pozicionin per testim.
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
            <div className="text-sm font-semibold">Trafik ne rrugen tende vonese rreth {trafficAlert.delay_minutes} min</div>
            <p className="text-xs mt-1 opacity-90">{trafficAlert.message}</p>
          </div>
          <button onClick={acknowledgeTraffic} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/80 hover:bg-white">
            Pranoj
          </button>
        </div>
      )}

      <button
        onClick={() => { setEnabled(!enabled); clearAutoStartNote(); }}
        className={`w-full flex items-center justify-center gap-2 py-4 rounded-xl font-semibold text-white transition ${enabled ? 'bg-red-600 hover:bg-red-700' : 'bg-teal-600 hover:bg-teal-700'}`}
      >
        <Power className="w-5 h-5" />
        {enabled ? 'Ndal ndarjen e pozicionit' : 'Fillo ndarjen e pozicionit'}
      </button>

      {overtimeUntil && overtimeRemaining !== null && overtimeRemaining > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <Timer className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-amber-900">Gjurmimi ne kohe shtese</div>
            <p className="text-xs text-amber-800 mt-0.5">
              Mbeten edhe <strong>{formatCountdown(overtimeRemaining)}</strong>. Pas saj do te ndalet dhe do te pyetesh perseri.
            </p>
          </div>
          <button
            onClick={() => { void stopOvertime(); }}
            className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white text-amber-800 hover:bg-amber-100 border border-amber-300"
          >
            Ndal tani
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 flex-1">
            <Zap className={`w-5 h-5 mt-0.5 ${autoTracking ? 'text-teal-600' : 'text-slate-400'}`} />
            <div>
              <div className="text-sm font-semibold text-slate-900">Tracking automatik</div>
              <p className="text-xs text-slate-500 mt-0.5">
                Kur eshte i ndezur, tracking-u fillon automatikisht cdo dite ne ora <strong>{shiftStartHour}:00</strong>. Ne ora <strong>{shiftEndHour}:00</strong> do te pyetesh nese deshiron te vazhdosh dhe per sa kohe.
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
          <span className="text-sm font-medium text-slate-700">Status</span>
          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${state.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
            {state.active ? <CheckCircle2 className="w-3 h-3" /> : <Power className="w-3 h-3" />}
            {statusLabel}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Clock className="w-3.5 h-3.5" />
          <span>Orari i punes: {shiftStartHour}:00 - {shiftEndHour}:00</span>
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
              <div className="text-xs text-slate-500">Accuracy: {Math.round(state.accuracy)}m</div>
            )}
            {state.speed !== null && (
              <div className="flex items-center gap-2 text-sm text-slate-700">
                <Navigation className="w-4 h-4 text-slate-400" />
                <span>{Math.round((state.speed ?? 0) * 3.6)} km/h</span>
              </div>
            )}
            {state.lastSentAt && (
              <div className="text-[11px] text-slate-400">Last sent: {new Date(state.lastSentAt).toLocaleTimeString()}</div>
            )}
          </>
        )}
      </div>

      <Link
        to="/driver/route-planner"
        className="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition"
      >
        <span className="flex items-center gap-2 font-semibold">
          <Route className="w-5 h-5" /> Planifiko rrugen per kamiona
        </span>
        <span className="text-xs opacity-70">HGV</span>
      </Link>
    </div>
  );
}
