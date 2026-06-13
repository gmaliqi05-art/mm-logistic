import { describe, expect, it } from 'vitest';
import {
  daysBetween,
  daysUntilLimitation,
  formatReconciliationPeriod,
  limitationStatus,
  needsReconciliation,
  LIMITATION_THRESHOLDS,
} from './palletReconciliation';

describe('daysBetween', () => {
  it('returns null when from is missing', () => {
    expect(daysBetween(null)).toBeNull();
    expect(daysBetween(undefined)).toBeNull();
  });

  it('returns 0 for the same day', () => {
    const d = new Date('2026-06-13T12:00:00Z');
    expect(daysBetween(d, d)).toBe(0);
  });

  it('counts whole days forward', () => {
    expect(daysBetween('2026-06-01', new Date('2026-06-10T00:00:00Z'))).toBe(9);
  });

  it('returns negative when the second date is before the first', () => {
    expect(daysBetween('2026-06-10', new Date('2026-06-01T00:00:00Z'))).toBe(-9);
  });

  it('returns null for unparseable input', () => {
    expect(daysBetween('not a date')).toBeNull();
  });
});

describe('limitationStatus', () => {
  it('returns ok for null / undefined (no open transactions)', () => {
    expect(limitationStatus(null)).toBe('ok');
    expect(limitationStatus(undefined)).toBe('ok');
  });

  it('returns ok below the warning threshold', () => {
    expect(limitationStatus(0)).toBe('ok');
    expect(limitationStatus(LIMITATION_THRESHOLDS.warning - 1)).toBe('ok');
  });

  it('returns warning at the warning threshold (300 days)', () => {
    expect(limitationStatus(LIMITATION_THRESHOLDS.warning)).toBe('warning');
    expect(limitationStatus(LIMITATION_THRESHOLDS.critical - 1)).toBe('warning');
  });

  it('returns critical at the critical threshold (330 days)', () => {
    expect(limitationStatus(LIMITATION_THRESHOLDS.critical)).toBe('critical');
    expect(limitationStatus(LIMITATION_THRESHOLDS.expired - 1)).toBe('critical');
  });

  it('returns expired at the §439 HGB 1-year mark (365 days) and beyond', () => {
    expect(limitationStatus(LIMITATION_THRESHOLDS.expired)).toBe('expired');
    expect(limitationStatus(500)).toBe('expired');
  });
});

describe('daysUntilLimitation', () => {
  it('returns null when there is no open transaction', () => {
    expect(daysUntilLimitation(null)).toBeNull();
  });

  it('returns positive days for fresh accounts', () => {
    expect(daysUntilLimitation(30)).toBe(335);
  });

  it('returns zero on the exact day of limitation', () => {
    expect(daysUntilLimitation(365)).toBe(0);
  });

  it('returns negative once limitation has lapsed', () => {
    expect(daysUntilLimitation(400)).toBe(-35);
  });
});

describe('needsReconciliation', () => {
  it('is false for ok / no open transactions', () => {
    expect(needsReconciliation(null)).toBe(false);
    expect(needsReconciliation(100)).toBe(false);
  });

  it('is true once the warning threshold is hit', () => {
    expect(needsReconciliation(LIMITATION_THRESHOLDS.warning)).toBe(true);
    expect(needsReconciliation(LIMITATION_THRESHOLDS.critical)).toBe(true);
    expect(needsReconciliation(LIMITATION_THRESHOLDS.expired)).toBe(true);
    expect(needsReconciliation(800)).toBe(true);
  });
});

describe('formatReconciliationPeriod', () => {
  it('formats ISO yyyy-mm-dd into dd.mm.yyyy', () => {
    expect(formatReconciliationPeriod('2026-01-01', '2026-12-31'))
      .toBe('01.01.2026 – 31.12.2026');
  });

  it('falls back to raw strings for non-ISO inputs', () => {
    expect(formatReconciliationPeriod('Q1 2026', 'Q4 2026'))
      .toBe('Q1 2026 – Q4 2026');
  });
});
