import { useState, useEffect } from 'react';
import { Bell, X } from 'lucide-react';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { useAuth } from '../contexts/AuthContext';

const DISMISSED_KEY = 'push-enable-dismissed';

export default function PushEnableBanner() {
  const { profile } = useAuth();
  const { isSupported, isSubscribed, loading, permission, subscribe } = usePushNotifications();
  const [dismissed, setDismissed] = useState(false);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISSED_KEY)) {
      setDismissed(true);
    }
  }, []);

  if (!profile?.id || loading || !isSupported || isSubscribed || dismissed) return null;
  if (permission === 'denied') return null;
  if (permission !== 'default') return null;

  const handleEnable = async () => {
    setWorking(true);
    const ok = await subscribe();
    setWorking(false);
    if (ok) {
      setDismissed(true);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, Date.now().toString());
    setDismissed(true);
  };

  return (
    <div className="fixed bottom-20 left-4 right-4 sm:left-auto sm:right-4 sm:w-96 z-[9998]">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 p-2.5 bg-teal-50 rounded-xl">
            <Bell className="h-5 w-5 text-teal-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-slate-800">
              Aktivizo njoftimet
            </h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Merr njoftime ne kohe reale per fletedergesa, mesazhe dhe dokumente te reja.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={handleEnable}
                disabled={working}
                className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white text-xs font-semibold rounded-lg hover:bg-teal-700 transition-colors shadow-sm disabled:opacity-60"
              >
                <Bell className="h-3.5 w-3.5" />
                {working ? 'Duke aktivizuar...' : 'Aktivizo'}
              </button>
              <button
                onClick={handleDismiss}
                className="px-3 py-2 text-xs text-slate-500 hover:text-slate-700 font-medium transition-colors"
              >
                Jo tani
              </button>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 p-1 text-slate-400 hover:text-slate-600 transition-colors rounded-lg hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
