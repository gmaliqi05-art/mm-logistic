import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

async function fetchVapidPublicKey(): Promise<string | null> {
  const { data } = await supabase
    .from('push_platform_settings')
    .select('vapid_public_key')
    .eq('id', 1)
    .maybeSingle();
  const key = data?.vapid_public_key?.trim();
  return key && key.length > 0 ? key : null;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications() {
  const { profile } = useAuth();
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission>('default');

  useEffect(() => {
    checkSupport();
    checkSubscription();
  }, [profile?.id]);

  async function checkSupport() {
    const supported =
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window;
    setIsSupported(supported);

    if (supported && Notification.permission) {
      setPermission(Notification.permission);
    }

    setLoading(false);
  }

  async function checkSubscription() {
    if (!profile?.id || !isSupported) return;

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setIsSubscribed(subscription !== null);
    } catch (error) {
      console.error('Error checking subscription:', error);
      setIsSubscribed(false);
    }
  }

  async function subscribe(options?: { silent?: boolean }): Promise<boolean> {
    if (!isSupported || !profile?.id) return false;

    try {
      const vapidKey = await fetchVapidPublicKey();
      if (!vapidKey) {
        console.error('VAPID public key is not configured');
        return false;
      }

      let permissionResult: NotificationPermission = Notification.permission;
      if (permissionResult !== 'granted') {
        if (options?.silent) return false;
        permissionResult = await Notification.requestPermission();
      }
      setPermission(permissionResult);

      if (permissionResult !== 'granted') {
        return false;
      }

      const registration = await navigator.serviceWorker.ready;

      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        await existing.unsubscribe();
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      const subscriptionJSON = subscription.toJSON();

      await supabase.from('push_subscriptions').upsert(
        {
          user_id: profile.id,
          endpoint: subscription.endpoint,
          p256dh_key: subscriptionJSON.keys?.p256dh || '',
          auth_key: subscriptionJSON.keys?.auth || '',
          user_agent: navigator.userAgent,
          device_name: getDeviceName(),
          is_active: true,
          last_used_at: new Date().toISOString(),
        },
        { onConflict: 'endpoint' },
      );

      setIsSubscribed(true);
      return true;
    } catch (error) {
      console.error('Error subscribing to push notifications:', error);
      return false;
    }
  }

  async function unsubscribe(): Promise<boolean> {
    if (!isSupported || !profile?.id) return false;

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await subscription.unsubscribe();

        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('user_id', profile.id)
          .eq('endpoint', subscription.endpoint);
      }

      setIsSubscribed(false);
      return true;
    } catch (error) {
      console.error('Error unsubscribing from push notifications:', error);
      return false;
    }
  }

  function getDeviceName(): string {
    const ua = navigator.userAgent;
    if (/android/i.test(ua)) return 'Android';
    if (/iPad|iPhone|iPod/.test(ua)) return 'iOS';
    if (/Windows/.test(ua)) return 'Windows';
    if (/Mac/.test(ua)) return 'Mac';
    if (/Linux/.test(ua)) return 'Linux';
    return 'Unknown';
  }

  return {
    isSupported,
    isSubscribed,
    loading,
    permission,
    subscribe,
    unsubscribe,
  };
}
