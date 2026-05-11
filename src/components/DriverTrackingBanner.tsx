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

  let iconColor = 'text-gray-400';
  let title = 'GPS i fikur — klikoni per te aktivizuar';
  if (active) {
    iconColor = 'text-emerald-600';
    title = `GPS aktiv${overtimeUntil ? ' (overtime)' : ''}${lastSentLabel ? ` · pika e fundit ${lastSentLabel}` : ''}`;
  } else if (isWithinWorkingWindow) {
    iconColor = 'text-amber-600';
    title = 'GPS i fikur — brenda orarit, aktivizoni ndjekjen';
  }

  return (
    <Link
      to="/driver/tracking"
      aria-label={title}
      title={title}
      className="relative inline-flex items-center justify-center w-9 h-9 rounded-full hover:bg-gray-100 transition-colors"
    >
      <MapPin className={`w-[20px] h-[20px] ${iconColor}`} />
      {active && (
        <span className="absolute top-1 right-1 flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 ring-2 ring-white" />
        </span>
      )}
    </Link>
  );
}
