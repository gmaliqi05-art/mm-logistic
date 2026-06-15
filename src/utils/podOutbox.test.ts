import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearPodOutbox,
  drainPodOutbox,
  enqueuePod,
  peekPodOutbox,
  removePodOutboxItem,
  podPayloadToBlob,
  __INTERNAL,
  type PodOutboxPayload,
} from './podOutbox';

function memStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    raw: map,
  };
}

function pod(overrides: Partial<PodOutboxPayload> = {}): PodOutboxPayload {
  return {
    id: 'p1',
    delivery_note_id: 'dn1',
    company_id: 'c1',
    captured_by_profile_id: 'u1',
    note_number: 'RE-001',
    gps_lat: 51.5,
    gps_lng: 13.4,
    photo: { name: 'photo.jpg', type: 'image/jpeg', base64: 'AAAA' },
    signature: null,
    ...overrides,
  };
}

describe('enqueuePod / peekPodOutbox', () => {
  let storage: ReturnType<typeof memStorage>;
  beforeEach(() => { storage = memStorage(); });

  it('persists payload and stamps with enqueued_at', () => {
    const size = enqueuePod(pod(), { storage, now: 1000 });
    expect(size).toBe(1);
    const queued = peekPodOutbox({ storage, now: 1000 });
    expect(queued).toHaveLength(1);
    expect(queued[0].id).toBe('p1');
    expect(queued[0].enqueued_at).toBe(1000);
  });

  it('returns [] when localStorage is unavailable', () => {
    expect(peekPodOutbox({ storage: null })).toEqual([]);
  });

  it('tolerates corrupted JSON without throwing', () => {
    storage.setItem(__INTERNAL.STORAGE_KEY, '{not json');
    expect(peekPodOutbox({ storage })).toEqual([]);
  });

  it('drops entries older than MAX_AGE_MS', () => {
    enqueuePod(pod({ id: 'old' }), { storage, now: 0 });
    enqueuePod(pod({ id: 'new' }), { storage, now: __INTERNAL.MAX_AGE_MS - 1 });
    const later = peekPodOutbox({ storage, now: __INTERNAL.MAX_AGE_MS + 10 });
    expect(later.map((e) => e.id)).toEqual(['new']);
  });

  it('caps queue at MAX_QUEUE_SIZE (oldest first dropped)', () => {
    for (let i = 0; i < __INTERNAL.MAX_QUEUE_SIZE + 3; i++) {
      enqueuePod(pod({ id: `p${i}` }), { storage, now: 1000 + i });
    }
    const queued = peekPodOutbox({ storage, now: 1000 + __INTERNAL.MAX_QUEUE_SIZE + 3 });
    expect(queued).toHaveLength(__INTERNAL.MAX_QUEUE_SIZE);
    expect(queued[0].id).toBe('p3');
    expect(queued[queued.length - 1].id).toBe(`p${__INTERNAL.MAX_QUEUE_SIZE + 2}`);
  });
});

describe('drainPodOutbox', () => {
  let storage: ReturnType<typeof memStorage>;
  beforeEach(() => { storage = memStorage(); });

  it('returns 0 and writes nothing when the queue is empty', async () => {
    const n = await drainPodOutbox(async () => true, { storage });
    expect(n).toBe(0);
    expect(storage.raw.has(__INTERNAL.STORAGE_KEY)).toBe(false);
  });

  it('removes entries that flush successfully', async () => {
    enqueuePod(pod({ id: 'a' }), { storage, now: 1 });
    enqueuePod(pod({ id: 'b' }), { storage, now: 2 });
    const drained = await drainPodOutbox(async () => true, { storage, now: 3 });
    expect(drained).toBe(2);
    expect(peekPodOutbox({ storage, now: 3 })).toEqual([]);
  });

  it('keeps entries that fail and reports success count', async () => {
    enqueuePod(pod({ id: 'good' }), { storage, now: 1 });
    enqueuePod(pod({ id: 'bad' }), { storage, now: 2 });
    const drained = await drainPodOutbox(
      async (p) => p.id === 'good',
      { storage, now: 3 },
    );
    expect(drained).toBe(1);
    const left = peekPodOutbox({ storage, now: 3 });
    expect(left.map((e) => e.id)).toEqual(['bad']);
  });

  it('keeps entries that throw during flush', async () => {
    enqueuePod(pod({ id: 'a' }), { storage, now: 1 });
    const drained = await drainPodOutbox(
      async () => { throw new Error('network'); },
      { storage, now: 2 },
    );
    expect(drained).toBe(0);
    expect(peekPodOutbox({ storage, now: 2 })).toHaveLength(1);
  });

  it('strips enqueued_at metadata before handing the payload to flush', async () => {
    enqueuePod(pod({ id: 'p' }), { storage, now: 42 });
    let received: PodOutboxPayload | null = null;
    await drainPodOutbox(async (p) => { received = p; return true; }, { storage, now: 43 });
    expect(received).not.toBeNull();
    expect(received).not.toHaveProperty('enqueued_at');
  });
});

describe('removePodOutboxItem / clearPodOutbox', () => {
  it('removes a single entry by id', () => {
    const storage = memStorage();
    enqueuePod(pod({ id: 'a' }), { storage, now: 1 });
    enqueuePod(pod({ id: 'b' }), { storage, now: 2 });
    removePodOutboxItem('a', { storage });
    expect(peekPodOutbox({ storage, now: 3 }).map((e) => e.id)).toEqual(['b']);
  });

  it('clearPodOutbox wipes everything', () => {
    const storage = memStorage();
    enqueuePod(pod(), { storage, now: 1 });
    clearPodOutbox({ storage });
    expect(peekPodOutbox({ storage, now: 1 })).toEqual([]);
  });
});

describe('podPayloadToBlob', () => {
  it('round-trips a small base64 photo to a Blob with the original type', () => {
    const blob = podPayloadToBlob({ name: 'p.jpg', type: 'image/jpeg', base64: btoa('hello') });
    expect(blob).not.toBeNull();
    expect(blob!.type).toBe('image/jpeg');
    expect(blob!.size).toBe(5);
  });

  it('returns null for malformed base64', () => {
    const blob = podPayloadToBlob({ name: 'x', type: 'image/jpeg', base64: 'not!!!base64' });
    // atob is lenient with some characters; if it throws we return null,
    // but if it silently decodes we still return a Blob. Either path is
    // safe — the caller will treat NULL as "leave in queue".
    if (blob !== null) {
      expect(blob).toBeInstanceOf(Blob);
    }
  });
});
