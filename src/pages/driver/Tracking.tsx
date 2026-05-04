import { useEffect, useState } from 'react';
import { MapPin, Navigation, AlertTriangle, CheckCircle2, Power } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useDriverLocationTracking } from '../../hooks/useDriverLocationTracking';
import { supabase } from '../../lib/supabase';

interface ActiveDelivery {
  id: string;
  note_number: string;
  status: string;
  delivery_address: string | null;
}

export default function DriverTracking() {
  const { profile } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [active, setActive] = useState<ActiveDelivery | null>(null);

  useEffect(() => {
    if (!profile?.id) return;
    const load = async () => {
      const { data } = await supabase
        .from('delivery_notes')
        .select('id, note_number, status, delivery_address')
        .eq('assigned_driver_id', profile.id)
        .eq('status', 'in_transit')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setActive((data as ActiveDelivery | null) ?? null);
    };
    void load();
  }, [profile?.id]);

  const state = useDriverLocationTracking({
    enabled,
    companyId: profile?.company_id,
    driverId: profile?.id,
    deliveryNoteId: active?.id ?? null,
  });

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
        onClick={() => setEnabled((e) => !e)}
        className={`w-full flex items-center justify-center gap-2 py-4 rounded-xl font-semibold text-white transition ${enabled ? 'bg-red-600 hover:bg-red-700' : 'bg-teal-600 hover:bg-teal-700'}`}
      >
        <Power className="w-5 h-5" />
        {enabled ? 'Stop sharing location' : 'Start sharing location'}
      </button>

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
    </div>
  );
}
