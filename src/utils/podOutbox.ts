/**
 * Offline outbox for driver Proof-of-Delivery (POD) captures.
 *
 * Background:
 *   Drivers regularly hit dead zones (rural EU, parking garages,
 *   highway tunnels) right at the moment they're trying to confirm
 *   delivery. The current save path uploads photo+signature to Supabase
 *   Storage and then INSERTs a `delivery_proofs` row and UPDATEs
 *   `delivery_notes.status='delivered'`. If any of those four calls
 *   fails on a flaky network, the driver sees an error and the note is
 *   stuck in `in_transit` until they manually retry — meanwhile the
 *   company admin can't post stock or close the loop.
 *
 *   This outbox lets the modal queue the entire POD payload (including
 *   base64-encoded photo + signature) so the driver can move on and the
 *   browser flushes the queue automatically the next time it sees the
 *   network. Bounded so a long outage doesn't blow out localStorage.
 *
 *   Files are intentionally base64 here (not IndexedDB Blob) because:
 *     - the cap (10 PODs / ~5 MB) fits localStorage,
 *     - localStorage is synchronously readable at boot so the queue is
 *       inspectable from the same code path that already loads the
 *       driver dashboard, and
 *     - vitest can drive it via a plain in-memory mock without an
 *       IndexedDB polyfill.
 */

const STORAGE_KEY = 'mm-logistic-pod-outbox';
const MAX_QUEUE_SIZE = 10;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface PodFilePayload {
  name: string;
  type: string;
  base64: string;
}

export interface PodOutboxPayload {
  /** Stable client-side id so callers can remove individual entries. */
  id: string;
  delivery_note_id: string;
  company_id: string;
  captured_by_profile_id: string | null;
  note_number: string;
  gps_lat: number | null;
  gps_lng: number | null;
  photo: PodFilePayload;
  signature: PodFilePayload | null;
}

export interface QueuedPod extends PodOutboxPayload {
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

function loadRaw(storage: StorageLike | null): QueuedPod[] {
  if (!storage) return [];
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedPod[]) : [];
  } catch {
    return [];
  }
}

function persist(storage: StorageLike | null, items: readonly QueuedPod[]) {
  if (!storage) return;
  try {
    if (items.length === 0) storage.removeItem(STORAGE_KEY);
    else storage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Quota or private-mode failure — silently drop. Better to lose
    // an outbox write than to break the driver's primary save attempt.
  }
}

function prune(items: readonly QueuedPod[], now: number): QueuedPod[] {
  const fresh = items.filter((it) => now - it.enqueued_at < MAX_AGE_MS);
  if (fresh.length <= MAX_QUEUE_SIZE) return fresh;
  // Drop oldest first — the most recent attempts are the ones most
  // likely to still match a real, in-progress route.
  return fresh.slice(-MAX_QUEUE_SIZE);
}

export function enqueuePod(
  payload: PodOutboxPayload,
  opts: { storage?: StorageLike | null; now?: number } = {},
): number {
  const storage = opts.storage === undefined ? defaultStorage() : opts.storage;
  const now = opts.now ?? Date.now();
  const items = prune(
    [...loadRaw(storage), { ...payload, enqueued_at: now }],
    now,
  );
  persist(storage, items);
  return items.length;
}

export function peekPodOutbox(
  opts: { storage?: StorageLike | null; now?: number } = {},
): QueuedPod[] {
  const storage = opts.storage === undefined ? defaultStorage() : opts.storage;
  const now = opts.now ?? Date.now();
  return prune(loadRaw(storage), now);
}

/**
 * Hands each queued POD to `flush` one at a time. Entries that flush
 * successfully (resolve to true) are removed. Entries that fail or
 * throw stay in the queue for the next attempt. Returns the number of
 * entries that were successfully drained.
 *
 * Drainage is sequential rather than parallel so a single broken
 * upload doesn't take down the whole queue — and the next online
 * window doesn't try to upload 10 photos simultaneously over the
 * driver's flaky LTE.
 */
export async function drainPodOutbox(
  flush: (payload: PodOutboxPayload) => Promise<boolean>,
  opts: { storage?: StorageLike | null; now?: number } = {},
): Promise<number> {
  const storage = opts.storage === undefined ? defaultStorage() : opts.storage;
  const now = opts.now ?? Date.now();
  const items = prune(loadRaw(storage), now);
  if (items.length === 0) {
    persist(storage, items);
    return 0;
  }
  const remaining: QueuedPod[] = [];
  let drained = 0;
  for (const item of items) {
    let ok = false;
    try {
      const { enqueued_at: _ignored, ...payload } = item;
      void _ignored;
      ok = await flush(payload);
    } catch {
      ok = false;
    }
    if (ok) drained++;
    else remaining.push(item);
  }
  persist(storage, remaining);
  return drained;
}

/** Remove a single entry (driver explicitly discards it). */
export function removePodOutboxItem(
  id: string,
  opts: { storage?: StorageLike | null } = {},
): void {
  const storage = opts.storage === undefined ? defaultStorage() : opts.storage;
  const items = loadRaw(storage).filter((it) => it.id !== id);
  persist(storage, items);
}

/** Test/ops helper — wipes the queue. */
export function clearPodOutbox(
  opts: { storage?: StorageLike | null } = {},
): void {
  const storage = opts.storage === undefined ? defaultStorage() : opts.storage;
  persist(storage, []);
}

/**
 * Helper to convert a File (from the modal's file input) to base64
 * suitable for storage. Returns null if conversion fails (e.g. on
 * memory pressure with a huge file). Caller should keep this under
 * ~500 KB to leave room for several queued PODs in localStorage.
 */
export async function fileToPodPayload(file: File): Promise<PodFilePayload | null> {
  if (typeof FileReader === 'undefined') return null;
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve(null);
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      // result is `data:image/jpeg;base64,...`; strip the prefix so we
      // store just the body and reconstruct the type explicitly.
      const idx = result.indexOf(',');
      const base64 = idx >= 0 ? result.slice(idx + 1) : result;
      resolve({ name: file.name, type: file.type || 'application/octet-stream', base64 });
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Inverse of `fileToPodPayload` — reconstructs a Blob ready to upload
 * to Supabase Storage. Returns null when the runtime cannot decode
 * base64 (e.g. SSR) so callers can fall back to leaving the entry in
 * the queue.
 */
export function podPayloadToBlob(payload: PodFilePayload): Blob | null {
  if (typeof atob === 'undefined') return null;
  try {
    const binary = atob(payload.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: payload.type });
  } catch {
    return null;
  }
}

export const __INTERNAL = {
  STORAGE_KEY,
  MAX_QUEUE_SIZE,
  MAX_AGE_MS,
} as const;
