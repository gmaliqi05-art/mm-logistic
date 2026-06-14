import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  saveDriverTaskCache,
  loadDriverTaskCache,
  clearDriverTaskCache,
  formatCacheAge,
} from './driverTaskCache';

// Vitest in this project runs in node env, so we provide a minimal
// localStorage shim to exercise the persistence path.
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  key(i: number): string | null {
    return Array.from(this.store.keys())[i] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

beforeEach(() => {
  // @ts-expect-error — provide a writable window/localStorage for tests.
  globalThis.window = { localStorage: new MemoryStorage() };
});

afterEach(() => {
  vi.restoreAllMocks();
  // @ts-expect-error — tear down between tests.
  delete globalThis.window;
});

describe('saveDriverTaskCache / loadDriverTaskCache', () => {
  it('round-trips a fresh entry', () => {
    saveDriverTaskCache('driver-1', [{ id: 'a' }, { id: 'b' }]);
    const got = loadDriverTaskCache<{ id: string }>('driver-1');
    expect(got).not.toBeNull();
    expect(got!.rows).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(typeof got!.fetchedAt).toBe('number');
  });

  it('returns null when nothing is cached', () => {
    expect(loadDriverTaskCache<unknown>('missing')).toBeNull();
  });

  it('returns null and clears when older than 24h', () => {
    saveDriverTaskCache('driver-1', [{ id: 'old' }]);
    // Force the entry into the past by mutating the stored blob.
    const key = 'mm-logistic.driver-task-cache.driver-1';
    const raw = window.localStorage.getItem(key)!;
    const parsed = JSON.parse(raw);
    parsed.fetchedAt = Date.now() - 25 * 60 * 60 * 1000;
    window.localStorage.setItem(key, JSON.stringify(parsed));

    expect(loadDriverTaskCache('driver-1')).toBeNull();
    expect(window.localStorage.getItem(key)).toBeNull();
  });

  it('returns null for a malformed entry without throwing', () => {
    window.localStorage.setItem(
      'mm-logistic.driver-task-cache.driver-1',
      '{not-json}',
    );
    expect(loadDriverTaskCache('driver-1')).toBeNull();
  });

  it('ignores empty user ids on both sides', () => {
    saveDriverTaskCache('', [{ id: 'x' }]);
    expect(loadDriverTaskCache('')).toBeNull();
  });
});

describe('clearDriverTaskCache', () => {
  it('removes the entry for the given user', () => {
    saveDriverTaskCache('driver-1', [{ id: 'a' }]);
    clearDriverTaskCache('driver-1');
    expect(loadDriverTaskCache('driver-1')).toBeNull();
  });

  it('does not throw when nothing is cached', () => {
    expect(() => clearDriverTaskCache('nobody')).not.toThrow();
  });
});

describe('formatCacheAge', () => {
  const t0 = 1_000_000_000_000;

  it('shows "just now" for sub-minute deltas', () => {
    expect(formatCacheAge(t0, t0 + 30_000)).toBe('just now');
  });

  it('shows minutes when under an hour', () => {
    expect(formatCacheAge(t0, t0 + 5 * 60_000)).toBe('5m ago');
    expect(formatCacheAge(t0, t0 + 59 * 60_000)).toBe('59m ago');
  });

  it('shows hours when over an hour but under a day', () => {
    expect(formatCacheAge(t0, t0 + 3 * 60 * 60_000)).toBe('3h ago');
  });

  it('shows days when over a day', () => {
    expect(formatCacheAge(t0, t0 + 2 * 24 * 60 * 60_000)).toBe('2d ago');
  });

  it('clamps negative deltas to "just now"', () => {
    expect(formatCacheAge(t0 + 1000, t0)).toBe('just now');
  });
});
