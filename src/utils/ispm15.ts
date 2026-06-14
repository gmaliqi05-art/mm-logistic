/**
 * ISPM-15 1/3-rule helpers.
 *
 * Under the international phytosanitary standard ISPM-15, wooden
 * packaging used in cross-border trade must carry the IPPC mark
 * following an approved treatment (heat HT, methyl bromide MB, or
 * dielectric heating DH). The "1/3 rule" applies on repair: if more
 * than one third of a pallet's components are replaced, the entire
 * pallet must be re-treated and re-stamped by a registered facility.
 *
 * An EPAL Euro-pallet has a canonical layout of:
 *   - 11 deck boards (3 top + 4 bottom + 4 corner-style middle)
 *   - 9 blocks (Klötze) (3 rows × 3)
 * = 20 replaceable components in total.
 *
 * The actionable threshold is therefore 7 components — once this many
 * have been replaced, the pallet falls under the "new pallet"
 * treatment regime per IPPC guidance, and the operator must escalate
 * to the HT facility.
 *
 * These helpers are deliberately UI-agnostic. The depot repair workflow
 * calls them to (a) compute the `requires_retreatment` flag stored in
 * `depot_repairs.requires_retreatment`, and (b) drive a warning badge
 * in the repair UI.
 */

export const EPAL_COMPONENTS_TOTAL = 20;
// One-third of 20 rounded down = 6, so the "exceeds" boundary is at 7.
// We expose the integer threshold so the UI can phrase the warning
// without rounding errors.
export const ISPM15_REPLACEMENT_THRESHOLD = 7;

export type Ispm15Status = 'ok' | 'warning' | 'exceeded';

/**
 * Total component replacements (boards + blocks). Treats null/undefined
 * as zero so partial input doesn't trigger false warnings.
 */
export function totalReplacements(
  boardsReplaced: number | null | undefined,
  blocksReplaced: number | null | undefined,
): number {
  const b = boardsReplaced ?? 0;
  const c = blocksReplaced ?? 0;
  return Math.max(0, b) + Math.max(0, c);
}

/**
 * Maps a replacement count to one of three buckets:
 *   - 'exceeded' (>= 7): re-treatment + re-stamping required.
 *   - 'warning'  (5-6):  approaching threshold, surface in the UI so
 *                        the worker stops and double-checks the count.
 *   - 'ok'       (<= 4): below the warning floor.
 */
export function ispm15Status(replaced: number): Ispm15Status {
  if (replaced >= ISPM15_REPLACEMENT_THRESHOLD) return 'exceeded';
  if (replaced >= ISPM15_REPLACEMENT_THRESHOLD - 2) return 'warning';
  return 'ok';
}

/**
 * Convenience for the trigger / app layer: returns the `requires_retreatment`
 * value that should be persisted to depot_repairs.
 */
export function requiresRetreatment(
  boardsReplaced: number | null | undefined,
  blocksReplaced: number | null | undefined,
): boolean {
  return ispm15Status(totalReplacements(boardsReplaced, blocksReplaced)) === 'exceeded';
}

/**
 * Fraction (0-1) of the pallet that has been replaced. Useful for
 * progress bars in the repair UI.
 */
export function replacementRatio(
  boardsReplaced: number | null | undefined,
  blocksReplaced: number | null | undefined,
): number {
  const total = totalReplacements(boardsReplaced, blocksReplaced);
  return Math.min(1, total / EPAL_COMPONENTS_TOTAL);
}
