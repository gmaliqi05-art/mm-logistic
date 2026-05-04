import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { logger } from '../utils/logger';

interface Options {
  enabled: boolean;
  companyId: string | null | undefined;
  driverId: string | null | undefined;
  deliveryNoteId?: string | null;
  minIntervalMs?: number;
  minDistanceM?: number;
}

export interface TrackingState {
  active: boolean;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  lastSentAt: number | null;
  error: string | null;
}

function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function useDriverLocationTracking({
  enabled,
  companyId,
  driverId,
  deliveryNoteId,
  minIntervalMs = 15000,
  minDistanceM = 50,
}: Options): TrackingState {
  const [state, setState] = useState<TrackingState>({
    active: false,
    lat: null,
    lng: null,
    accuracy: null,
    speed: null,
    heading: null,
    lastSentAt: null,
    error: null,
  });
  const watchIdRef = useRef<number | null>(null);
  const lastSentRef = useRef<{ lat: number; lng: number; at: number } | null>(null);

  const persist = useCallback(
    async (lat: number, lng: number, accuracy: number | null, speed: number | null, heading: number | null) => {
      if (!companyId || !driverId) return;
      try {
        await supabase.from('driver_locations').insert({
          company_id: companyId,
          driver_id: driverId,
          delivery_note_id: deliveryNoteId ?? null,
          lat,
          lng,
          accuracy_m: accuracy,
          speed_kmh: speed !== null ? speed * 3.6 : null,
          heading_deg: heading,
        });
        if (deliveryNoteId) {
          await supabase
            .from('delivery_notes')
            .update({ current_lat: lat, current_lng: lng, last_location_at: new Date().toISOString() })
            .eq('id', deliveryNoteId);
        }
      } catch (err) {
        logger.warn('driver location persist failed', { error: err });
      }
    },
    [companyId, driverId, deliveryNoteId]
  );

  useEffect(() => {
    if (!enabled || !companyId || !driverId) {
      if (watchIdRef.current !== null) {
        navigator.geolocation?.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setState((s) => ({ ...s, active: false }));
      return;
    }
    if (!('geolocation' in navigator)) {
      setState((s) => ({ ...s, error: 'Geolocation not supported' }));
      return;
    }

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy, speed, heading } = pos.coords;
        const now = Date.now();
        const last = lastSentRef.current;
        const shouldSend =
          !last ||
          now - last.at >= minIntervalMs ||
          haversineMeters(last.lat, last.lng, latitude, longitude) >= minDistanceM;

        setState({
          active: true,
          lat: latitude,
          lng: longitude,
          accuracy: accuracy ?? null,
          speed: speed ?? null,
          heading: heading ?? null,
          lastSentAt: shouldSend ? now : last?.at ?? null,
          error: null,
        });

        if (shouldSend) {
          lastSentRef.current = { lat: latitude, lng: longitude, at: now };
          void persist(latitude, longitude, accuracy ?? null, speed ?? null, heading ?? null);
        }
      },
      (err) => {
        setState((s) => ({ ...s, active: false, error: err.message }));
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
    watchIdRef.current = id;

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [enabled, companyId, driverId, minIntervalMs, minDistanceM, persist]);

  return state;
}
