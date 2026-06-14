import { describe, it, expect, beforeEach } from 'vitest';
import {
  drainQueuedAudits,
  enqueueFailedAudit,
  peekQueuedAudits,
  clearQueuedAudits,
  __INTERNAL,
  type AuditLogEntry,
} from './auditLogQueue';

function memStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    raw: map,
  };
}

function entry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    company_id: 'c1',
    user_id: 'u1',
    action: 'create',
    entity_type: 'delivery_note',
    entity_id: 'dn1',
    details: { note_number: 'RE-001' },
    ...overrides,
  };
}

describe('enqueueFailedAudit / peekQueuedAudits', () => {
  let storage: ReturnType<typeof memStorage>;
  beforeEach(() => { storage = memStorage(); });

  it('persists a failed entry and stamps it with enqueued_at', () => {
    const size = enqueueFailedAudit(entry(), { storage, now: 1000 });
    expect(size).toBe(1);
    const queued = peekQueuedAudits({ storage, now: 1000 });
    expect(queued).toHaveLength(1);
    expect(queued[0].action).toBe('create');
    expect(queued[0].enqueued_at).toBe(1000);
  });

  it('returns [] when localStorage is unavailable', () => {
    expect(peekQueuedAudits({ storage: null })).toEqual([]);
  });

  it('tolerates corrupted JSON without throwing', () => {
    storage.setItem(__INTERNAL.STORAGE_KEY, '{not json');
    expect(peekQueuedAudits({ storage })).toEqual([]);
  });

  it('drops entries older than MAX_AGE_MS', () => {
    enqueueFailedAudit(entry({ action: 'old' }), { storage, now: 0 });
    enqueueFailedAudit(entry({ action: 'new' }), { storage, now: __INTERNAL.MAX_AGE_MS - 1 });
    const later = peekQueuedAudits({ storage, now: __INTERNAL.MAX_AGE_MS + 10 });
    expect(later.map((e) => e.action)).toEqual(['new']);
  });

  it('caps queue at MAX_QUEUE_SIZE (oldest first dropped)', () => {
    for (let i = 0; i < __INTERNAL.MAX_QUEUE_SIZE + 5; i++) {
      enqueueFailedAudit(entry({ action: `a${i}` }), { storage, now: 1000 + i });
    }
    const queued = peekQueuedAudits({ storage, now: 1000 + __INTERNAL.MAX_QUEUE_SIZE + 5 });
    expect(queued).toHaveLength(__INTERNAL.MAX_QUEUE_SIZE);
    // Most recent survived
    expect(queued[queued.length - 1].action).toBe(`a${__INTERNAL.MAX_QUEUE_SIZE + 4}`);
    // Oldest were dropped
    expect(queued[0].action).toBe('a5');
  });
});

describe('drainQueuedAudits', () => {
  let storage: ReturnType<typeof memStorage>;
  beforeEach(() => { storage = memStorage(); });

  it('returns 0 and writes nothing when the queue is empty', async () => {
    const n = await drainQueuedAudits(async () => true, { storage });
    expect(n).toBe(0);
    expect(storage.raw.has(__INTERNAL.STORAGE_KEY)).toBe(false);
  });

  it('removes entries that flush successfully', async () => {
    enqueueFailedAudit(entry({ action: 'a' }), { storage, now: 1 });
    enqueueFailedAudit(entry({ action: 'b' }), { storage, now: 2 });
    const drained = await drainQueuedAudits(async () => true, { storage, now: 3 });
    expect(drained).toBe(2);
    expect(peekQueuedAudits({ storage, now: 3 })).toEqual([]);
  });

  it('keeps entries that fail to flush and reports the success count', async () => {
    enqueueFailedAudit(entry({ action: 'good' }), { storage, now: 1 });
    enqueueFailedAudit(entry({ action: 'bad' }), { storage, now: 2 });
    const drained = await drainQueuedAudits(
      async (e) => e.action === 'good',
      { storage, now: 3 },
    );
    expect(drained).toBe(1);
    const left = peekQueuedAudits({ storage, now: 3 });
    expect(left.map((e) => e.action)).toEqual(['bad']);
  });

  it('keeps entries that throw during flush', async () => {
    enqueueFailedAudit(entry({ action: 'a' }), { storage, now: 1 });
    const drained = await drainQueuedAudits(
      async () => { throw new Error('network'); },
      { storage, now: 2 },
    );
    expect(drained).toBe(0);
    expect(peekQueuedAudits({ storage, now: 2 })).toHaveLength(1);
  });

  it('drops the enqueued_at metadata before handing entries to flush', async () => {
    enqueueFailedAudit(entry(), { storage, now: 42 });
    let received: AuditLogEntry | null = null;
    await drainQueuedAudits(async (e) => { received = e; return true; }, { storage, now: 43 });
    expect(received).not.toBeNull();
    expect(received).not.toHaveProperty('enqueued_at');
  });
});

describe('clearQueuedAudits', () => {
  it('wipes the queue', () => {
    const storage = memStorage();
    enqueueFailedAudit(entry(), { storage, now: 1 });
    expect(peekQueuedAudits({ storage, now: 1 })).toHaveLength(1);
    clearQueuedAudits({ storage });
    expect(peekQueuedAudits({ storage, now: 1 })).toEqual([]);
  });
});
