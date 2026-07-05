import type { Stock, StockMovement } from '../types';

/**
 * Predictive stock forecasting.
 *
 * `stockAlerts.ts` answers "is this (depot, category) below a threshold *right
 * now*". This module is the forward-looking complement: from the recent
 * `stock_movements` velocity it estimates *when* a (depot, category) will run
 * out, so the platform can warn before the shelf is empty rather than after.
 *
 * It is a pure function (no `Date.now()`, no I/O) so it is fully unit-testable
 * and can run either in the browser (over already-loaded rows) or be mirrored
 * by a DB view later. The caller passes an explicit `asOf` reference time.
 *
 * Granularity matches `getTriggeredStockAlerts`: rows are aggregated across
 * product variants and conditions within (depot_id, category_id). `repair`
 * movements are ignored — they reclassify stock (damaged -> good) without
 * changing the total unit count, so they must not count as consumption.
 */

export type RunoutSeverity = 'depleted' | 'critical' | 'warning' | 'ok';

export interface StockForecast {
  depot_id: string;
  category_id: string;
  /** Total units on hand across all product variants / conditions. */
  currentQuantity: number;
  /**
   * Average NET units leaving per day over the window (exits minus entries).
   * Positive means the location is depleting; <= 0 means flat or restocking.
   */
  avgDailyOutflow: number;
  /**
   * Whole days until `currentQuantity` reaches 0 at `avgDailyOutflow`, or
   * `null` when the location is not depleting. `0` when already depleted.
   */
  daysToRunout: number | null;
  /** ISO date (YYYY-MM-DD) of the predicted run-out, or `null`. */
  runoutDate: string | null;
  severity: RunoutSeverity;
}

export interface ForecastOptions {
  /** Reference "now" as an ISO timestamp. Required — keeps the fn pure. */
  asOf: string;
  /** Days of movement history the velocity is averaged over. Default 30. */
  windowDays?: number;
  /** `daysToRunout <= criticalDays` => 'critical'. Default 7. */
  criticalDays?: number;
  /** `daysToRunout <= warningDays` => 'warning'. Default 14. */
  warningDays?: number;
}

const DAY_MS = 86_400_000;

function keyOf(depotId: string, categoryId: string): string {
  return `${depotId}::${categoryId}`;
}

const SEVERITY_ORDER: Record<RunoutSeverity, number> = {
  depleted: 0,
  critical: 1,
  warning: 2,
  ok: 3,
};

/**
 * Forecast run-out per (depot_id, category_id).
 *
 * A location appears in the result if it has current stock, windowed
 * movements, or both. Results are sorted most-urgent first (depleted, then
 * ascending `daysToRunout`, then flat locations).
 */
export function forecastStockRunouts(
  stocks: Stock[],
  movements: StockMovement[],
  options: ForecastOptions,
): StockForecast[] {
  const windowDays = options.windowDays && options.windowDays > 0 ? options.windowDays : 30;
  const criticalDays = options.criticalDays ?? 7;
  const warningDays = options.warningDays ?? 14;

  const asOfMs = Date.parse(options.asOf);
  if (Number.isNaN(asOfMs)) {
    throw new Error(`forecastStockRunouts: invalid asOf "${options.asOf}"`);
  }
  const windowStartMs = asOfMs - windowDays * DAY_MS;

  // Current quantity per (depot, category).
  const qtyByKey = new Map<string, number>();
  const metaByKey = new Map<string, { depot_id: string; category_id: string }>();
  for (const s of stocks) {
    if (!s.depot_id || !s.category_id) continue;
    const k = keyOf(s.depot_id, s.category_id);
    qtyByKey.set(k, (qtyByKey.get(k) ?? 0) + (s.quantity ?? 0));
    if (!metaByKey.has(k)) metaByKey.set(k, { depot_id: s.depot_id, category_id: s.category_id });
  }

  // Net outflow (exits - entries) within the window per (depot, category).
  const outflowByKey = new Map<string, number>();
  for (const m of movements) {
    if (m.movement_type !== 'exit' && m.movement_type !== 'entry') continue;
    if (!m.depot_id || !m.category_id) continue;
    const t = Date.parse(m.created_at);
    if (Number.isNaN(t) || t < windowStartMs || t > asOfMs) continue;

    const k = keyOf(m.depot_id, m.category_id);
    const signed = (m.movement_type === 'exit' ? 1 : -1) * (m.quantity ?? 0);
    outflowByKey.set(k, (outflowByKey.get(k) ?? 0) + signed);
    if (!metaByKey.has(k)) metaByKey.set(k, { depot_id: m.depot_id, category_id: m.category_id });
  }

  const forecasts: StockForecast[] = [];
  for (const [k, meta] of metaByKey) {
    const currentQuantity = qtyByKey.get(k) ?? 0;
    const netOutflow = outflowByKey.get(k) ?? 0;
    const avgDailyOutflow = netOutflow / windowDays;

    let daysToRunout: number | null;
    let runoutDate: string | null;
    let severity: RunoutSeverity;

    if (currentQuantity <= 0) {
      daysToRunout = 0;
      runoutDate = new Date(asOfMs).toISOString().slice(0, 10);
      severity = 'depleted';
    } else if (avgDailyOutflow <= 0) {
      // Flat or restocking — no run-out predicted.
      daysToRunout = null;
      runoutDate = null;
      severity = 'ok';
    } else {
      daysToRunout = Math.floor(currentQuantity / avgDailyOutflow);
      runoutDate = new Date(asOfMs + daysToRunout * DAY_MS).toISOString().slice(0, 10);
      severity = daysToRunout <= criticalDays ? 'critical' : daysToRunout <= warningDays ? 'warning' : 'ok';
    }

    forecasts.push({
      depot_id: meta.depot_id,
      category_id: meta.category_id,
      currentQuantity,
      avgDailyOutflow,
      daysToRunout,
      runoutDate,
      severity,
    });
  }

  forecasts.sort((a, b) => {
    const sev = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sev !== 0) return sev;
    const ad = a.daysToRunout ?? Number.POSITIVE_INFINITY;
    const bd = b.daysToRunout ?? Number.POSITIVE_INFINITY;
    return ad - bd;
  });

  return forecasts;
}

/**
 * Convenience filter: the locations that warrant a proactive notification —
 * anything already depleted or forecast to run out within the warning horizon.
 */
export function getStockRunoutWarnings(
  stocks: Stock[],
  movements: StockMovement[],
  options: ForecastOptions,
): StockForecast[] {
  return forecastStockRunouts(stocks, movements, options).filter(
    (f) => f.severity === 'depleted' || f.severity === 'critical' || f.severity === 'warning',
  );
}
