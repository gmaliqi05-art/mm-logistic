/**
 * localStorage-backed retry queue for audit log entries that failed
 * to insert (RLS denial, network blip, Supabase outage). Drained on
 * the next successful `logAudit()` call so the audit trail self-heals
 * without manual operator intervention.
 *
 * Why bother?
 *   The `audit_logs` table is the compliance ledger. Silent failures
 *   create gaps that only surface during an audit, by which point
 *   reconstructing intent is impossible. Persisting failed entries
 *   gives them a second chance and keeps the failure visible in
 *   localStorage so we can size up the gap if drainage stops working.
 *
 * Bounds:
 *   - `MAX_QUEUE_SIZE` keeps the queue from growing without bound if
 *     the backend stays broken (worst case: a few KB per browser).
 *   - `MAX_AGE_MS` drops entries older than 7 days — by that point a
 *     real outage has either been resolved or escalated by other means,
 *     and stale entries lose value for compliance reconciliation.
 */

const STORAGE_KEY = 'mm-logistic-audit-queue';
const MAX_QUEUE_SIZE = 200;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface AuditLogEntry {
  company_id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown>;
}

export interface QueuedAuditEntry extends AuditLogEntry {
  enqueued_at: number;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStorage(): StorageLike | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage;
}

function loadRaw(storage: StorageLike | null): QueuedAuditEntry[] {
  if (!storage) return [];
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedAuditEntry[]) : [];
  } catch {
    return [];
  }
}

function persist(storage: StorageLike | null, items: readonly QueuedAuditEntry[]) {
  if (!storage) return;
  try {
    if (items.length === 0) storage.removeItem(STORAGE_KEY);
    else storage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // localStorage full or disabled — drop silently so the caller's
    // primary action doesn't fail.
  }
}

function prune(items: readonly QueuedAuditEntry[], now: number): QueuedAuditEntry[] {
  const fresh = items.filter((it) => now - it.enqueued_at < MAX_AGE_MS);
  if (fresh.length <= MAX_QUEUE_SIZE) return fresh;
  // Drop the oldest entries first so the most recent (most likely to
  // still be reconstructable) survive.
  return fresh.slice(-MAX_QUEUE_SIZE);
}

/**
 * Add a failed audit entry to the retry queue. Returns the current
 * queue size after the addition (or after pruning, if MAX_AGE_MS /
 * MAX_QUEUE_SIZE kicked in).
 */
export function enqueueFailedAudit(
  entry: AuditLogEntry,
  opts: { storage?: StorageLike | null; now?: number } = {},
): number {
  const storage = opts.storage === undefined ? defaultStorage() : opts.storage;
  const now = opts.now ?? Date.now();
  const items = prune([...loadRaw(storage), { ...entry, enqueued_at: now }], now);
  persist(storage, items);
  return items.length;
}

/**
 * Read the queue without modifying it. Pruning is applied so callers
 * always see a non-stale view.
 */
export function peekQueuedAudits(
  opts: { storage?: StorageLike | null; now?: number } = {},
): QueuedAuditEntry[] {
  const storage = opts.storage === undefined ? defaultStorage() : opts.storage;
  const now = opts.now ?? Date.now();
  return prune(loadRaw(storage), now);
}

/**
 * Drains the queue and hands each entry to `flush`. Entries that flush
 * successfully (resolve to true) are removed; entries that fail
 * (resolve to false or throw) are kept for the next attempt. Returns
 * the number of entries that were successfully drained.
 */
export async function drainQueuedAudits(
  flush: (entry: AuditLogEntry) => Promise<boolean>,
  opts: { storage?: StorageLike | null; now?: number } = {},
): Promise<number> {
  const storage = opts.storage === undefined ? defaultStorage() : opts.storage;
  const now = opts.now ?? Date.now();
  const items = prune(loadRaw(storage), now);
  if (items.length === 0) {
    persist(storage, items);
    return 0;
  }
  const remaining: QueuedAuditEntry[] = [];
  let drained = 0;
  for (const item of items) {
    let ok = false;
    try {
      const { enqueued_at: _ignored, ...entry } = item;
      void _ignored;
      ok = await flush(entry);
    } catch {
      ok = false;
    }
    if (ok) drained++;
    else remaining.push(item);
  }
  persist(storage, remaining);
  return drained;
}

/** Test/ops helper — wipes the queue. Not used by app code. */
export function clearQueuedAudits(
  opts: { storage?: StorageLike | null } = {},
): void {
  const storage = opts.storage === undefined ? defaultStorage() : opts.storage;
  persist(storage, []);
}

export const __INTERNAL = {
  STORAGE_KEY,
  MAX_QUEUE_SIZE,
  MAX_AGE_MS,
} as const;
