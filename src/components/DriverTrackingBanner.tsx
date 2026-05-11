import { Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useDriverTracking } from '../contexts/DriverTrackingContext';

export default function DriverTrackingIndicator() {
  const { profile } = useAuth();
  const { enabled, state, isWithinWorkingWindow, overtimeUntil } = useDriverTracking();

  if (!profile?.id || profile.role !== 'driver') return null;

  const active = enabled && state.active;
  const lastSent = state.lastSentAt ? new Date(state.lastSentAt) : null;
  const lastSentLabel = lastSent ? lastSent.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

  let colorClasses = 'bg-gray-100 text-gray-400 ring-1 ring-gray-200';
  let title = 'GPS i fikur — klikoni per te aktivizuar';
  if (active) {
    colorClasses = 'bg-emerald-500 text-white ring-2 ring-emerald-200';
    title = `GPS aktiv${overtimeUntil ? ' (overtime)' : ''}${lastSentLabel ? ` · pika e fundit ${lastSentLabel}` : ''}`;
  } else if (isWithinWorkingWindow) {
    colorClasses = 'bg-amber-500 text-white ring-2 ring-amber-200';
    title = 'GPS i fikur — brenda orarit, aktivizoni ndjekjen';
  }

  return (
    <Link
      to="/driver/tracking"
      aria-label={title}
      title={title}
      className={`relative inline-flex items-center justify-center w-9 h-9 rounded-full transition-all hover:scale-105 ${colorClasses}`}
    >
      <MapPin className="w-[18px] h-[18px]" />
      {active && (
        <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400 ring-2 ring-white" />
        </span>
      )}
    </Link>
  );
}
