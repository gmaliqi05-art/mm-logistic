import { expiryLevel, type ExpiryLevel } from '../lib/fleetCompliance';

export interface ExpiringItem {
  /** ISO date string. */
  date: string | null | undefined;
}

export interface ExpiryCounts {
  /** Already past due. */
  expired: number;
  /** Expires within 7 days. */
  critical: number;
  /** Expires within 8-30 days. */
  warning: number;
  /** Sum of expired + critical + warning - i.e. anything that needs attention soon. */
  attention: number;
}

const EMPTY: ExpiryCounts = { expired: 0, critical: 0, warning: 0, attention: 0 };

/**
 * Counts fleet/driver compliance dates by urgency.
 *
 * Buckets are derived from the shared `expiryLevel` helper so this stays
 * in sync with the Compliance page (lib/fleetCompliance.ts):
 *   expired  = already past due
 *   critical = within 7 days
 *   warning  = within 8..30 days
 *   soon/ok  = > 30 days  (not counted)
 *   none     = missing date  (not counted)
 *
 * `attention` is the total of expired + critical + warning. That is the
 * single number we surface on the dashboard banner.
 */
export function countComplianceExpirations(items: ExpiringItem[]): ExpiryCounts {
  if (!items || items.length === 0) return { ...EMPTY };
  const counts: ExpiryCounts = { ...EMPTY };
  for (const item of items) {
    const level: ExpiryLevel = expiryLevel(item.date ?? null);
    if (level === 'expired') counts.expired++;
    else if (level === 'critical') counts.critical++;
    else if (level === 'warning') counts.warning++;
  }
  counts.attention = counts.expired + counts.critical + counts.warning;
  return counts;
}
