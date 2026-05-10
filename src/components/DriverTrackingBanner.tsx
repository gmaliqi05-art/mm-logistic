import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MapPin, X, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useDriverTracking } from '../contexts/DriverTrackingContext';

const DISMISS_KEY = 'driver_tracking_banner_dismissed_until';

export default function DriverTrackingBanner() {
  const { profile } = useAuth();
  const { enabled, state, isWithinWorkingWindow, shiftStartHour, shiftEndHour } = useDriverTracking();
  const location = useLocation();
  const [dismissed, setDismissed] = useState<number>(() => Number(localStorage.getItem(DISMISS_KEY) ?? 0));

  if (!profile?.id || profile.role !== 'driver') return null;

  const onTrackingPage = location.pathname.startsWith('/driver/tracking');

  if (enabled && state.active) {
    if (onTrackingPage) return null;
    const lastSent = state.lastSentAt ? new Date(state.lastSentAt) : null;
    const lastSentLabel = lastSent ? lastSent.toLocaleTimeString() : '';
    return (
      <Link
        to="/driver/tracking"
        className="sticky top-14 lg:top-16 z-[850] block bg-emerald-600 text-white shadow-md hover:bg-emerald-700 transition-colors"
      >
        <div className="max-w-5xl mx-auto flex items-center gap-3 px-4 py-2 text-sm">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-200 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
          </span>
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span className="font-semibold">GPS aktiv</span>
          {lastSentLabel && <span className="text-emerald-50 text-xs">· pika e fundit {lastSentLabel}</span>}
          <span className="ml-auto text-xs text-emerald-100 hidden sm:inline">Kontrollo</span>
        </div>
      </Link>
    );
  }

  const dismissedUntil = dismissed;
  const isDismissed = dismissedUntil > Date.now();
  if (!isWithinWorkingWindow || enabled || isDismissed) return null;

  return (
    <div className="sticky top-14 lg:top-16 z-[850] bg-amber-500 text-white shadow-md">
      <div className="max-w-5xl mx-auto flex items-center gap-3 px-4 py-2.5">
        <MapPin className="w-5 h-5 flex-shrink-0" />
        <div className="flex-1 min-w-0 text-sm">
          <div className="font-semibold">Tracking-u eshte i fikur</div>
          <div className="text-xs text-amber-50 truncate">
            Brenda orarit te punes ({shiftStartHour}:00 - {shiftEndHour}:00). Aktivizo ndjekjen e pozicionit.
          </div>
        </div>
        <Link
          to="/driver/tracking"
          className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-white text-amber-700 text-xs font-semibold hover:bg-amber-50"
        >
          Hap tracking-un
        </Link>
        <button
          onClick={() => {
            const until = Date.now() + 60 * 60 * 1000;
            localStorage.setItem(DISMISS_KEY, String(until));
            setDismissed(until);
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
