import { describe, expect, it } from 'vitest';
import {
  forecastPalletReturns,
  getPalletReturnRisks,
  type PalletAccountBalance,
  type PalletReturnTxn,
} from './palletReturnForecast';

const ASOF = '2026-07-05T00:00:00.000Z';

function bal(overrides: Partial<PalletAccountBalance> & { pallet_account_id: string }): PalletAccountBalance {
  return { current_balance: 0, oldest_open_txn_age_days: null, ...overrides };
}

function txn(overrides: Partial<PalletReturnTxn> & { pallet_account_id: string }): PalletReturnTxn {
  return { direction: 'out', quantity: 1, transaction_date: ASOF, ...overrides };
}

function daysBefore(n: number): string {
  return new Date(Date.parse(ASOF) - n * 86_400_000).toISOString();
}

describe('forecastPalletReturns', () => {
  it('returns [] for no accounts', () => {
    expect(forecastPalletReturns([], [], { asOf: ASOF })).toEqual([]);
  });

  it('marks a zero (or negative) balance as settled', () => {
    const [f] = forecastPalletReturns([bal({ pallet_account_id: 'a', current_balance: 0 })], [], { asOf: ASOF });
    expect(f.status).toBe('settled');
    expect(f.daysToClearance).toBeNull();
  });

  it('marks an outstanding balance with no recent returns as stalled', () => {
    const [f] = forecastPalletReturns(
      [bal({ pallet_account_id: 'a', current_balance: 100 })],
      [],
      { asOf: ASOF },
    );
    expect(f.status).toBe('stalled');
    expect(f.avgDailyReturns).toBe(0);
    expect(f.daysToClearance).toBeNull();
  });

  it('projects clearance from return velocity (on_track within limitation)', () => {
    // 90 returned over the 90-day window => 1/day; balance 30 => 30 days to clear.
    const returns = Array.from({ length: 90 }, (_, i) => txn({ pallet_account_id: 'a', quantity: 1, transaction_date: daysBefore(i + 1) }));
    const [f] = forecastPalletReturns(
      [bal({ pallet_account_id: 'a', current_balance: 30, oldest_open_txn_age_days: 100 })],
      returns,
      { asOf: ASOF },
    );
    expect(f.avgDailyReturns).toBeCloseTo(1, 6);
    expect(f.daysToClearance).toBe(30);
    expect(f.expectedClearanceDate).toBe('2026-08-04');
    // limitation lapses in 365-100 = 265 days; 30 < 265 => on_track
    expect(f.daysUntilLimitation).toBe(265);
    expect(f.status).toBe('on_track');
  });

  it('flags at_risk when clearance falls after the §439 limitation lapses', () => {
    // 9 returned over 90 days => 0.1/day; balance 100 => 1000 days to clear.
    const returns = [txn({ pallet_account_id: 'a', quantity: 9, transaction_date: daysBefore(10) })];
    const [f] = forecastPalletReturns(
      [bal({ pallet_account_id: 'a', current_balance: 100, oldest_open_txn_age_days: 200 })],
      returns,
      { asOf: ASOF },
    );
    expect(f.avgDailyReturns).toBeCloseTo(0.1, 6);
    expect(f.daysToClearance).toBe(1000);
    expect(f.daysUntilLimitation).toBe(165); // 365 - 200
    expect(f.status).toBe('at_risk'); // 1000 > 165
  });

  it('only counts "out" (returns), never "in" deliveries, as return velocity', () => {
    const txns = [
      txn({ pallet_account_id: 'a', direction: 'in', quantity: 500, transaction_date: daysBefore(5) }),
      txn({ pallet_account_id: 'a', direction: 'out', quantity: 45, transaction_date: daysBefore(5) }),
    ];
    const [f] = forecastPalletReturns(
      [bal({ pallet_account_id: 'a', current_balance: 90, oldest_open_txn_age_days: 10 })],
      txns,
      { asOf: ASOF },
    );
    expect(f.avgDailyReturns).toBeCloseTo(0.5, 6); // 45/90, ignores the 500 'in'
    expect(f.daysToClearance).toBe(180);
  });

  it('excludes returns outside the window and after asOf', () => {
    const future = new Date(Date.parse(ASOF) + 5 * 86_400_000).toISOString();
    const txns = [
      txn({ pallet_account_id: 'a', quantity: 900, transaction_date: daysBefore(200) }), // before 90d window
      txn({ pallet_account_id: 'a', quantity: 900, transaction_date: future }), // after asOf
    ];
    const [f] = forecastPalletReturns(
      [bal({ pallet_account_id: 'a', current_balance: 50 })],
      txns,
      { asOf: ASOF },
    );
    expect(f.avgDailyReturns).toBe(0);
    expect(f.status).toBe('stalled');
  });

  it('honours a custom window', () => {
    // 30 returned over a 30-day window => 1/day; balance 10 => 10 days.
    const returns = Array.from({ length: 30 }, (_, i) => txn({ pallet_account_id: 'a', quantity: 1, transaction_date: daysBefore(i + 1) }));
    const [f] = forecastPalletReturns(
      [bal({ pallet_account_id: 'a', current_balance: 10 })],
      returns,
      { asOf: ASOF, windowDays: 30 },
    );
    expect(f.avgDailyReturns).toBeCloseTo(1, 6);
    expect(f.daysToClearance).toBe(10);
  });

  it('treats unknown age as no limitation cross-check (stays on_track)', () => {
    const returns = [txn({ pallet_account_id: 'a', quantity: 90, transaction_date: daysBefore(1) })];
    const [f] = forecastPalletReturns(
      [bal({ pallet_account_id: 'a', current_balance: 100, oldest_open_txn_age_days: null })],
      returns,
      { asOf: ASOF },
    );
    expect(f.daysUntilLimitation).toBeNull();
    expect(f.status).toBe('on_track');
  });

  it('sorts most-urgent first: stalled, then at_risk, then on_track, then settled', () => {
    const balances = [
      bal({ pallet_account_id: 'settled', current_balance: 0 }),
      bal({ pallet_account_id: 'ontrack', current_balance: 10, oldest_open_txn_age_days: 10 }),
      bal({ pallet_account_id: 'atrisk', current_balance: 100, oldest_open_txn_age_days: 300 }),
      bal({ pallet_account_id: 'stalled', current_balance: 50 }),
    ];
    const txns = [
      txn({ pallet_account_id: 'ontrack', quantity: 90, transaction_date: daysBefore(1) }),
      txn({ pallet_account_id: 'atrisk', quantity: 9, transaction_date: daysBefore(1) }),
    ];
    const order = forecastPalletReturns(balances, txns, { asOf: ASOF }).map((f) => f.pallet_account_id);
    expect(order).toEqual(['stalled', 'atrisk', 'ontrack', 'settled']);
  });

  it('throws on an invalid asOf', () => {
    expect(() => forecastPalletReturns([], [], { asOf: 'nope' })).toThrow(/invalid asOf/);
  });
});

describe('getPalletReturnRisks', () => {
  it('returns only stalled and at_risk accounts', () => {
    const balances = [
      bal({ pallet_account_id: 'settled', current_balance: -5 }),
      bal({ pallet_account_id: 'ontrack', current_balance: 10, oldest_open_txn_age_days: 10 }),
      bal({ pallet_account_id: 'atrisk', current_balance: 100, oldest_open_txn_age_days: 350 }),
      bal({ pallet_account_id: 'stalled', current_balance: 50 }),
    ];
    const txns = [
      txn({ pallet_account_id: 'ontrack', quantity: 90, transaction_date: daysBefore(1) }),
      txn({ pallet_account_id: 'atrisk', quantity: 9, transaction_date: daysBefore(1) }),
    ];
    const ids = getPalletReturnRisks(balances, txns, { asOf: ASOF }).map((f) => f.pallet_account_id).sort();
    expect(ids).toEqual(['atrisk', 'stalled']);
  });
});
