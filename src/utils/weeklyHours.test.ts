import { describe, expect, it } from 'vitest';
import {
  isoWeekEnd,
  isoWeekStart,
  pickWeeklyBreaches,
  summarizeWeeklyHours,
  WEEKLY_LIMIT_HARD,
  WEEKLY_LIMIT_SOFT,
  type WorkHourRow,
} from './weeklyHours';

describe('isoWeekStart / isoWeekEnd', () => {
  it('returns Monday for a Wednesday', () => {
    const wed = new Date('2026-05-20T10:00:00Z'); // Wednesday
    expect(isoWeekStart(wed)).toBe('2026-05-18'); // Monday
    expect(isoWeekEnd(wed)).toBe('2026-05-24');   // Sunday
  });

  it('keeps Monday as Monday', () => {
    const mon = new Date('2026-05-18T00:00:00Z');
    expect(isoWeekStart(mon)).toBe('2026-05-18');
  });

  it('snaps Sunday back to the previous Monday', () => {
    const sun = new Date('2026-05-24T23:59:59Z');
    expect(isoWeekStart(sun)).toBe('2026-05-18');
    expect(isoWeekEnd(sun)).toBe('2026-05-24');
  });
});

describe('summarizeWeeklyHours', () => {
  const monday = new Date('2026-05-18T12:00:00Z');

  function row(user_id: string, date: string, total_hours: number | null): WorkHourRow {
    return { user_id, date, total_hours };
  }

  it('returns [] for empty input', () => {
    expect(summarizeWeeklyHours([], monday)).toEqual([]);
  });

  it('sums hours within the ISO week', () => {
    const rows = [
      row('u1', '2026-05-18', 10),
      row('u1', '2026-05-19', 5),
      row('u1', '2026-05-22', 3),
    ];
    expect(summarizeWeeklyHours(rows, monday)).toEqual([
      { userId: 'u1', totalHours: 18, level: 'ok' },
    ]);
  });

  it('ignores rows outside the week', () => {
    const rows = [
      row('u1', '2026-05-17', 10), // Sunday before
      row('u1', '2026-05-18', 5),
      row('u1', '2026-05-25', 10), // Monday after
    ];
    expect(summarizeWeeklyHours(rows, monday)).toEqual([
      { userId: 'u1', totalHours: 5, level: 'ok' },
    ]);
  });

  it('treats null total_hours as 0', () => {
    const rows = [
      row('u1', '2026-05-18', null),
      row('u1', '2026-05-19', 4),
    ];
    expect(summarizeWeeklyHours(rows, monday)).toEqual([
      { userId: 'u1', totalHours: 4, level: 'ok' },
    ]);
  });

  it('flags soft_over above 48h and hard_over above 60h', () => {
    const rows = [
      row('u1', '2026-05-18', 30),
      row('u1', '2026-05-19', 20), // 50 -> soft_over
      row('u2', '2026-05-18', 35),
      row('u2', '2026-05-19', 30), // 65 -> hard_over
      row('u3', '2026-05-18', 40), // 40 -> ok
    ];
    const out = summarizeWeeklyHours(rows, monday);
    expect(out).toEqual([
      { userId: 'u2', totalHours: 65, level: 'hard_over' },
      { userId: 'u1', totalHours: 50, level: 'soft_over' },
      { userId: 'u3', totalHours: 40, level: 'ok' },
    ]);
  });

  it('boundary: exactly 48h is ok, 48.01 is soft_over', () => {
    const rows = [
      row('u1', '2026-05-18', WEEKLY_LIMIT_SOFT),
      row('u2', '2026-05-18', WEEKLY_LIMIT_SOFT + 0.01),
    ];
    const out = summarizeWeeklyHours(rows, monday);
    expect(out.find((r) => r.userId === 'u1')?.level).toBe('ok');
    expect(out.find((r) => r.userId === 'u2')?.level).toBe('soft_over');
  });

  it('boundary: exactly 60h is soft_over, 60.01 is hard_over', () => {
    const rows = [
      row('u1', '2026-05-18', WEEKLY_LIMIT_HARD),
      row('u2', '2026-05-18', WEEKLY_LIMIT_HARD + 0.01),
    ];
    const out = summarizeWeeklyHours(rows, monday);
    expect(out.find((r) => r.userId === 'u1')?.level).toBe('soft_over');
    expect(out.find((r) => r.userId === 'u2')?.level).toBe('hard_over');
  });
});

describe('pickWeeklyBreaches', () => {
  it('returns only soft_over and hard_over rows', () => {
    const rows = [
      { userId: 'a', totalHours: 65, level: 'hard_over' as const },
      { userId: 'b', totalHours: 50, level: 'soft_over' as const },
      { userId: 'c', totalHours: 30, level: 'ok' as const },
    ];
    expect(pickWeeklyBreaches(rows)).toEqual([
      { userId: 'a', totalHours: 65, level: 'hard_over' },
      { userId: 'b', totalHours: 50, level: 'soft_over' },
    ]);
  });
});
