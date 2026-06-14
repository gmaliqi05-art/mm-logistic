/**
 * Single source of truth for which (condition, quality_class) pairs
 * are allowed on `delivery_note_items`. Mirrored exactly by the DB
 * CHECK constraint `delivery_note_items_condition_quality_consistent`
 * (migration 20260614140000) so the frontend can pre-validate before
 * a save and the server cannot accept inconsistent rows.
 *
 * Background:
 *   `delivery_note_items.condition` is the operational state
 *   (good / damaged / sorting / ready_a / ready_b / ready_c).
 *   `delivery_note_items.quality_class` is the EPAL grade
 *   (NEU / A / B / C / UNSORTED / REPAIR_NEEDED / SCRAP) or NULL.
 *
 *   Before this helper existed, the UI happily let an operator save
 *   `condition='damaged'` together with `quality_class='A'` — an
 *   impossible combination that would silently break valuation
 *   reports and EPAL-pool exchange decisions downstream.
 */

import type { QualityClass } from './epalClassification';

/** Conditions that delivery_note_items.condition_check allows. */
export type DeliveryItemCondition =
  | 'good'
  | 'damaged'
  | 'sorting'
  | 'ready_a'
  | 'ready_b'
  | 'ready_c';

/**
 * Returns the set of EPAL grades that may co-exist with a given
 * operational condition. `null` is always implicitly allowed (i.e.
 * "operator has not classified yet") — callers should handle that
 * separately before invoking this set lookup.
 */
const ALLOWED_BY_CONDITION: Record<DeliveryItemCondition, ReadonlySet<QualityClass>> = {
  good: new Set<QualityClass>(['NEU', 'A', 'B', 'C', 'UNSORTED']),
  damaged: new Set<QualityClass>(['REPAIR_NEEDED', 'SCRAP']),
  sorting: new Set<QualityClass>(['UNSORTED']),
  ready_a: new Set<QualityClass>(['A']),
  ready_b: new Set<QualityClass>(['B']),
  ready_c: new Set<QualityClass>(['C']),
};

export function isQualityClassConsistent(
  condition: string | null | undefined,
  quality_class: string | null | undefined,
): boolean {
  // NULL grade is always allowed — caller hasn't classified yet.
  if (!quality_class) return true;
  // Unknown condition: refuse to invent a rule. The DB CHECK will
  // reject it anyway, surface that as inconsistent in the UI too.
  const cond = condition as DeliveryItemCondition;
  const allowed = ALLOWED_BY_CONDITION[cond];
  if (!allowed) return false;
  return allowed.has(quality_class as QualityClass);
}

/**
 * Returns the EPAL grades a UI dropdown should expose for a given
 * operational condition. Returns an empty array for unknown conditions.
 */
export function allowedQualityClassesFor(
  condition: string | null | undefined,
): readonly QualityClass[] {
  const cond = condition as DeliveryItemCondition;
  const allowed = ALLOWED_BY_CONDITION[cond];
  if (!allowed) return [];
  return Array.from(allowed);
}
