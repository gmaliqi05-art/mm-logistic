/**
 * Pallet account reconciliation + §439 HGB limitation alarm helpers.
 *
 * German Handelsrecht: pallet receivables under an open exchange
 * relationship prescribe in **1 year** (§439 HGB) for ordinary
 * negligence. The clock starts on the day the claim arises — for an
 * EPAL Palettenkonto, that is the transaction date.
 *
 * The clock is **reset** when a Saldenbestätigung is signed by both
 * parties (§212 BGB acknowledgement). After that, the account
 * effectively converts to a regular open-account claim with the
 * 3-year §195 BGB limitation, restricted to transactions dated AFTER
 * the confirmed period.
 *
 * This module is the single source of truth for "how close to
 * limitation is this account?" The DB exposes the raw age in days via
 * `v_pallet_account_aging`; this helper turns it into a status enum
 * the UI can render as a coloured badge.
 *
 * Thresholds (calendar days since the oldest unreconciled transaction):
 *   - >= 365  → 'expired'  (claim may be time-barred — escalate now)
 *   - >= 330  → 'critical' (under one month left — push for sign-off)
 *   - >= 300  → 'warning'  (under two months — schedule reminder)
 *   - <  300  → 'ok'
 *   - null    → 'ok'       (no open transactions, nothing to alarm on)
 *
 * The numbers are intentionally conservative. Operators can tighten
 * them later, but loosening below 300 days risks missing the §195 BGB
 * 90-day window most German tax advisors recommend for signature
 * follow-up.
 */

import type { PalletAccountAgingStatus } from '../types';

export const LIMITATION_THRESHOLDS = {
  warning: 300,
  critical: 330,
  expired: 365,
} as const;

/**
 * Days elapsed between `from` and `to`. Both can be a Date or an ISO
 * string. Returns null if either is missing. Always non-negative for
 * forward-in-time pairs.
 */
export function daysBetween(from: string | Date | null | undefined, to: string | Date = new Date()): number | null {
  if (!from) return null;
  const fromDate = typeof from === 'string' ? new Date(from) : from;
  const toDate = typeof to === 'string' ? new Date(to) : to;
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) return null;
  const ms = toDate.getTime() - fromDate.getTime();
  return Math.floor(ms / 86_400_000);
}

/**
 * Maps the raw age (days since the oldest unreconciled transaction) to
 * a status bucket. Accepts null (no open transactions = nothing to
 * alarm on) and returns 'ok'.
 */
export function limitationStatus(ageDays: number | null | undefined): PalletAccountAgingStatus {
  if (ageDays == null) return 'ok';
  if (ageDays >= LIMITATION_THRESHOLDS.expired) return 'expired';
  if (ageDays >= LIMITATION_THRESHOLDS.critical) return 'critical';
  if (ageDays >= LIMITATION_THRESHOLDS.warning) return 'warning';
  return 'ok';
}

/**
 * Days remaining until the §439 HGB 1-year clock expires. Negative
 * values indicate the limitation has already lapsed. null when there
 * is no open transaction to track.
 */
export function daysUntilLimitation(ageDays: number | null | undefined): number | null {
  if (ageDays == null) return null;
  return LIMITATION_THRESHOLDS.expired - ageDays;
}

/**
 * True when the operator should be prompted to send / chase a new
 * Saldenbestätigung. Anything >= 'warning' qualifies.
 */
export function needsReconciliation(ageDays: number | null | undefined): boolean {
  const s = limitationStatus(ageDays);
  return s === 'warning' || s === 'critical' || s === 'expired';
}

/**
 * Map a (period_start, period_end) pair onto a human-readable label.
 * Used by the upcoming reconciliation panel and the
 * Saldenbestätigung PDF.
 */
export function formatReconciliationPeriod(periodStart: string, periodEnd: string): string {
  // ISO yyyy-mm-dd → dd.mm.yyyy (German convention, matches the rest
  // of the EU-side UI). Falling back to ISO for any non-standard input.
  const fmt = (s: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return s;
    return `${m[3]}.${m[2]}.${m[1]}`;
  };
  return `${fmt(periodStart)} – ${fmt(periodEnd)}`;
}
