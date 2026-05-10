import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useDriverLocationTracking, TrackingState } from '../hooks/useDriverLocationTracking';
import { supabase } from '../lib/supabase';
import { logger } from '../utils/logger';

const AUTO_STOP_DELAY_MS = 10 * 60 * 1000;
const ENABLED_KEY = 'driver_tracking_enabled';

interface ActiveDelivery {
  id: string;
  note_number: string;
  status: string;
  delivery_address: string | null;
}

interface PromptInfo {
  id: string;
  sent_at: string;
}

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
  autoStopped: boolean;
  autoStartNote: string | null;
  clearAutoStartNote: () => void;
  prompt: PromptInfo | null;
  respondPrompt: (response: 'still_working' | 'finished' | 'break' | 'auto_stopped') => Promise<void>;
  minutesRemaining: number | null;
  nextPromptAt: Date | null;
  isWithinWorkingWindow: boolean;
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
  const [autoStopped, setAutoStopped] = useState(false);
  const [autoStartNote, setAutoStartNote] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<PromptInfo | null>(null);
  const [nextPromptAt, setNextPromptAt] = useState<Date | null>(null);
  const [withinWindow, setWithinWindow] = useState<boolean>(() => isWithinWorkingWindowNow(7, 17));
  const autoStopTimer = useRef<number | null>(null);

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next);
    try {
      window.localStorage.setItem(ENABLED_KEY, next ? 'true' : 'false');
    } catch {
      // ignore storage errors
    }
    if (!next) setAutoStopped(false);
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
    return () => {
      cancelled = true;
    };
  }, [isDriver, profile?.id, enabled, setEnabled]);

  useEffect(() => {
    if (!isDriver) return;
    const tick = () => setWithinWindow(isWithinWorkingWindowNow(shiftStartHour, shiftEndHour));
    tick();
    const id = window.setInterval(tick, 60 * 1000);
    return () => window.clearInterval(id);
  }, [isDriver, shiftStartHour, shiftEndHour]);

  useEffect(() => {
    if (!isDriver) return;
    if (!autoTracking) return;
    if (enabled) return;
    if (withinWindow) {
      setAutoStartNote(`Tracking filloi automatikisht ne ora ${shiftStartHour}:00.`);
      setEnabled(true);
      return;
    }
    const wait = msUntilNextLocalHour(shiftStartHour);
    const timer = window.setTimeout(() => {
      setAutoStartNote(`Tracking filloi automatikisht ne ora ${shiftStartHour}:00.`);
      setEnabled(true);
    }, wait);
    return () => window.clearTimeout(timer);
  }, [isDriver, autoTracking, enabled, withinWindow, shiftStartHour, setEnabled]);

  const shouldTrack = isDriver && enabled && withinWindow && !!profile?.id && !!profile?.company_id;

  const state = useDriverLocationTracking({
    enabled: shouldTrack,
    companyId: profile?.company_id ?? null,
    driverId: profile?.id ?? null,
    deliveryNoteId: activeDelivery?.id ?? null,
  });

  const nextShiftCheck = useMemo(() => {
    const d = new Date();
    const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), shiftEndHour, 0, 0, 0);
    if (end.getTime() <= d.getTime()) {
      const hour = d.getHours();
      const next = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour + 1, 0, 0, 0);
      return next;
    }
    return end;
  }, [shiftEndHour]);

  const raisePrompt = useCallback(async () => {
    if (!profile?.id || !profile.company_id) return;
    try {
      const { data } = await supabase
        .from('tracking_prompts')
        .insert({
          company_id: profile.company_id,
          driver_id: profile.id,
          delivery_note_id: activeDelivery?.id ?? null,
        })
        .select('id, sent_at')
        .maybeSingle();
      if (data) {
        setPrompt(data as PromptInfo);
        autoStopTimer.current = window.setTimeout(() => {
          void respondPromptInternal('auto_stopped');
        }, AUTO_STOP_DELAY_MS);
      }
    } catch (err) {
      logger.warn('raise prompt failed', { error: err });
    }
    // respondPromptInternal declared below; effect deps covered via useCallback below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, profile?.company_id, activeDelivery?.id]);

  const respondPromptInternal = useCallback(
    async (response: 'still_working' | 'finished' | 'break' | 'auto_stopped') => {
      if (!prompt || !profile?.id) return;
      if (autoStopTimer.current) {
        window.clearTimeout(autoStopTimer.current);
        autoStopTimer.current = null;
      }
      try {
        await supabase
          .from('tracking_prompts')
          .update({ response, responded_at: new Date().toISOString() })
          .eq('id', prompt.id);
        await supabase
          .from('profiles')
          .update({ tracking_last_confirmed_at: new Date().toISOString() })
          .eq('id', profile.id);

        if (response === 'finished' || response === 'auto_stopped') {
          setEnabled(false);
          setAutoStopped(response === 'auto_stopped');
          if (activeDelivery?.id) {
            await supabase
              .from('delivery_notes')
              .update({
                tracking_paused: true,
                tracking_auto_stopped_at: response === 'auto_stopped' ? new Date().toISOString() : null,
              })
              .eq('id', activeDelivery.id);
          }
        } else if (response === 'break') {
          const nextHour = new Date(Date.now() + 30 * 60 * 1000);
          setNextPromptAt(nextHour);
        }
        setPrompt(null);
      } catch (err) {
        logger.warn('respond prompt failed', { error: err });
      }
    },
    [prompt, profile?.id, activeDelivery?.id, setEnabled]
  );

  useEffect(() => {
    if (!enabled || !profile?.id || !profile.company_id) {
      setNextPromptAt(null);
      return;
    }
    setNextPromptAt(nextShiftCheck);
    const now = Date.now();
    const wait = nextShiftCheck.getTime() - now;
    if (wait <= 0) return;
    const timer = window.setTimeout(() => {
      void raisePrompt();
    }, wait);
    return () => window.clearTimeout(timer);
  }, [enabled, nextShiftCheck, profile?.id, profile?.company_id, raisePrompt]);

  const minutesRemaining = useMemo(() => {
    if (!prompt) return null;
    const elapsed = Date.now() - new Date(prompt.sent_at).getTime();
    const remain = AUTO_STOP_DELAY_MS - elapsed;
    return Math.max(0, Math.round(remain / 60000));
  }, [prompt, state.lastSentAt]);

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

  const clearAutoStartNote = useCallback(() => setAutoStartNote(null), []);

  const value: DriverTrackingContextValue = {
    enabled,
    setEnabled,
    autoTracking,
    setAutoTracking,
    shiftStartHour,
    shiftEndHour,
    setShiftHours,
    activeDelivery,
    state,
    autoStopped,
    autoStartNote,
    clearAutoStartNote,
    prompt,
    respondPrompt: respondPromptInternal,
    minutesRemaining,
    nextPromptAt,
    isWithinWorkingWindow: withinWindow,
  };

  return <DriverTrackingContext.Provider value={value}>{children}</DriverTrackingContext.Provider>;
}

export function useDriverTracking(): DriverTrackingContextValue {
  const ctx = useContext(DriverTrackingContext);
  if (!ctx) {
    throw new Error('useDriverTracking must be used within DriverTrackingProvider');
  }
  return ctx;
}
