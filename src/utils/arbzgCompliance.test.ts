import { describe, expect, it } from 'vitest';
import {
  assessArbzgDay,
  assessBreak,
  assessDailyHours,
  assessProhibitedDay,
  assessRest,
  hasArbzgViolation,
  requiredBreakForWorkMinutes,
} from './arbzgCompliance';

describe('requiredBreakForWorkMinutes', () => {
  it('is 0 when work is at or below 6h', () => {
    expect(requiredBreakForWorkMinutes(0)).toBe(0);
    expect(requiredBreakForWorkMinutes(6 * 60)).toBe(0);
  });

  it('is 30 between 6h and 9h', () => {
    expect(requiredBreakForWorkMinutes(6 * 60 + 1)).toBe(30);
    expect(requiredBreakForWorkMinutes(7 * 60)).toBe(30);
    expect(requiredBreakForWorkMinutes(9 * 60)).toBe(30);
  });

  it('is 45 above 9h', () => {
    expect(requiredBreakForWorkMinutes(9 * 60 + 1)).toBe(45);
    expect(requiredBreakForWorkMinutes(12 * 60)).toBe(45);
  });
});

describe('assessDailyHours (§3 ArbZG)', () => {
  it('is ok at or below 8h', () => {
    expect(assessDailyHours(0)).toBe('ok');
    expect(assessDailyHours(8 * 60)).toBe('ok');
  });

  it('is extended between 8h and 10h (legal if compensated)', () => {
    expect(assessDailyHours(8 * 60 + 1)).toBe('extended');
    expect(assessDailyHours(9 * 60)).toBe('extended');
    expect(assessDailyHours(10 * 60)).toBe('extended');
  });

  it('is over_limit above 10h', () => {
    expect(assessDailyHours(10 * 60 + 1)).toBe('over_limit');
    expect(assessDailyHours(12 * 60)).toBe('over_limit');
  });
});

describe('assessBreak (§4 ArbZG)', () => {
  it('is not_required at or below 6h', () => {
    expect(assessBreak(5 * 60, 0)).toBe('not_required');
    expect(assessBreak(6 * 60, 0)).toBe('not_required');
  });

  it('is missing when > 6h work and zero break', () => {
    expect(assessBreak(7 * 60, 0)).toBe('missing');
    expect(assessBreak(10 * 60, 0)).toBe('missing');
  });

  it('is short when break exists but below required threshold', () => {
    expect(assessBreak(7 * 60, 15)).toBe('short');
    expect(assessBreak(7 * 60, 29)).toBe('short');
    expect(assessBreak(10 * 60, 30)).toBe('short'); // 45 required > 9h
    expect(assessBreak(10 * 60, 44)).toBe('short');
  });

  it('is ok when break meets the threshold for the band', () => {
    expect(assessBreak(7 * 60, 30)).toBe('ok');
    expect(assessBreak(9 * 60, 30)).toBe('ok'); // exactly 30 at exactly 9h
    expect(assessBreak(10 * 60, 45)).toBe('ok');
    expect(assessBreak(10 * 60, 60)).toBe('ok'); // over-meeting is fine
  });
});

describe('assessRest (§5 ArbZG)', () => {
  it('is ok when previous shift ended at least 11h before next start', () => {
    const prev = new Date('2026-06-14T18:00:00Z');
    const next = new Date('2026-06-15T05:00:00Z'); // exactly 11h
    expect(assessRest(prev, next)).toBe('ok');
  });

  it('is short when rest is below 11h', () => {
    const prev = new Date('2026-06-14T22:00:00Z');
    const next = new Date('2026-06-15T05:00:00Z'); // 7h
    expect(assessRest(prev, next)).toBe('short');
  });

  it('is short when shifts overlap or are reversed', () => {
    const a = new Date('2026-06-14T22:00:00Z');
    const b = new Date('2026-06-14T21:00:00Z');
    expect(assessRest(a, b)).toBe('short');
  });

  it('is no_data when either timestamp is missing', () => {
    const t = new Date('2026-06-14T22:00:00Z');
    expect(assessRest(null, t)).toBe('no_data');
    expect(assessRest(t, null)).toBe('no_data');
    expect(assessRest(null, null)).toBe('no_data');
  });
});

describe('assessArbzgDay', () => {
  it('packs §3 and §4 into a single result', () => {
    const r = assessArbzgDay(9 * 60 + 30, 30);
    expect(r.daily).toBe('extended'); // 9.5h
    expect(r.breaks).toBe('short');   // 45 required, 30 given
    expect(r.requiredBreakMinutes).toBe(45);
    expect(r.workMinutes).toBe(9 * 60 + 30);
    expect(r.breakMinutes).toBe(30);
  });

  it('reports ok+not_required for a short day', () => {
    const r = assessArbzgDay(4 * 60, 0);
    expect(r.daily).toBe('ok');
    expect(r.breaks).toBe('not_required');
    expect(r.requiredBreakMinutes).toBe(0);
  });
});

describe('hasArbzgViolation', () => {
  it('is true for over_limit daily', () => {
    expect(hasArbzgViolation(assessArbzgDay(11 * 60, 60))).toBe(true);
  });

  it('is true for short or missing break', () => {
    expect(hasArbzgViolation(assessArbzgDay(8 * 60, 0))).toBe(true);
    expect(hasArbzgViolation(assessArbzgDay(8 * 60, 10))).toBe(true);
  });

  it('is false for an extended-but-compensated day with adequate break', () => {
    expect(hasArbzgViolation(assessArbzgDay(9 * 60, 45))).toBe(false);
  });

  it('is false for a compliant 8h day', () => {
    expect(hasArbzgViolation(assessArbzgDay(8 * 60, 30))).toBe(false);
  });
});

describe('assessProhibitedDay (§9 ArbZG)', () => {
  it('returns sunday when the date is a Sunday', () => {
    expect(assessProhibitedDay('2026-06-14', [])).toBe('sunday'); // Sun
    expect(assessProhibitedDay('2026-12-27', [])).toBe('sunday'); // Sun
  });

  it('returns holiday when the date matches a holiday string', () => {
    expect(assessProhibitedDay('2026-12-25', ['2026-12-25'])).toBe('holiday');
    expect(assessProhibitedDay('2026-05-01', ['2026-05-01', '2026-10-03'])).toBe('holiday');
  });

  it('prefers sunday over holiday when both apply', () => {
    // 2026-08-15 is a Saturday; let's pick a Sunday that is also a holiday.
    // 2027-12-26 is a Sunday and (in some German states) Boxing Day.
    expect(assessProhibitedDay('2027-12-26', ['2027-12-26'])).toBe('sunday');
  });

  it('returns ok for ordinary weekdays', () => {
    expect(assessProhibitedDay('2026-06-15', [])).toBe('ok'); // Mon
    expect(assessProhibitedDay('2026-06-18', ['2026-12-25'])).toBe('ok'); // Thu
  });

  it('handles empty / invalid date safely', () => {
    expect(assessProhibitedDay('', ['2026-12-25'])).toBe('ok');
    expect(assessProhibitedDay('not-a-date', [])).toBe('ok');
  });
});
