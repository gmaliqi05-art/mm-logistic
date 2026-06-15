/**
 * §3 / §4 / §5 ArbZG (German Working Time Act) compliance for
 * day-level work-hour entries.
 *
 * The HR module already enforces the EU weekly hour ceiling
 * (2002/15/EC, 48h soft / 60h hard — see weeklyHours.ts). German
 * employers also have to honour three tighter, *daily* rules:
 *
 *   §3 ArbZG — Maximum daily working time
 *     - 8 hours per working day.
 *     - Extendable to 10 hours if the average over 6 calendar months
 *       (or 24 weeks) stays at 8 hours. Anything above 10h is illegal
 *       except under specific exemptions we do not apply here.
 *
 *   §4 ArbZG — Mandatory break periods
 *     - > 6 hours work → at least 30 minutes of break.
 *     - > 9 hours work → at least 45 minutes of break.
 *     - The break may be split, but no single segment may be under
 *       15 minutes (we surface a soft warning when the total break is
 *       short but cannot validate split layout here — admins enter a
 *       total break_minutes).
 *
 *   §5 ArbZG — Minimum rest between shifts
 *     - At least 11 consecutive hours of rest after a working day.
 *     - In transport / agriculture the rest may be shortened to 10h
 *       once per day if compensated within 4 weeks; we don't
 *       implement that exception here.
 *
 * Penalties under §22 ArbZG reach €15,000 per violation, and §16
 * mandates the employer keep records that are "made available to the
 * supervisory authority" on request. These helpers power both the
 * UI guard (warn before save) and a future export to that record.
 *
 * This module is intentionally pure — no DB, no React, no i18n. Every
 * branch is unit-tested in arbzgCompliance.test.ts. Callers attach
 * their own translated messages to the returned status codes.
 */

/** Status from §3 ArbZG (daily hours) check. */
export type DailyHoursStatus =
  | 'ok'              // ≤ 8h
  | 'extended'        // 8h < hours ≤ 10h — legal if compensated
  | 'over_limit';     // > 10h — illegal absent specific exemption

/** Status from §4 ArbZG (break length) check. */
export type BreakStatus =
  | 'not_required'    // ≤ 6h work
  | 'ok'              // break length meets the threshold
  | 'short'           // some break but below the required minimum
  | 'missing';        // no break at all with > 6h work

/** Status from §5 ArbZG (rest between shifts) check. */
export type RestStatus =
  | 'ok'              // ≥ 11h rest before this shift
  | 'short'           // < 11h but > 0
  | 'no_data';        // no prior shift recorded so cannot evaluate

export interface ArbzgDailyAssessment {
  /** Net work minutes after subtracting breaks. */
  workMinutes: number;
  /** Break minutes recorded for the day. */
  breakMinutes: number;
  /** §3: daily ceiling status. */
  daily: DailyHoursStatus;
  /** §4: break-length status. */
  breaks: BreakStatus;
  /**
   * Minimum break in minutes that the law would require for this
   * work duration. Useful for "you need at least N minutes" UI hints.
   */
  requiredBreakMinutes: number;
}

const SIX_HOURS_MIN = 6 * 60;
const NINE_HOURS_MIN = 9 * 60;
const EIGHT_HOURS_MIN = 8 * 60;
const TEN_HOURS_MIN = 10 * 60;
const ELEVEN_HOURS_MIN = 11 * 60;

/** §4 ArbZG: how many minutes of break the law requires for the given net work. */
export function requiredBreakForWorkMinutes(workMinutes: number): number {
  if (workMinutes > NINE_HOURS_MIN) return 45;
  if (workMinutes > SIX_HOURS_MIN) return 30;
  return 0;
}

export function assessDailyHours(workMinutes: number): DailyHoursStatus {
  if (workMinutes > TEN_HOURS_MIN) return 'over_limit';
  if (workMinutes > EIGHT_HOURS_MIN) return 'extended';
  return 'ok';
}

export function assessBreak(workMinutes: number, breakMinutes: number): BreakStatus {
  const required = requiredBreakForWorkMinutes(workMinutes);
  if (required === 0) return 'not_required';
  if (breakMinutes <= 0) return 'missing';
  if (breakMinutes < required) return 'short';
  return 'ok';
}

/**
 * Single-day assessment combining §3 and §4. Net work is what was
 * actually worked (gross time minus breaks). Pass it pre-computed so
 * we don't tie this helper to the start/end string format used in the
 * UI.
 */
export function assessArbzgDay(
  workMinutes: number,
  breakMinutes: number,
): ArbzgDailyAssessment {
  return {
    workMinutes,
    breakMinutes,
    daily: assessDailyHours(workMinutes),
    breaks: assessBreak(workMinutes, breakMinutes),
    requiredBreakMinutes: requiredBreakForWorkMinutes(workMinutes),
  };
}

/**
 * §5 ArbZG: minimum 11h consecutive rest between the end of one
 * shift and the start of the next. Both inputs are `Date` instances
 * (or null when no prior shift is known — common for the first day
 * tracked for a new hire).
 */
export function assessRest(
  prevShiftEnd: Date | null,
  thisShiftStart: Date | null,
): RestStatus {
  if (!prevShiftEnd || !thisShiftStart) return 'no_data';
  const restMs = thisShiftStart.getTime() - prevShiftEnd.getTime();
  const restMinutes = Math.floor(restMs / 60_000);
  if (restMinutes <= 0) return 'short'; // overlapping or backwards times — treat as short
  if (restMinutes >= ELEVEN_HOURS_MIN) return 'ok';
  return 'short';
}

/** True when at least one §3/§4 rule is violated. */
export function hasArbzgViolation(a: ArbzgDailyAssessment): boolean {
  return a.daily === 'over_limit' || a.breaks === 'short' || a.breaks === 'missing';
}

/**
 * §9 ArbZG (Sun- und Feiertagsruhe). Work on Sundays and public
 * holidays is generally prohibited from 00:00 to 24:00. §10 lists
 * sectoral exceptions (transport, hospitality, agriculture, etc.) —
 * mm-logistic spans some of those — but the rule applies broadly and
 * §11 still requires:
 *   - 15 paid Sundays free per year (§11(2))
 *   - Compensatory rest day within 2 weeks for holiday work / 8
 *     weeks for Sunday work (§11(3))
 *
 * We can't decide here whether an employee is exempt under §10, so
 * the assessment is a *flag*: callers turn it into a soft confirm
 * dialog with the §10/§11 caveat spelled out.
 */
export type ProhibitedDayStatus = 'ok' | 'sunday' | 'holiday';

/**
 * Returns 'sunday' if the date falls on a Sunday, 'holiday' if it
 * matches one of the supplied YYYY-MM-DD holiday strings, else 'ok'.
 * Sunday takes precedence — a Sunday that is also a public holiday
 * is reported as 'sunday' to avoid masking the §11(2) 15-free-Sundays
 * rule under the §11(3) compensatory-rest rule.
 *
 * `dateStr` is YYYY-MM-DD; we parse it in UTC to keep the weekday
 * calculation independent of the user's local timezone. That matches
 * the rest of the HR module which stores `date` as a naked DATE (no
 * timezone).
 */
export function assessProhibitedDay(
  dateStr: string,
  holidays: ReadonlyArray<string>,
): ProhibitedDayStatus {
  if (!dateStr) return 'ok';
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return 'ok';
  if (d.getUTCDay() === 0) return 'sunday';
  if (holidays.includes(dateStr)) return 'holiday';
  return 'ok';
}
