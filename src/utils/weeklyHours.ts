/**
 * Weekly working-hours summary. The German road-transport sector follows
 * the EU Working Time Directive (2002/15/EC) which caps drivers at an
 * average of 48 hours per week (measured over a 4-month reference period)
 * with a hard ceiling of 60 hours in any single week.
 *
 * This module is the data layer for that compliance check. It is
 * intentionally framework-free so it can be unit-tested and reused on the
 * HR dashboard, the driver detail page, and future scheduling screens.
 */

export interface WorkHourRow {
  user_id: string;
  date: string;            // YYYY-MM-DD
  total_hours: number | null;
}

export interface UserWeeklyTotal {
  userId: string;
  totalHours: number;
  /** Highest tier reached this week. See WEEKLY_LIMIT_HARD / SOFT. */
  level: 'ok' | 'soft_over' | 'hard_over';
}

/** EU 2002/15/EC absolute weekly ceiling. */
export const WEEKLY_LIMIT_HARD = 60;

/** EU 2002/15/EC reference-period soft limit. Exceeding this single week is
 *  allowed as long as the 4-month average stays at 48h. We surface it
 *  anyway because consistently being above 48h is the warning sign. */
export const WEEKLY_LIMIT_SOFT = 48;

/** Returns the ISO date (YYYY-MM-DD) of the Monday of the given date's week. */
export function isoWeekStart(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = Sun
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

/** Returns the ISO date (YYYY-MM-DD) of the Sunday of the given date's week. */
export function isoWeekEnd(date: Date): string {
  const start = new Date(isoWeekStart(date));
  start.setDate(start.getDate() + 6);
  return start.toISOString().slice(0, 10);
}

/**
 * Aggregates work_hours_log rows by user for the week containing
 * `weekContaining`. Only rows whose date falls in that ISO week are
 * counted. Each user's total_hours are summed; null is treated as 0.
 *
 * Returns one record per user that has at least one row in the week,
 * sorted descending by totalHours (worst offender first), so the caller
 * can render a "top of the list" view without further work.
 */
export function summarizeWeeklyHours(
  rows: WorkHourRow[],
  weekContaining: Date = new Date(),
): UserWeeklyTotal[] {
  if (!rows || rows.length === 0) return [];
  const start = isoWeekStart(weekContaining);
  const end = isoWeekEnd(weekContaining);

  const totals = new Map<string, number>();
  for (const r of rows) {
    if (!r.date) continue;
    if (r.date < start || r.date > end) continue;
    const cur = totals.get(r.user_id) ?? 0;
    totals.set(r.user_id, cur + (r.total_hours ?? 0));
  }

  const out: UserWeeklyTotal[] = [];
  for (const [userId, totalHours] of totals.entries()) {
    let level: UserWeeklyTotal['level'] = 'ok';
    if (totalHours > WEEKLY_LIMIT_HARD) level = 'hard_over';
    else if (totalHours > WEEKLY_LIMIT_SOFT) level = 'soft_over';
    out.push({ userId, totalHours: Math.round(totalHours * 100) / 100, level });
  }
  out.sort((a, b) => b.totalHours - a.totalHours);
  return out;
}

/** Subset that breach a limit, for the dashboard banner. */
export function pickWeeklyBreaches(rows: UserWeeklyTotal[]): UserWeeklyTotal[] {
  return rows.filter((r) => r.level !== 'ok');
}
