import { daysUntil, expiryLevel, EXPIRY_CLASSES } from '../../lib/fleetCompliance';

interface Props {
  date: string | null | undefined;
  showDate?: boolean;
  size?: 'sm' | 'md';
}

export default function ExpiryBadge({ date, showDate = true, size = 'md' }: Props) {
  const level = expiryLevel(date);
  const days = daysUntil(date);
  const cls = EXPIRY_CLASSES[level];

  const label = (() => {
    if (level === 'none') return 'Pa afat';
    if (level === 'expired') return `Skaduar ${Math.abs(days!)}d`;
    if (days === 0) return 'Sot!';
    if (days === 1) return '1 dite';
    return `${days} dite`;
  })();

  const pad = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border font-semibold ${pad} ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${
        level === 'expired' || level === 'critical' ? 'bg-red-500 animate-pulse' :
        level === 'warning' ? 'bg-amber-500' :
        level === 'soon' ? 'bg-yellow-500' :
        level === 'ok' ? 'bg-emerald-500' : 'bg-slate-400'
      }`} />
      {label}
      {showDate && date && <span className="text-slate-500 font-normal ml-0.5">• {new Date(date).toLocaleDateString('de-DE')}</span>}
    </span>
  );
}
