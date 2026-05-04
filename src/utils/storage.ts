import { supabase } from '../lib/supabase';

type CacheEntry = { url: string; expiresAt: number };
const cache = new Map<string, CacheEntry>();
const DEFAULT_EXPIRY_SECONDS = 3600;
const CACHE_SAFETY_MARGIN_MS = 60_000;

function cacheKey(bucket: string, path: string) {
  return `${bucket}::${path}`;
}

export async function getSignedUrl(
  bucket: string,
  path: string | null | undefined,
  expiresIn: number = DEFAULT_EXPIRY_SECONDS,
): Promise<string | null> {
  if (!path) return null;

  const key = cacheKey(bucket, path);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now() + CACHE_SAFETY_MARGIN_MS) {
    return cached.url;
  }

  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) return null;

  cache.set(key, {
    url: data.signedUrl,
    expiresAt: Date.now() + expiresIn * 1000,
  });
  return data.signedUrl;
}

export async function getSignedUrls(
  bucket: string,
  paths: Array<string | null | undefined>,
  expiresIn: number = DEFAULT_EXPIRY_SECONDS,
): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  const results = await Promise.all(
    paths.map((p) => getSignedUrl(bucket, p, expiresIn).then((url) => ({ path: p, url }))),
  );
  for (const r of results) {
    if (r.path) out[r.path] = r.url;
  }
  return out;
}

export function invalidateSignedUrl(bucket: string, path: string) {
  cache.delete(cacheKey(bucket, path));
}

export function parseStoragePath(url: string, bucket: string): string | null {
  if (!url) return null;
  const m = url.match(new RegExp(`/${bucket}/(.+?)(?:\\?|$)`));
  return m ? decodeURIComponent(m[1]) : null;
}
