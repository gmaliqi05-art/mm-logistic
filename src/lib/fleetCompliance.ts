export type ExpiryLevel = 'expired' | 'critical' | 'warning' | 'soon' | 'ok' | 'none';

export function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

export function expiryLevel(dateStr: string | null | undefined): ExpiryLevel {
  const days = daysUntil(dateStr);
  if (days === null) return 'none';
  if (days < 0) return 'expired';
  if (days <= 7) return 'critical';
  if (days <= 30) return 'warning';
  if (days <= 90) return 'soon';
  return 'ok';
}

export const EXPIRY_CLASSES: Record<ExpiryLevel, string> = {
  expired: 'bg-rose-100 text-rose-800 border-rose-200',
  critical: 'bg-red-100 text-red-800 border-red-200',
  warning: 'bg-amber-100 text-amber-800 border-amber-200',
  soon: 'bg-yellow-50 text-yellow-800 border-yellow-200',
  ok: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  none: 'bg-slate-100 text-slate-600 border-slate-200',
};

export const EXPIRY_LABELS: Record<ExpiryLevel, string> = {
  expired: 'E skaduar',
  critical: 'Kritike',
  warning: 'Ne kohe',
  soon: 'Se shpejti',
  ok: 'OK',
  none: 'Mungon',
};

export const COMPLIANCE_TYPES: Record<string, string> = {
  license: 'Patenta',
  kod95: 'Kod 95 (BKrFQG)',
  adr: 'ADR',
  fahrerkarte: 'Fahrerkarte',
  gabelstapler: 'Gabelstapler',
  ladungssicherung: 'Ladungssicherung',
  erste_hilfe: 'Ndihme e Pare',
  g25: 'Ekzaminim G25',
  hu_tuv: 'HU/TUV',
  au: 'AU',
  uvv: 'UVV',
  sp: 'SP (Sicherheitsprufung)',
  tacho: 'Tachograph',
  haftpflicht: 'Haftpflicht',
  vollkasko: 'Vollkasko',
  teilkasko: 'Teilkasko',
  ladung: 'Ladungsversicherung',
  kfz_steuer: 'Kfz-Steuer',
};

export const LICENSE_CATEGORIES = ['AM', 'A1', 'A2', 'A', 'B', 'BE', 'C1', 'C1E', 'C', 'CE', 'D1', 'D1E', 'D', 'DE', 'T', 'L'] as const;
