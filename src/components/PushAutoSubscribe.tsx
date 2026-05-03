import { useEffect, useRef } from 'react';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { useAuth } from '../contexts/AuthContext';

export default function PushAutoSubscribe() {
  const { profile } = useAuth();
  const { isSupported, isSubscribed, loading, permission, subscribe } = usePushNotifications();
  const attempted = useRef<string | null>(null);

  useEffect(() => {
    if (loading || !isSupported || !profile?.id) return;
    if (attempted.current === profile.id) return;
    if (isSubscribed) {
      attempted.current = profile.id;
      return;
    }
    if (permission === 'granted') {
      attempted.current = profile.id;
      void subscribe();
    }
  }, [profile?.id, loading, isSupported, isSubscribed, permission, subscribe]);

  return null;
}
