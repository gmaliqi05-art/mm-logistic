import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { logger } from '../utils/logger';
import type { Profile } from '../types';
import type { Session } from '@supabase/supabase-js';

interface AuthContextType {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        logger.error('Failed to fetch profile', { error });
        setProfile(null);
        return;
      }

      setProfile(data);
    } catch (err) {
      logger.error('Unexpected error fetching profile', { error: err });
      setProfile(null);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        // Restore session from local storage first (instant, no network).
        // This prevents a flash to login when reopening a PWA from background.
        const stored = window.localStorage.getItem('mm-logistic-auth');
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            const localSession: Session | null = parsed?.currentSession ?? parsed ?? null;
            if (localSession?.user && localSession?.access_token) {
              if (!cancelled) {
                setSession(localSession);
                await fetchProfile(localSession.user.id);
                setLoading(false);
              }
            }
          } catch (_) {
            // malformed storage, fall through to network
          }
        }

        // Now validate/refresh with the server (non-blocking for UI)
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        const s = data.session;
        setSession(s);
        if (s?.user) {
          await fetchProfile(s.user.id);
        } else if (!s) {
          setProfile(null);
        }
      } catch (err) {
        logger.warn('auth bootstrap failed', { error: err });
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void bootstrap();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'SIGNED_OUT') {
        setSession(null);
        setProfile(null);
        return;
      }
      setSession(s);
      if (s?.user) {
        (async () => {
          try {
            await fetchProfile(s.user.id);
          } catch (err) {
            logger.warn('profile refresh after auth change failed', { error: err });
          }
        })();
      } else {
        setProfile(null);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };

    if (data.user) {
      await fetchProfile(data.user.id);
    }

    return { error: null };
  };

  const signOut = async () => {
    // Tear down the push subscription BEFORE clearing auth — once the JWT is
    // gone we can no longer reach the DB to delete the push_subscriptions
    // row, and the browser PushManager would keep delivering pushes to the
    // device under the previous user's identity. Best-effort: failures here
    // shouldn't block logout.
    const userIdAtSignOut = session?.user?.id ?? null;
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        const sub = await registration?.pushManager.getSubscription();
        if (sub) {
          const endpoint = sub.endpoint;
          await sub.unsubscribe();
          if (userIdAtSignOut) {
            await supabase
              .from('push_subscriptions')
              .delete()
              .eq('user_id', userIdAtSignOut)
              .eq('endpoint', endpoint);
          }
        }
      } catch (err) {
        logger.warn('push unsubscribe on signOut failed', { error: err });
      }
    }

    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
    // Purge tenant- and user-scoped localStorage keys. Supabase
    // clears its own session token (mm-logistic-auth); these are
    // application-side keys that would otherwise leak between
    // accounts on a shared device. We deliberately keep cross-user
    // preferences (ep_language, ep_consent, install/push dismissals).
    if (typeof window !== 'undefined') {
      try {
        // Explicit allowlist of every user/tenant-scoped key the app
        // writes. Kept manually rather than prefix-purging to avoid
        // wiping cross-user preferences (ep_language, ep_consent,
        // PWA install/push dismissals).
        const KEYS_TO_CLEAR = [
          'driver_tracking_enabled',
          'driver_tracking_overtime_until',
          'driver_perms_asked_v1',
          'mml.nav.openGroups',
          'mml.depotNav.openGroups',
          'mml.driverNav.openGroups',
          'acc_default_currency',
          'acc_default_payment_days',
          'acc_default_bank_account',
        ];
        for (const k of KEYS_TO_CLEAR) window.localStorage.removeItem(k);
      } catch { /* localStorage may be blocked */ }
    }
  };

  const refreshProfile = async () => {
    if (session?.user) {
      await fetchProfile(session.user.id);
    }
  };

  return (
    <AuthContext.Provider value={{ session, profile, loading, signIn, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
