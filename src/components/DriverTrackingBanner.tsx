import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

const DISMISS_KEY = 'driver_tracking_banner_dismissed_until';

export default function DriverTrackingBanner() {
  const { profile } = useAuth();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!profile?.id || profile.role !== 'driver') {
      setShow(false);
      return;
    }
    let cancelled = false;

    async function check() {
      const dismissedUntil = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
      if (dismissedUntil > Date.now()) {
        if (!cancelled) setShow(false);
        return;
      }
      const { data: prof } = await supabase
        .from('profiles')
        .select('shift_start_hour, shift_end_hour, auto_tracking_enabled')
        .eq('id', profile!.id)
        .maybeSingle();
      const startH = (prof as { shift_start_hour?: number } | null)?.shift_start_hour ?? 7;
      const endH = (prof as { shift_end_hour?: number } | null)?.shift_end_hour ?? 17;
      const nowH = new Date().getHours();
      const inShift = nowH >= startH && nowH < endH;
      if (!inShift) {
        if (!cancelled) setShow(false);
        return;
      }
      const since = new Date(Date.now() - 20 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from('driver_locations')
        .select('id', { count: 'exact', head: true })
        .eq('driver_id', profile!.id)
        .gte('recorded_at', since);
      const active = (count ?? 0) > 0;
      if (!cancelled) setShow(!active);
    }

    void check();
    const id = window.setInterval(() => { void check(); }, 5 * 60 * 1000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [profile?.id, profile?.role]);

  if (!show) return null;

  return (
    <div className="sticky top-14 lg:top-16 z-[850] bg-amber-500 text-white shadow-md">
      <div className="max-w-5xl mx-auto flex items-center gap-3 px-4 py-2.5">
        <MapPin className="w-5 h-5 flex-shrink-0" />
        <div className="flex-1 min-w-0 text-sm">
          <div className="font-semibold">Tracking-u eshte i fikur</div>
          <div className="text-xs text-amber-50 truncate">Aktivizo ndjekjen e pozicionit per te vazhduar turnin.</div>
        </div>
        <Link
          to="/driver/tracking"
          className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-white text-amber-700 text-xs font-semibold hover:bg-amber-50"
        >
          Hap tracking-un
        </Link>
        <button
          onClick={() => {
            localStorage.setItem(DISMISS_KEY, String(Date.now() + 60 * 60 * 1000));
            setShow(false);
          }}
          className="flex-shrink-0 p-1 rounded hover:bg-amber-600"
          aria-label="Mbyll"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
