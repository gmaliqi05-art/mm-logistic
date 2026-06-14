/**
 * Lightweight localStorage cache for driver task lists.
 *
 * Drivers regularly work in dead zones (rural EU, parking garages,
 * highway tunnels). Per audit #9, our dashboard previously showed an
 * empty list whenever the network was unavailable. This helper persists
 * the last successful fetch so the driver can still see *something* —
 * even if stale — when offline.
 *
 * Storage shape: a single JSON blob per driver, keyed by user id, with
 * the rows + a fetched-at timestamp. We keep this in localStorage (not
 * IndexedDB) because the payload is small (a few KB at most), the
 * driver app reads it synchronously at boot, and storage quota is not
 * a concern at this size.
 *
 * The cache is purely a fallback. The live fetch always wins when it
 * returns successfully — we overwrite the cache entry, then re-render.
 */

const PREFIX = 'mm-logistic.driver-task-cache.';
// Drop entries older than 24h on read. Tasks change at most daily; a
// week-old cache would mislead the driver about what's still on their
// queue. 24h covers a full shift with overnight downtime.
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface DriverTaskCacheEntry<T = unknown> {
  fetchedAt: number;
  rows: T[];
}

function keyFor(userId: string): string {
  return `${PREFIX}${userId}`;
}

export function saveDriverTaskCache<T>(userId: string, rows: T[]): void {
  if (!userId || typeof window === 'undefined') return;
  try {
    const entry: DriverTaskCacheEntry<T> = {
      fetchedAt: Date.now(),
      rows,
    };
    window.localStorage.setItem(keyFor(userId), JSON.stringify(entry));
  } catch {
    // QuotaExceeded or private-mode failure — silently drop. The next
    // online fetch will refresh, so a missed write isn't catastrophic.
  }
}

export function loadDriverTaskCache<T>(userId: string): DriverTaskCacheEntry<T> | null {
  if (!userId || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(keyFor(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DriverTaskCacheEntry<T>;
    if (!parsed || typeof parsed.fetchedAt !== 'number' || !Array.isArray(parsed.rows)) {
      return null;
    }
    if (Date.now() - parsed.fetchedAt > MAX_AGE_MS) {
      // Expired — drop it so callers don't show stale data and the
      // empty state surfaces the "offline" banner correctly.
      window.localStorage.removeItem(keyFor(userId));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearDriverTaskCache(userId: string): void {
  if (!userId || typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(keyFor(userId));
  } catch {
    // ignore
  }
}

/**
 * Human-friendly "synced 3m ago" string for the UI badge. Returns
 * 'just now' for very recent fetches.
 */
export function formatCacheAge(fetchedAt: number, now: number = Date.now()): string {
  const diffMs = Math.max(0, now - fetchedAt);
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
