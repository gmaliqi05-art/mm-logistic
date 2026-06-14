/**
 * Detects delivery notes that are awaiting depot intake — i.e. the
 * driver has marked them delivered (or company_admin has reviewed and
 * routed them to the depot) but the depot worker has not yet confirmed
 * stock posting. This is the inbox that should be cleared *before*
 * anyone manually re-enters the same goods through Receiving.tsx, which
 * would create duplicate stock and leave the original delivery note
 * stuck in `pending_stock_confirmation` forever.
 *
 * Background:
 *   `process_delivery_note_stock` (server-side trigger on
 *   delivery_notes UPDATE OF status) sets `stock_posted = true` and
 *   inserts the matching `stock_movements` rows when status transitions
 *   to `delivered` or `confirmed`. The depot worker's job is to move
 *   the note from `delivered` / `pending_stock_confirmation` → `confirmed`
 *   via the Review panel; doing it through Receiving.tsx instead
 *   bypasses the trigger and silently duplicates inventory.
 *
 *   This helper isolates the predicate so the UI can warn the worker
 *   ("X notes waiting to be received here — open them first") and so
 *   the same rule can be regression-tested in vitest.
 */

export interface PendingDepotIntakeNote {
  status: string | null | undefined;
  assigned_depot_id: string | null | undefined;
  stock_posted: boolean | null | undefined;
}

/**
 * Status values that mean "the goods physically arrived (or are
 * believed to have arrived) and the depot still owes us a stock
 * posting". Listed in the order operators see them in the lifecycle.
 */
export const PENDING_INTAKE_STATUSES = [
  'delivered',
  'pending_stock_confirmation',
  'pending_company_review',
] as const;

export function isAwaitingDepotIntake(
  note: PendingDepotIntakeNote,
  depotId: string | null | undefined,
): boolean {
  if (!depotId) return false;
  if (note.assigned_depot_id !== depotId) return false;
  if (note.stock_posted === true) return false;
  const status = (note.status ?? '').trim();
  return (PENDING_INTAKE_STATUSES as readonly string[]).includes(status);
}

export function countAwaitingDepotIntake(
  notes: readonly PendingDepotIntakeNote[],
  depotId: string | null | undefined,
): number {
  if (!depotId) return 0;
  let n = 0;
  for (const note of notes) if (isAwaitingDepotIntake(note, depotId)) n++;
  return n;
}
