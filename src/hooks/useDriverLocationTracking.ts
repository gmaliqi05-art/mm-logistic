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
  heartbeatMs?: number;
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
  minIntervalMs = 2500,
  minDistanceM = 8,
  heartbeatMs = 10000,
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
  const heartbeatRef = useRef<number | null>(null);
  const lastSentRef = useRef<{ lat: number; lng: number; at: number } | null>(null);
  const lastPosRef = useRef<{ lat: number; lng: number; at: number } | null>(null);

  const persist = useCallback(
    async (lat: number, lng: number, accuracy: number | null, speedKmh: number | null, heading: number | null) => {
      if (!companyId || !driverId) return;
      try {
        await supabase.from('driver_locations').insert({
          company_id: companyId,
          driver_id: driverId,
          delivery_note_id: deliveryNoteId ?? null,
          lat,
          lng,
          accuracy_m: accuracy,
          speed_kmh: speedKmh,
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
      if (heartbeatRef.current !== null) {
        window.clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      setState((s) => ({ ...s, active: false }));
      return;
    }
    if (!('geolocation' in navigator)) {
      setState((s) => ({ ...s, error: 'Geolocation not supported' }));
      return;
    }

    const handlePosition = (pos: GeolocationPosition) => {
      const { latitude, longitude, accuracy, speed, heading } = pos.coords;
      const now = Date.now();
      const last = lastSentRef.current;
      const prevPos = lastPosRef.current;

      let speedKmh: number | null = null;
      if (speed != null && !Number.isNaN(speed)) {
        speedKmh = speed * 3.6;
      } else if (prevPos) {
        const dMeters = haversineMeters(prevPos.lat, prevPos.lng, latitude, longitude);
        const dtSec = (now - prevPos.at) / 1000;
        if (dtSec > 0.2 && dtSec < 60) {
          speedKmh = (dMeters / dtSec) * 3.6;
          if (speedKmh < 0.5) speedKmh = 0;
        }
      }
      lastPosRef.current = { lat: latitude, lng: longitude, at: now };

      const moved = last ? haversineMeters(last.lat, last.lng, latitude, longitude) : Infinity;
      const shouldSend = !last || now - last.at >= minIntervalMs || moved >= minDistanceM;

      setState({
        active: true,
        lat: latitude,
        lng: longitude,
        accuracy: accuracy ?? null,
        speed: speedKmh != null ? speedKmh / 3.6 : null,
        heading: heading ?? null,
        lastSentAt: shouldSend ? now : last?.at ?? null,
        error: null,
      });

      if (shouldSend) {
        lastSentRef.current = { lat: latitude, lng: longitude, at: now };
        void persist(latitude, longitude, accuracy ?? null, speedKmh, heading ?? null);
      }
    };

    const handleError = (err: GeolocationPositionError) => {
      setState((s) => ({ ...s, active: false, error: err.message }));
    };

    const id = navigator.geolocation.watchPosition(handlePosition, handleError, {
      enableHighAccuracy: true,
      maximumAge: 1500,
      timeout: 20000,
    });
    watchIdRef.current = id;

    heartbeatRef.current = window.setInterval(() => {
      const last = lastSentRef.current;
      const pos = lastPosRef.current;
      if (!pos) return;
      const now = Date.now();
      if (!last || now - last.at >= heartbeatMs) {
        lastSentRef.current = { lat: pos.lat, lng: pos.lng, at: now };
        void persist(pos.lat, pos.lng, null, 0, null);
        setState((s) => ({ ...s, lastSentAt: now }));
      }
    }, heartbeatMs);

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(handlePosition, handleError, {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 15000,
        });
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (heartbeatRef.current !== null) {
        window.clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, companyId, driverId, minIntervalMs, minDistanceM, heartbeatMs, persist]);

  return state;
}
