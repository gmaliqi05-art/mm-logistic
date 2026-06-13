import type { StockAlert, Stock as StockType } from '../types';
import { isDamageLike } from './epalClassification';

/**
 * Returns the subset of stock alerts that are currently breached for the
 * given stock snapshot. An alert is breached when:
 *   - it is_active = true, AND
 *   - out_of_stock: total qty in (depot, category) is 0
 *   - low_stock: total qty in (depot, category) is between 1 and the threshold (inclusive)
 *   - damaged_threshold: damage-like qty in (depot, category) >= threshold
 *
 * Stock rows are aggregated across product variants within (depot_id, category_id).
 *
 * Damage-like detection routes through `isDamageLike()` so that future
 * additions to the condition vocabulary cannot silently bypass damage
 * alerts — a previously latent bug.
 */
export function getTriggeredStockAlerts(
  alerts: StockAlert[],
  stocks: StockType[],
): StockAlert[] {
  return alerts.filter((alert) => {
    if (!alert.is_active) return false;

    const rowsForKey = stocks.filter(
      (s) => s.depot_id === alert.depot_id && s.category_id === alert.category_id,
    );

    if (alert.alert_type === 'out_of_stock') {
      const total = rowsForKey.reduce((sum, s) => sum + (s.quantity ?? 0), 0);
      return total === 0;
    }

    if (alert.alert_type === 'low_stock') {
      const total = rowsForKey.reduce((sum, s) => sum + (s.quantity ?? 0), 0);
      return total > 0 && total <= alert.threshold;
    }

    if (alert.alert_type === 'damaged_threshold') {
      const damaged = rowsForKey
        .filter((s) => isDamageLike(s.condition))
        .reduce((sum, s) => sum + (s.quantity ?? 0), 0);
      return damaged >= alert.threshold;
    }

    return false;
  });
}
