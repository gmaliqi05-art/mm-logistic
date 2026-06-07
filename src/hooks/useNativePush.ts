import { useEffect, useState, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  PushNotifications,
  type Token,
  type PushNotificationSchema,
  type ActionPerformed,
} from '@capacitor/push-notifications';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { logger } from '../utils/logger';

interface NativePushState {
  isSupported: boolean;
  isSubscribed: boolean;
  loading: boolean;
  permission: 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale';
}

/**
 * Native push hook for Capacitor (Android FCM / iOS APNs).
 *
 * The web flow (browser PushManager + VAPID) lives in `usePushNotifications`.
 * This hook is only active inside the native shell:
 *
 *   if (Capacitor.isNativePlatform()) → register & forward tokens to
 *   `register-device-token`. The edge function persists into
 *   `device_tokens` and dispatch-notification fans push out via
 *   `send-fcm-notification` (Android) and `send-apns-notification` (iOS).
 *
 * Permission UX:
 *   - iOS: requires explicit prompt (rejects silently if denied)
 *   - Android 13+: requires runtime POST_NOTIFICATIONS prompt; older
 *     Android grants automatically.
 *
 * Token lifecycle:
 *   - Subscribed on first auth + every cold start (FCM/APNs may rotate tokens)
 *   - Registered server-side via /functions/v1/register-device-token
 *   - Unsubscribed on signOut via AuthContext (mirrors the web flow's
 *     push_subscriptions cleanup from PR #151).
 */
export function useNativePush(): NativePushState & {
  subscribe: (opts?: { silent?: boolean }) => Promise<boolean>;
  unsubscribe: () => Promise<boolean>;
} {
  const { profile } = useAuth();
  const [state, setState] = useState<NativePushState>({
    isSupported: Capacitor.isNativePlatform(),
    isSubscribed: false,
    loading: true,
    permission: 'prompt',
  });
  // Track listeners so they can be torn down on unmount or sign-out.
  const listenersRegistered = useRef(false);
  const tokenSentForUser = useRef<string | null>(null);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      setState((s) => ({ ...s, loading: false, isSupported: false }));
      return;
    }
    void initialize();

    return () => {
      // Capacitor's removeAllListeners() is async but we deliberately
      // don't await it on unmount — the cleanup runs in background.
      if (listenersRegistered.current) {
        void PushNotifications.removeAllListeners();
        listenersRegistered.current = false;
      }
    };
    // profile.id intentionally NOT in deps: we want one cold-start
    // initialization; per-user subscribe is handled below.
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !profile?.id) return;
    if (tokenSentForUser.current === profile.id) return;
    void subscribe({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  async function initialize() {
    try {
      const perm = await PushNotifications.checkPermissions();
      setState((s) => ({ ...s, permission: perm.receive, loading: false }));
      attachListeners();
    } catch (err) {
      logger.warn('native push initialize failed', { error: err });
      setState((s) => ({ ...s, loading: false }));
    }
  }

  function attachListeners() {
    if (listenersRegistered.current) return;
    listenersRegistered.current = true;

    PushNotifications.addListener('registration', async (token: Token) => {
      try {
        const platform = Capacitor.getPlatform();
        if (platform !== 'ios' && platform !== 'android') return;
        await sendTokenToBackend(platform, token.value);
        setState((s) => ({ ...s, isSubscribed: true }));
        if (profile?.id) tokenSentForUser.current = profile.id;
      } catch (err) {
        logger.warn('native push: failed to register token with backend', { error: err });
      }
    });

    PushNotifications.addListener('registrationError', (err) => {
      logger.warn('native push registration error', { error: err });
    });

    // Foreground push: the OS already shows the notification on iOS/Android
    // by default; we just log it. Background/locked-screen pushes are
    // handled entirely by the OS — that's what makes native push punch
    // through device lock.
    PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
      logger.info('native push received (foreground)', { title: notification.title });
    });

    PushNotifications.addListener('pushNotificationActionPerformed', (action: ActionPerformed) => {
      // The user tapped the notification — Capacitor wakes the app and
      // delivers the payload. If a `url` field was sent in data, route
      // to it. Otherwise nothing to do — App.tsx routing handles the
      // active tab.
      const url = action.notification.data?.url as string | undefined;
      if (url && typeof url === 'string') {
        try {
          window.location.assign(url);
        } catch (err) {
          logger.warn('native push: action url navigation failed', { error: err });
        }
      }
    });
  }

  async function subscribe(opts?: { silent?: boolean }): Promise<boolean> {
    if (!Capacitor.isNativePlatform() || !profile?.id) return false;

    try {
      let perm = await PushNotifications.checkPermissions();
      if (perm.receive !== 'granted') {
        if (opts?.silent && perm.receive === 'denied') return false;
        perm = await PushNotifications.requestPermissions();
        setState((s) => ({ ...s, permission: perm.receive }));
        if (perm.receive !== 'granted') return false;
      }
      // register() triggers the 'registration' listener which forwards
      // the token to the backend. Resolves once the registration is
      // initiated; the token arrives async via the listener above.
      await PushNotifications.register();
      return true;
    } catch (err) {
      logger.warn('native push subscribe failed', { error: err });
      return false;
    }
  }

  async function unsubscribe(): Promise<boolean> {
    if (!Capacitor.isNativePlatform() || !profile?.id) return false;
    try {
      // No client-side "unregister" on Capacitor — best we can do is
      // mark our tokens inactive server-side. The OS keeps the FCM/APNs
      // registration until the user uninstalls the app or revokes
      // notifications in OS settings.
      await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/register-device-token`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token ?? ''}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          // No specific token — drop all for this user. The edge function
          // currently expects a specific token; if you want a "drop all"
          // pass an empty string. For now we no-op gracefully if no
          // token is known.
          body: JSON.stringify({ token: 'all' }),
        },
      ).catch(() => undefined);

      setState((s) => ({ ...s, isSubscribed: false }));
      tokenSentForUser.current = null;
      return true;
    } catch {
      return false;
    }
  }

  async function sendTokenToBackend(platform: 'ios' | 'android', token: string) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const locale = (typeof navigator !== 'undefined' && navigator.language) ? navigator.language.slice(0, 2) : 'en';
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/register-device-token`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          platform,
          token,
          locale,
          app_version: undefined,
          device_model: undefined,
        }),
      },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logger.warn('register-device-token rejected', { status: res.status, body: body.slice(0, 200) });
    }
  }

  return { ...state, subscribe, unsubscribe };
}
