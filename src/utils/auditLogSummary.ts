/**
 * Pulls a single human-readable label from an audit_logs.details payload.
 *
 * audit_logs is written by two distinct writers and the `details` JSONB
 * therefore has two distinct shapes:
 *
 *   1) Manual logAudit() calls from src/pages/company/{Depots,Drivers,
 *      DeliveryNotes}.tsx pass a hand-shaped object like
 *      { name, email, note_number, license_plate, full_name }.
 *
 *   2) The generic audit_row_changes trigger (migration 20260520140000)
 *      writes { after: { ...row } } on INSERT, { before: { ...row } } on
 *      DELETE and { changed: <jsonb diff> } on UPDATE.
 *
 * The two surfaces that render this — /company/audit-log and the recent-
 * activity widget on /company — both need a short, glance-able label and
 * neither can know in advance which shape they will get for a given row.
 * This helper hides that.
 *
 * Returns '' when nothing useful can be extracted, so callers can render
 * (or not) without dealing with null/undefined.
 */
export function extractAuditSummary(details: unknown): string {
  if (!details || typeof details !== 'object') return '';
  const d = details as Record<string, unknown>;

  // First non-empty field wins. Blank strings are treated as missing so
  // a row with `{ name: '   ', email: 'x@y.com' }` returns the email.
  const pick = (obj: Record<string, unknown> | undefined, keys: string[]): string => {
    if (!obj) return '';
    for (const k of keys) {
      const v = obj[k];
      if (typeof v === 'string' && v.trim()) return v;
    }
    return '';
  };

  // Manual-call shape — direct keys at top level.
  const manual = pick(d, ['name', 'email', 'note_number', 'license_plate', 'full_name']);
  if (manual) return manual;

  // Trigger shape — pick a best human field from the row snapshot.
  const snapshot = (d.after ?? d.before ?? d.changed) as Record<string, unknown> | undefined;
  return pick(snapshot, ['name', 'full_name', 'note_number', 'invoice_number', 'license_plate', 'title']);
}
