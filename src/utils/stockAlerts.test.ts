import { describe, expect, it } from 'vitest';
import type { Stock as StockType, StockAlert } from '../types';
import { getTriggeredStockAlerts } from './stockAlerts';

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

function alert(overrides: Partial<StockAlert>): StockAlert {
  return {
    id: 'a-1',
    company_id: 'co-1',
    depot_id: 'd-1',
    category_id: 'c-1',
    alert_type: 'low_stock',
    threshold: 10,
    is_active: true,
    last_triggered_at: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  } as StockAlert;
}

describe('getTriggeredStockAlerts', () => {
  it('returns [] when no alerts', () => {
    expect(getTriggeredStockAlerts([], [stock({ quantity: 5 })])).toEqual([]);
  });

  it('skips disabled alerts', () => {
    const a = alert({ alert_type: 'out_of_stock', is_active: false });
    expect(getTriggeredStockAlerts([a], [stock({ quantity: 0 })])).toEqual([]);
  });

  describe('out_of_stock', () => {
    it('triggers when total qty in (depot, category) is 0', () => {
      const a = alert({ alert_type: 'out_of_stock' });
      expect(getTriggeredStockAlerts([a], [])).toEqual([a]);
    });

    it('does not trigger when stock exists', () => {
      const a = alert({ alert_type: 'out_of_stock' });
      expect(getTriggeredStockAlerts([a], [stock({ quantity: 1 })])).toEqual([]);
    });

    it('only considers matching depot+category', () => {
      const a = alert({ alert_type: 'out_of_stock' });
      const otherDepot = stock({ depot_id: 'd-2', quantity: 100 });
      expect(getTriggeredStockAlerts([a], [otherDepot])).toEqual([a]);
    });
  });

  describe('low_stock', () => {
    it('triggers when total qty is between 1 and threshold (inclusive)', () => {
      const a = alert({ alert_type: 'low_stock', threshold: 10 });
      expect(getTriggeredStockAlerts([a], [stock({ quantity: 5 })])).toEqual([a]);
      expect(getTriggeredStockAlerts([a], [stock({ quantity: 10 })])).toEqual([a]);
    });

    it('does not trigger when qty is 0 (that is out_of_stock territory)', () => {
      const a = alert({ alert_type: 'low_stock', threshold: 10 });
      expect(getTriggeredStockAlerts([a], [stock({ quantity: 0 })])).toEqual([]);
    });

    it('does not trigger when qty exceeds threshold', () => {
      const a = alert({ alert_type: 'low_stock', threshold: 10 });
      expect(getTriggeredStockAlerts([a], [stock({ quantity: 11 })])).toEqual([]);
    });

    it('aggregates across product variants in the same depot+category', () => {
      const a = alert({ alert_type: 'low_stock', threshold: 10 });
      const rows = [
        stock({ id: 's1', category_product_id: 'p1', quantity: 4 }),
        stock({ id: 's2', category_product_id: 'p2', quantity: 5 }),
      ];
      // total = 9, threshold = 10 → triggered
      expect(getTriggeredStockAlerts([a], rows)).toEqual([a]);
    });
  });

  describe('damaged_threshold', () => {
    it('triggers when damaged stock >= threshold', () => {
      const a = alert({ alert_type: 'damaged_threshold', threshold: 5 });
      const rows = [
        stock({ id: 's1', condition: 'damaged', quantity: 6 }),
      ];
      expect(getTriggeredStockAlerts([a], rows)).toEqual([a]);
    });

    it('ignores good / repaired stock when summing', () => {
      const a = alert({ alert_type: 'damaged_threshold', threshold: 5 });
      const rows = [
        stock({ id: 's1', condition: 'good', quantity: 100 }),
        stock({ id: 's2', condition: 'repaired', quantity: 100 }),
        stock({ id: 's3', condition: 'damaged', quantity: 3 }),
      ];
      // damaged = 3, threshold = 5 → not triggered
      expect(getTriggeredStockAlerts([a], rows)).toEqual([]);
    });
  });
});
