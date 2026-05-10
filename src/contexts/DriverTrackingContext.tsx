import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useDriverLocationTracking, TrackingState } from '../hooks/useDriverLocationTracking';
import { supabase } from '../lib/supabase';
import { logger } from '../utils/logger';

const ENABLED_KEY = 'driver_tracking_enabled';
const OVERTIME_KEY = 'driver_tracking_overtime_until';

interface ActiveDelivery {
  id: string;
  note_number: string;
  status: string;
  delivery_address: string | null;
}

export type ShiftEndDialog =
  | { kind: 'ended' }
  | { kind: 'overtime_expired' }
  | null;

interface DriverTrackingContextValue {
  enabled: boolean;
  setEnabled: (next: boolean) => void;
  autoTracking: boolean;
  setAutoTracking: (next: boolean) => Promise<void>;
  shiftStartHour: number;
  shiftEndHour: number;
  setShiftHours: (start: number, end: number) => Promise<void>;
  activeDelivery: ActiveDelivery | null;
  state: TrackingState;
  autoStartNote: string | null;
  clearAutoStartNote: () => void;
  isWithinWorkingWindow: boolean;
  overtimeUntil: Date | null;
  startOvertime: (durationHours: number) => Promise<void>;
  stopOvertime: () => Promise<void>;
  shiftDialog: ShiftEndDialog;
  dismissShiftDialog: () => void;
}

const DriverTrackingContext = createContext<DriverTrackingContextValue | null>(null);

function isWithinWorkingWindowNow(startHour: number, endHour: number): boolean {
  const h = new Date().getHours();
  return h >= startHour && h < endHour;
}

function msUntilNextLocalHour(hour: number): number {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

function readOvertimeFromStorage(): Date | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(OVERTIME_KEY);
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= Date.now()) {
    window.localStorage.removeItem(OVERTIME_KEY);
    return null;
  }
  return new Date(n);
}

export function DriverTrackingProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const isDriver = profile?.role === 'driver';

  const [enabled, setEnabledState] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(ENABLED_KEY) === 'true';
  });
  const [activeDelivery, setActiveDelivery] = useState<ActiveDelivery | null>(null);
  const [shiftStartHour, setShiftStartHour] = useState(7);
  const [shiftEndHour, setShiftEndHour] = useState(17);
  const [autoTracking, setAutoTrackingState] = useState(false);
  const [autoStartNote, setAutoStartNote] = useState<string | null>(null);
  const [withinWindow, setWithinWindow] = useState<boolean>(() => isWithinWorkingWindowNow(7, 17));
  const [overtimeUntil, setOvertimeUntil] = useState<Date | null>(() => readOvertimeFromStorage());
  const [shiftDialog, setShiftDialog] = useState<ShiftEndDialog>(null);

  const prevWithinRef = useRef<boolean>(withinWindow);
  const lastShiftEndHandledRef = useRef<number | null>(null);

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next);
    try {
      window.localStorage.setItem(ENABLED_KEY, next ? 'true' : 'false');
    } catch {
      // ignore
    }
  }, []);

  const persistOvertime = useCallback((until: Date | null) => {
    setOvertimeUntil(until);
    try {
      if (until) {
        window.localStorage.setItem(OVERTIME_KEY, String(until.getTime()));
      } else {
        window.localStorage.removeItem(OVERTIME_KEY);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!isDriver || !profile?.id) return;
    let cancelled = false;
    const load = async () => {
      const [{ data: delivery }, { data: prof }] = await Promise.all([
        supabase
          .from('delivery_notes')
          .select('id, note_number, status, delivery_address')
          .eq('assigned_driver_id', profile.id)
          .eq('status', 'in_transit')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('profiles')
          .select('shift_start_hour, shift_end_hour, auto_tracking_enabled')
          .eq('id', profile.id)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      const activeDel = (delivery as ActiveDelivery | null) ?? null;
      setActiveDelivery(activeDel);
      if (activeDel && !enabled) {
        setAutoStartNote('Tracking filloi automatikisht: ke nje dergese ne rruge.');
        setEnabled(true);
      }
      if (prof) {
        const p = prof as { shift_start_hour?: number; shift_end_hour?: number; auto_tracking_enabled?: boolean };
        if (p.shift_start_hour != null) setShiftStartHour(p.shift_start_hour);
        if (p.shift_end_hour != null) setShiftEndHour(p.shift_end_hour);
        if (p.auto_tracking_enabled != null) setAutoTrackingState(p.auto_tracking_enabled);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [isDriver, profile?.id, enabled, setEnabled]);

  useEffect(() => {
    if (!isDriver) return;
    const tick = () => setWithinWindow(isWithinWorkingWindowNow(shiftStartHour, shiftEndHour));
    tick();
    const id = window.setInterval(tick, 30 * 1000);
    return () => window.clearInterval(id);
  }, [isDriver, shiftStartHour, shiftEndHour]);

  useEffect(() => {
    const was = prevWithinRef.current;
    prevWithinRef.current = withinWindow;
    if (!isDriver) return;

    if (!was && withinWindow && autoTracking && !enabled) {
      setAutoStartNote(`Tracking filloi automatikisht ne ora ${shiftStartHour}:00.`);
      setEnabled(true);
    }

    if (was && !withinWindow && enabled && !overtimeUntil) {
      const now = Date.now();
      if (lastShiftEndHandledRef.current && now - lastShiftEndHandledRef.current < 60 * 60 * 1000) {
        return;
      }
      lastShiftEndHandledRef.current = now;
      setEnabled(false);
      setShiftDialog({ kind: 'ended' });
      if (profile?.id && profile.company_id) {
        void supabase
          .from('tracking_prompts')
          .insert({
            company_id: profile.company_id,
            driver_id: profile.id,
            delivery_note_id: activeDelivery?.id ?? null,
          })
          .then(({ error }) => {
            if (error) logger.warn('tracking_prompts insert failed', { error });
          });
      }
    }
  }, [withinWindow, isDriver, autoTracking, enabled, shiftStartHour, overtimeUntil, profile?.id, profile?.company_id, activeDelivery?.id, setEnabled]);

  useEffect(() => {
    if (!isDriver || !autoTracking || enabled) return;
    if (withinWindow) return;
    const wait = msUntilNextLocalHour(shiftStartHour);
    const timer = window.setTimeout(() => {
      setAutoStartNote(`Tracking filloi automatikisht ne ora ${shiftStartHour}:00.`);
      setEnabled(true);
    }, wait);
    return () => window.clearTimeout(timer);
  }, [isDriver, autoTracking, enabled, withinWindow, shiftStartHour, setEnabled]);

  useEffect(() => {
    if (!overtimeUntil) return;
    const remaining = overtimeUntil.getTime() - Date.now();
    if (remaining <= 0) {
      persistOvertime(null);
      if (enabled) {
        setEnabled(false);
        setShiftDialog({ kind: 'overtime_expired' });
      }
      return;
    }
    const timer = window.setTimeout(() => {
      persistOvertime(null);
      setEnabled(false);
      setShiftDialog({ kind: 'overtime_expired' });
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [overtimeUntil, enabled, persistOvertime, setEnabled]);

  const shouldTrack = isDriver && enabled && !!profile?.id && !!profile?.company_id;

  const state = useDriverLocationTracking({
    enabled: shouldTrack,
    companyId: profile?.company_id ?? null,
    driverId: profile?.id ?? null,
    deliveryNoteId: activeDelivery?.id ?? null,
  });

  const setAutoTracking = useCallback(
    async (next: boolean) => {
      setAutoTrackingState(next);
      if (profile?.id) {
        await supabase.from('profiles').update({ auto_tracking_enabled: next }).eq('id', profile.id);
      }
      if (next && !enabled && isWithinWorkingWindowNow(shiftStartHour, shiftEndHour)) {
        setAutoStartNote(`Tracking u aktivizua sepse jemi brenda orarit te punes (${shiftStartHour}:00 - ${shiftEndHour}:00).`);
        setEnabled(true);
      }
    },
    [profile?.id, enabled, shiftStartHour, shiftEndHour, setEnabled]
  );

  const setShiftHours = useCallback(
    async (start: number, end: number) => {
      setShiftStartHour(start);
      setShiftEndHour(end);
      if (profile?.id) {
        await supabase.from('profiles').update({ shift_start_hour: start, shift_end_hour: end }).eq('id', profile.id);
      }
    },
    [profile?.id]
  );

  const startOvertime = useCallback(
    async (durationHours: number) => {
      const until = new Date(Date.now() + durationHours * 60 * 60 * 1000);
      persistOvertime(until);
      setEnabled(true);
      setShiftDialog(null);
      lastShiftEndHandledRef.current = Date.now();
      if (profile?.id) {
        await supabase
          .from('profiles')
          .update({ tracking_last_confirmed_at: new Date().toISOString() })
          .eq('id', profile.id);
        if (profile.company_id) {
          await supabase
            .from('tracking_prompts')
            .insert({
              company_id: profile.company_id,
              driver_id: profile.id,
              delivery_note_id: activeDelivery?.id ?? null,
              response: 'still_working',
              responded_at: new Date().toISOString(),
            });
        }
      }
    },
    [profile?.id, profile?.company_id, activeDelivery?.id, persistOvertime, setEnabled]
  );

  const stopOvertime = useCallback(async () => {
    persistOvertime(null);
    setEnabled(false);
    setShiftDialog(null);
    if (profile?.id && profile.company_id) {
      await supabase
        .from('tracking_prompts')
        .insert({
          company_id: profile.company_id,
          driver_id: profile.id,
          delivery_note_id: activeDelivery?.id ?? null,
          response: 'finished',
          responded_at: new Date().toISOString(),
        });
    }
  }, [profile?.id, profile?.company_id, activeDelivery?.id, persistOvertime, setEnabled]);

  const dismissShiftDialog = useCallback(() => setShiftDialog(null), []);
  const clearAutoStartNote = useCallback(() => setAutoStartNote(null), []);

  const value = useMemo<DriverTrackingContextValue>(() => ({
    enabled,
    setEnabled,
    autoTracking,
    setAutoTracking,
    shiftStartHour,
    shiftEndHour,
    setShiftHours,
    activeDelivery,
    state,
    autoStartNote,
    clearAutoStartNote,
    isWithinWorkingWindow: withinWindow,
    overtimeUntil,
    startOvertime,
    stopOvertime,
    shiftDialog,
    dismissShiftDialog,
  }), [
    enabled, setEnabled, autoTracking, setAutoTracking, shiftStartHour, shiftEndHour, setShiftHours,
    activeDelivery, state, autoStartNote, clearAutoStartNote, withinWindow, overtimeUntil,
    startOvertime, stopOvertime, shiftDialog, dismissShiftDialog,
  ]);

  return <DriverTrackingContext.Provider value={value}>{children}</DriverTrackingContext.Provider>;
}

export function useDriverTracking(): DriverTrackingContextValue {
  const ctx = useContext(DriverTrackingContext);
  if (!ctx) {
    throw new Error('useDriverTracking must be used within DriverTrackingProvider');
  }
  return ctx;
}
