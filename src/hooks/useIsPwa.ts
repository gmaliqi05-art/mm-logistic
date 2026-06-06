import { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';

export function useIsPwa(): boolean {
  const [isPwa, setIsPwa] = useState(() => {
    if (typeof window === 'undefined') return false;
    if (Capacitor.isNativePlatform()) return true;
    const nav = window.navigator as Navigator & { standalone?: boolean };
    if (nav.standalone === true) return true;
    return window.matchMedia('(display-mode: standalone)').matches;
  });

  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;
    const mq = window.matchMedia('(display-mode: standalone)');
    const handler = (e: MediaQueryListEvent) => setIsPwa(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return isPwa;
}
