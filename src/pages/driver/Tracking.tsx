import { useEffect, useMemo, useRef, useState } from 'react';
import { MapPin, Navigation, AlertTriangle, CheckCircle2, Power, Clock, Route, Coffee, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useDriverLocationTracking } from '../../hooks/useDriverLocationTracking';
import { supabase } from '../../lib/supabase';
import { logger } from '../../utils/logger';

interface ActiveDelivery {
  id: string;
  note_number: string;
  status: string;
  delivery_address: string | null;
}

const AUTO_STOP_DELAY_MS = 10 * 60 * 1000;

export default function DriverTracking() {
  const { profile } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [active, setActive] = useState<ActiveDelivery | null>(null);
  const [shiftEndHour, setShiftEndHour] = useState(17);
  const [prompt, setPrompt] = useState<{ id: string; sent_at: string } | null>(null);
  const [nextPromptAt, setNextPromptAt] = useState<Date | null>(null);
  const [autoStopped, setAutoStopped] = useState(false);
  const autoStopTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!profile?.id) return;
    const load = async () => {
      const [{ data: delivery }, { data: prof }] = await Promise.all([
        supabase
          .from('delivery_notes')
          .select('id, note_number, status, delivery_address')
          .eq('assigned_driver_id', profile.id)
          .eq('status', 'in_transit')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.from('profiles').select('shift_end_hour').eq('id', profile.id).maybeSingle(),
      ]);
      setActive((delivery as ActiveDelivery | null) ?? null);
      if (prof && (prof as { shift_end_hour?: number }).shift_end_hour != null) {
        setShiftEndHour((prof as { shift_end_hour: number }).shift_end_hour);
      }
    };
    void load();
  }, [profile?.id]);

  const state = useDriverLocationTracking({
    enabled,
    companyId: profile?.company_id,
    driverId: profile?.id,
    deliveryNoteId: active?.id ?? null,
  });

  const nextShiftCheck = useMemo(() => {
    const d = new Date();
    const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), shiftEndHour, 0, 0, 0);
    if (end.getTime() <= d.getTime()) {
      const hour = d.getHours();
      const next = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour + 1, 0, 0, 0);
      return next;
    }
    return end;
  }, [shiftEndHour]);

  useEffect(() => {
    if (!enabled || !profile?.id || !profile.company_id) {
      setNextPromptAt(null);
      return;
    }
    setNextPromptAt(nextShiftCheck);
    const now = Date.now();
    const wait = nextShiftCheck.getTime() - now;
    if (wait <= 0) return;
    const timer = window.setTimeout(() => {
      void raisePrompt();
    }, wait);
    return () => window.clearTimeout(timer);
  }, [enabled, nextShiftCheck, profile?.id, profile?.company_id]);

  async function raisePrompt() {
    if (!profile?.id || !profile.company_id) return;
    try {
      const { data } = await supabase
        .from('tracking_prompts')
        .insert({
          company_id: profile.company_id,
          driver_id: profile.id,
          delivery_note_id: active?.id ?? null,
        })
        .select('id, sent_at')
        .maybeSingle();
      if (data) {
        setPrompt(data as { id: string; sent_at: string });
        autoStopTimer.current = window.setTimeout(() => {
          void respondPrompt('auto_stopped');
        }, AUTO_STOP_DELAY_MS);
      }
    } catch (err) {
      logger.warn('raise prompt failed', { error: err });
    }
  }

  async function respondPrompt(response: 'still_working' | 'finished' | 'break' | 'auto_stopped') {
    if (!prompt || !profile?.id) return;
    if (autoStopTimer.current) {
      window.clearTimeout(autoStopTimer.current);
      autoStopTimer.current = null;
    }
    try {
      await supabase
        .from('tracking_prompts')
        .update({ response, responded_at: new Date().toISOString() })
        .eq('id', prompt.id);

      await supabase
        .from('profiles')
        .update({ tracking_last_confirmed_at: new Date().toISOString() })
        .eq('id', profile.id);

      if (response === 'finished' || response === 'auto_stopped') {
        setEnabled(false);
        setAutoStopped(response === 'auto_stopped');
        if (active?.id) {
          await supabase
            .from('delivery_notes')
            .update({
              tracking_paused: true,
              tracking_auto_stopped_at: response === 'auto_stopped' ? new Date().toISOString() : null,
            })
            .eq('id', active.id);
        }
      } else if (response === 'break') {
        const nextHour = new Date(Date.now() + 30 * 60 * 1000);
        setNextPromptAt(nextHour);
      }
      setPrompt(null);
    } catch (err) {
      logger.warn('respond prompt failed', { error: err });
    }
  }

  const minutesRemaining = useMemo(() => {
    if (!prompt) return null;
    const elapsed = Date.now() - new Date(prompt.sent_at).getTime();
    const remain = AUTO_STOP_DELAY_MS - elapsed;
    return Math.max(0, Math.round(remain / 60000));
  }, [prompt, state.lastSentAt]);

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Live Tracking</h1>
        <p className="text-sm text-slate-600 mt-1">Share your GPS position with dispatch during active deliveries.</p>
      </div>

      {active ? (
        <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
          <div className="text-xs text-teal-800 font-semibold uppercase tracking-wide">Active delivery</div>
          <div className="text-lg font-bold text-slate-900 mt-1">{active.note_number}</div>
          {active.delivery_address && <div className="text-sm text-slate-600 mt-1">{active.delivery_address}</div>}
        </div>
      ) : (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-600">
          No active delivery in transit. You can still share location for testing.
        </div>
      )}

      <button
        onClick={() => { setEnabled((e) => !e); setAutoStopped(false); }}
        className={`w-full flex items-center justify-center gap-2 py-4 rounded-xl font-semibold text-white transition ${enabled ? 'bg-red-600 hover:bg-red-700' : 'bg-teal-600 hover:bg-teal-700'}`}
      >
        <Power className="w-5 h-5" />
        {enabled ? 'Stop sharing location' : 'Start sharing location'}
      </button>

      {enabled && nextPromptAt && (
        <div className="flex items-center gap-2 text-xs text-slate-600 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
          <Clock className="w-4 h-4 text-amber-600" />
          <span>Kontrolli tjeter i turnit: <strong>{nextPromptAt.toLocaleTimeString()}</strong></span>
        </div>
      )}

      {autoStopped && (
        <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>Tracking-u u ndalua automatikisht sepse nuk u pergjigjet kontrollit te turnit. Kompania u njoftua.</span>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">Status</span>
          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${state.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
            {state.active ? <CheckCircle2 className="w-3 h-3" /> : <Power className="w-3 h-3" />}
            {state.active ? 'Broadcasting' : 'Off'}
          </span>
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
              <div className="text-xs text-slate-500">Accuracy: ±{Math.round(state.accuracy)}m</div>
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
          <Route className="w-5 h-5" /> Planifiko rrugen me kosto minimale
        </span>
        <span className="text-xs opacity-70">Truck / HGV</span>
      </Link>

      {prompt && (
        <div className="fixed inset-0 z-[1100] flex items-end sm:items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 animate-in">
            <div className="flex items-start justify-between">
              <div>
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-1 rounded-full mb-2">
                  <Clock className="w-3 h-3" /> Kontroll i turnit
                </div>
                <h2 className="text-lg font-bold text-slate-900">A je ende ne pune?</h2>
                <p className="text-sm text-slate-600 mt-1">
                  Ora {shiftEndHour}:00 kaloi. Konfirmo qe te vazhdojme tracking-un. Pa pergjigje per {minutesRemaining} min, tracking-u ndalet automatikisht.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 mt-5">
              <button
                onClick={() => respondPrompt('still_working')}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-teal-600 text-white font-semibold hover:bg-teal-700"
              >
                <CheckCircle2 className="w-4 h-4" /> Po, vazhdoj
              </button>
              <button
                onClick={() => respondPrompt('break')}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-amber-100 text-amber-800 font-semibold hover:bg-amber-200"
              >
                <Coffee className="w-4 h-4" /> Pushim 30 min
              </button>
              <button
                onClick={() => respondPrompt('finished')}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-200 text-slate-800 font-semibold hover:bg-slate-300"
              >
                <X className="w-4 h-4" /> Mbarova, ndal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
