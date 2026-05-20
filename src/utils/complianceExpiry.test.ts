import { describe, expect, it } from 'vitest';
import { countComplianceExpirations } from './complianceExpiry';

function daysFromNow(d: number): string {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + d);
  return date.toISOString();
}

describe('countComplianceExpirations', () => {
  it('returns all zeros for empty input', () => {
    expect(countComplianceExpirations([])).toEqual({
      expired: 0,
      critical: 0,
      warning: 0,
      attention: 0,
    });
  });

  it('counts already-past dates as expired', () => {
    const res = countComplianceExpirations([
      { date: daysFromNow(-1) },
      { date: daysFromNow(-30) },
    ]);
    expect(res.expired).toBe(2);
    expect(res.critical).toBe(0);
    expect(res.warning).toBe(0);
    expect(res.attention).toBe(2);
  });

  it('counts 0..7 days as critical', () => {
    const res = countComplianceExpirations([
      { date: daysFromNow(0) },
      { date: daysFromNow(5) },
      { date: daysFromNow(7) },
    ]);
    expect(res.critical).toBe(3);
    expect(res.warning).toBe(0);
  });

  it('counts 8..30 days as warning', () => {
    const res = countComplianceExpirations([
      { date: daysFromNow(8) },
      { date: daysFromNow(15) },
      { date: daysFromNow(30) },
    ]);
    expect(res.warning).toBe(3);
    expect(res.critical).toBe(0);
  });

  it('ignores items beyond 30 days (soon / ok)', () => {
    const res = countComplianceExpirations([
      { date: daysFromNow(31) },
      { date: daysFromNow(180) },
    ]);
    expect(res.attention).toBe(0);
  });

  it('ignores items with missing date', () => {
    const res = countComplianceExpirations([
      { date: null },
      { date: undefined },
      { date: '' },
    ]);
    expect(res.attention).toBe(0);
  });

  it('attention sums expired + critical + warning', () => {
    const res = countComplianceExpirations([
      { date: daysFromNow(-1) },   // expired
      { date: daysFromNow(3) },    // critical
      { date: daysFromNow(20) },   // warning
      { date: daysFromNow(60) },   // soon, ignored
    ]);
    expect(res.expired).toBe(1);
    expect(res.critical).toBe(1);
    expect(res.warning).toBe(1);
    expect(res.attention).toBe(3);
  });
});
