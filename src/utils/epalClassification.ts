/**
 * EPAL classification helpers.
 *
 * The codebase has two condition vocabularies that grew up separately:
 *
 *   A) Operational state on `depot_stock.condition`, `stock_movements`,
 *      `delivery_note_items.condition`, `pallet_sorting_items.condition`:
 *      'good' | 'damaged' | 'repaired' | 'sorting' | 'sorting_pending'
 *
 *   B) EPAL quality classes on `pallet_account_transactions.condition`:
 *      'A' | 'B' | 'C' | 'Defekt'
 *
 * This module is the single source of truth for the mapping between the
 * two, plus a derived `exchangeable` flag (the EPAL pool concept of
 * "tauschfähig"). Triggers and constraints in the database are NOT
 * touched — this is a pure JS helper so existing flows keep working.
 *
 * Adding a new operational condition value? Update the maps below AND
 * the `stock_condition_check` DB constraint. The unit tests assert that
 * every `StockCondition` is handled.
 */

import type { StockCondition } from '../types';

/**
 * EPAL quality classes per the 2024 revision of EPAL
 * Qualitätsklassifizierung.
 *
 *   NEU            — Just produced, factory-new
 *   A              — "Wie neu", light wood, no wear
 *   B              — Visible wear, fully functional
 *   C              — Heavy wear, still load-bearing
 *   UNSORTED       — Mix of A/B/C bundled together
 *   REPAIR_NEEDED  — Has at least one defect that excludes it from the
 *                    open exchange pool until repaired
 *   SCRAP          — Irreparable, must be discarded
 */
export type QualityClass =
  | 'NEU'
  | 'A'
  | 'B'
  | 'C'
  | 'UNSORTED'
  | 'REPAIR_NEEDED'
  | 'SCRAP';

/**
 * Maps an operational condition to its default EPAL quality class.
 *
 * Note: `'good'` defaults to 'UNSORTED' because the open EPAL pool
 * treats unsorted A+B+C as freely exchangeable by default — once a
 * customer agrees to sort, the operator can override this with a more
 * specific class.
 */
export function qualityClassFor(condition: StockCondition): QualityClass {
  switch (condition) {
    case 'good':
      return 'UNSORTED';
    case 'repaired':
      // Post-repair pallets are typically class B (visible wear from
      // prior life + a repair plug/nail), not A. Operators can override
      // at the sorting step.
      return 'B';
    case 'damaged':
      return 'REPAIR_NEEDED';
    case 'sorting':
    case 'sorting_pending':
      return 'UNSORTED';
  }
}

/**
 * Inverse map: when a pallet_account_transactions row carries an EPAL
 * class, this returns the closest operational condition. Used when an
 * external partner provides a delivery in EPAL grades and we need to
 * post it to `depot_stock`.
 */
export function conditionForQualityClass(
  qc: 'A' | 'B' | 'C' | 'Defekt' | QualityClass,
): StockCondition {
  switch (qc) {
    case 'A':
    case 'B':
    case 'C':
    case 'NEU':
    case 'UNSORTED':
      return 'good';
    case 'Defekt':
    case 'REPAIR_NEEDED':
    case 'SCRAP':
      return 'damaged';
  }
}

/**
 * Is this stock currently tauschfähig (eligible for open EPAL pool
 * exchange)? A pallet is exchangeable when it is operational and not
 * in any in-process bucket.
 */
export function isExchangeable(condition: StockCondition): boolean {
  return condition === 'good' || condition === 'repaired';
}

/**
 * Damage-like predicate for alert/threshold logic. This is the single
 * helper that report dashboards, stock alerts, and damage filters
 * should use — if we later add a new damage-like condition (e.g.
 * 'awaiting_scrap'), updating this function is enough; alerts won't
 * silently miss the new value.
 */
export function isDamageLike(condition: StockCondition): boolean {
  return condition === 'damaged';
}

/**
 * In-process predicate: stock that is mid-sorting or mid-repair, not
 * available for outbound but also not pure damage. Used for "in
 * progress" KPIs.
 */
export function isInProcess(condition: StockCondition): boolean {
  return condition === 'sorting' || condition === 'sorting_pending';
}
