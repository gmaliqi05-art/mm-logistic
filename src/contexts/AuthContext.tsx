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
    // Guard against a stuck auth bootstrap (common on installed PWAs with
    // a stale service worker / frozen network). After 8s we release the
    // loading state so the UI can continue to render.
    const safety = window.setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 8000);

    const bootstrap = async () => {
      try {
        const timeoutPromise = new Promise<{ data: { session: null } }>((resolve) => {
          window.setTimeout(() => resolve({ data: { session: null } }), 7000);
        });
        const result = await Promise.race([
          supabase.auth.getSession(),
          timeoutPromise,
        ]);
        if (cancelled) return;
        const s = (result as { data: { session: Session | null } }).data.session;
        setSession(s);
        if (s?.user) {
          await fetchProfile(s.user.id);
        }
      } catch (err) {
        logger.warn('auth bootstrap failed', { error: err });
      } finally {
        if (!cancelled) {
          window.clearTimeout(safety);
          setLoading(false);
        }
      }
    };

    void bootstrap();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
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
      window.clearTimeout(safety);
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
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
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
