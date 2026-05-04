import { useEffect, useState } from 'react';
import { getSignedUrl } from '../utils/storage';

export function useSignedUrl(bucket: string, path: string | null | undefined, expiresIn = 3600) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(path));

  useEffect(() => {
    let cancelled = false;
    if (!path) {
      setUrl(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    getSignedUrl(bucket, path, expiresIn)
      .then((signed) => {
        if (!cancelled) setUrl(signed);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bucket, path, expiresIn]);

  return { url, loading };
}
