import { describe, expect, it } from 'vitest';
import type { Stock as StockType, StockMovement } from '../types';
import { forecastStockRunouts, getStockRunoutWarnings } from './stockForecast';

const ASOF = '2026-07-05T00:00:00.000Z';

function stock(overrides: Partial<StockType>): StockType {
  return {
    id: 'stock-1',
    company_id: 'co-1',
    depot_id: 'd-1',
    category_id: 'c-1',
    category_product_id: null,
    quantity: 0,
    condition: 'good',
    updated_at: '',
    created_at: '',
    ...overrides,
  } as StockType;
}

let mvSeq = 0;
function move(overrides: Partial<StockMovement>): StockMovement {
  mvSeq += 1;
  return {
    id: `m-${mvSeq}`,
    company_id: 'co-1',
    depot_id: 'd-1',
    category_id: 'c-1',
    category_product_id: null,
    movement_type: 'exit',
    quantity: 1,
    condition_before: 'good',
    condition_after: 'good',
    notes: '',
    performed_by: 'u-1',
    created_at: ASOF,
    ...overrides,
  } as StockMovement;
}

/** N days before ASOF as an ISO string. */
function daysBefore(n: number): string {
  return new Date(Date.parse(ASOF) - n * 86_400_000).toISOString();
}

describe('forecastStockRunouts', () => {
  it('returns [] for no stock and no movements', () => {
    expect(forecastStockRunouts([], [], { asOf: ASOF })).toEqual([]);
  });

  it('predicts a linear run-out from steady exits', () => {
    // 60 units on hand, 300 exited over the 30-day window => 10/day => 6 days.
    const stocks = [stock({ quantity: 60 })];
    const movements = Array.from({ length: 30 }, (_, i) =>
      move({ quantity: 10, created_at: daysBefore(i + 1) }),
    );
    const [f] = forecastStockRunouts(stocks, movements, { asOf: ASOF });
    expect(f.currentQuantity).toBe(60);
    expect(f.avgDailyOutflow).toBeCloseTo(10, 6);
    expect(f.daysToRunout).toBe(6);
    expect(f.runoutDate).toBe('2026-07-11');
    expect(f.severity).toBe('critical');
  });

  it('nets entries against exits so restocking cancels consumption', () => {
    const stocks = [stock({ quantity: 100 })];
    const movements = [
      move({ quantity: 300, movement_type: 'exit', created_at: daysBefore(2) }),
      move({ quantity: 300, movement_type: 'entry', created_at: daysBefore(1) }),
    ];
    const [f] = forecastStockRunouts(stocks, movements, { asOf: ASOF });
    expect(f.avgDailyOutflow).toBe(0);
    expect(f.daysToRunout).toBeNull();
    expect(f.severity).toBe('ok');
  });

  it('reports net restocking (entries > exits) as ok, not a run-out', () => {
    const stocks = [stock({ quantity: 50 })];
    const movements = [move({ quantity: 90, movement_type: 'entry', created_at: daysBefore(3) })];
    const [f] = forecastStockRunouts(stocks, movements, { asOf: ASOF });
    expect(f.avgDailyOutflow).toBeLessThan(0);
    expect(f.daysToRunout).toBeNull();
    expect(f.severity).toBe('ok');
  });

  it('marks zero on-hand as depleted even without movements', () => {
    const [f] = forecastStockRunouts([stock({ quantity: 0 })], [], { asOf: ASOF });
    expect(f.severity).toBe('depleted');
    expect(f.daysToRunout).toBe(0);
    expect(f.runoutDate).toBe('2026-07-05');
  });

  it('ignores repair movements (reclassification, not consumption)', () => {
    const stocks = [stock({ quantity: 50 })];
    const movements = [move({ quantity: 40, movement_type: 'repair', created_at: daysBefore(1) })];
    const [f] = forecastStockRunouts(stocks, movements, { asOf: ASOF });
    expect(f.avgDailyOutflow).toBe(0);
    expect(f.severity).toBe('ok');
  });

  it('excludes movements outside the window', () => {
    const stocks = [stock({ quantity: 30 })];
    const movements = [
      move({ quantity: 300, created_at: daysBefore(45) }), // older than 30d window
      move({ quantity: 300, created_at: daysBefore(3) }), // future-safe, in window
    ];
    const withDefault = forecastStockRunouts(stocks, movements, { asOf: ASOF })[0];
    // Only the in-window 300 counts => 10/day => 3 days.
    expect(withDefault.avgDailyOutflow).toBeCloseTo(10, 6);
    expect(withDefault.daysToRunout).toBe(3);
  });

  it('excludes movements dated after asOf', () => {
    const stocks = [stock({ quantity: 30 })];
    const future = new Date(Date.parse(ASOF) + 3 * 86_400_000).toISOString();
    const movements = [move({ quantity: 300, created_at: future })];
    const [f] = forecastStockRunouts(stocks, movements, { asOf: ASOF });
    expect(f.avgDailyOutflow).toBe(0);
    expect(f.severity).toBe('ok');
  });

  it('honours custom window and severity thresholds', () => {
    const stocks = [stock({ quantity: 70 })];
    // 70 exited over a 7-day window => 10/day => 7 days to run out.
    const movements = Array.from({ length: 7 }, (_, i) =>
      move({ quantity: 10, created_at: daysBefore(i + 1) }),
    );
    const [f] = forecastStockRunouts(stocks, movements, {
      asOf: ASOF,
      windowDays: 7,
      criticalDays: 3,
      warningDays: 10,
    });
    expect(f.daysToRunout).toBe(7);
    expect(f.severity).toBe('warning'); // 7 > criticalDays(3) but <= warningDays(10)
  });

  it('aggregates across product variants and conditions within a (depot, category)', () => {
    const stocks = [
      stock({ id: 's1', category_product_id: 'p1', condition: 'good', quantity: 20 }),
      stock({ id: 's2', category_product_id: 'p2', condition: 'damaged', quantity: 40 }),
    ];
    const movements = [move({ quantity: 60, created_at: daysBefore(2) })]; // 2/day over 30d
    const [f] = forecastStockRunouts(stocks, movements, { asOf: ASOF });
    expect(f.currentQuantity).toBe(60);
    expect(f.avgDailyOutflow).toBeCloseTo(2, 6);
    expect(f.daysToRunout).toBe(30);
  });

  it('separates distinct (depot, category) keys and sorts most-urgent first', () => {
    const stocks = [
      stock({ id: 's1', depot_id: 'dA', category_id: 'c1', quantity: 100 }),
      stock({ id: 's2', depot_id: 'dB', category_id: 'c1', quantity: 10 }),
    ];
    const movements = [
      move({ depot_id: 'dA', category_id: 'c1', quantity: 30, created_at: daysBefore(1) }), // 1/day => 100d
      move({ depot_id: 'dB', category_id: 'c1', quantity: 300, created_at: daysBefore(1) }), // 10/day => 1d
    ];
    const result = forecastStockRunouts(stocks, movements, { asOf: ASOF });
    expect(result).toHaveLength(2);
    expect(result[0].depot_id).toBe('dB'); // most urgent first
    expect(result[0].severity).toBe('critical');
    expect(result[1].depot_id).toBe('dA');
    expect(result[1].severity).toBe('ok');
  });

  it('throws on an invalid asOf', () => {
    expect(() => forecastStockRunouts([], [], { asOf: 'not-a-date' })).toThrow(/invalid asOf/);
  });
});

describe('getStockRunoutWarnings', () => {
  it('returns only depleted/critical/warning locations', () => {
    const stocks = [
      stock({ id: 's1', depot_id: 'dA', category_id: 'c1', quantity: 6 }), // critical
      stock({ id: 's2', depot_id: 'dB', category_id: 'c1', quantity: 1000 }), // ok
      stock({ id: 's3', depot_id: 'dC', category_id: 'c1', quantity: 0 }), // depleted
    ];
    const movements = [
      move({ depot_id: 'dA', category_id: 'c1', quantity: 30, created_at: daysBefore(1) }),
      move({ depot_id: 'dB', category_id: 'c1', quantity: 30, created_at: daysBefore(1) }),
    ];
    const warnings = getStockRunoutWarnings(stocks, movements, { asOf: ASOF });
    const depots = warnings.map((w) => w.depot_id).sort();
    expect(depots).toEqual(['dA', 'dC']);
  });
});
