import { useEffect, useState } from 'react';
import { Bell, MapPin, X } from 'lucide-react';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { useAuth } from '../contexts/AuthContext';

const STORAGE_KEY = 'driver_perms_asked_v1';

type Ask = { geolocation: boolean; notifications: boolean };

function readAsk(): Ask {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { geolocation: false, notifications: false };
    const parsed = JSON.parse(raw) as Partial<Ask>;
    return { geolocation: !!parsed.geolocation, notifications: !!parsed.notifications };
  } catch {
    return { geolocation: false, notifications: false };
  }
}

function writeAsk(next: Ask) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

export default function DriverPermissionsGate() {
  const { profile } = useAuth();
  const { isSupported: pushSupported, permission: pushPermission, subscribe } = usePushNotifications();
  const [geoState, setGeoState] = useState<PermissionState | 'unknown'>('unknown');
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.role !== 'driver') return;
    let mounted = true;
    const asked = readAsk();

    const ask = async () => {
      try {
        if (navigator.permissions?.query) {
          const res = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
          if (!mounted) return;
          setGeoState(res.state);
          res.addEventListener?.('change', () => setGeoState(res.state));
          if (res.state === 'prompt' && !asked.geolocation) {
            writeAsk({ ...asked, geolocation: true });
            navigator.geolocation.getCurrentPosition(
              () => {
                setGeoState('granted');
              },
              () => {
                setGeoState('denied');
              },
              { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
            );
          }
        } else if ('geolocation' in navigator && !asked.geolocation) {
          writeAsk({ ...asked, geolocation: true });
          navigator.geolocation.getCurrentPosition(
            () => setGeoState('granted'),
            () => setGeoState('denied'),
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
          );
        }
      } catch {
        // ignore
      }

      if (pushSupported && pushPermission === 'default' && !asked.notifications) {
        writeAsk({ ...readAsk(), notifications: true });
        try {
          await subscribe({ silent: false });
        } catch {
          // user dismissed
        }
      }
    };

    const timer = window.setTimeout(() => {
      void ask();
    }, 400);

    return () => {
      mounted = false;
      window.clearTimeout(timer);
    };
  }, [profile?.role, pushSupported, pushPermission, subscribe]);

  if (profile?.role !== 'driver' || dismissed) return null;

  const geoBlocked = geoState === 'denied';
  const pushBlocked = pushSupported && pushPermission === 'denied';
  if (!geoBlocked && !pushBlocked) return null;

  const enableGeo = async () => {
    setBusy(true);
    try {
      await new Promise<void>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          () => {
            setGeoState('granted');
            resolve();
          },
          () => {
            setGeoState('denied');
            resolve();
          },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
        );
      });
    } finally {
      setBusy(false);
    }
  };

  const enablePush = async () => {
    setBusy(true);
    try {
      const ok = await subscribe({ silent: false });
      if (!ok && Notification.permission === 'denied') {
        setHint('Njoftimet jane te bllokuara. Hapi nga cilesimet e shfletuesit.');
      }
    } finally {
      setBusy(false);
    }
  };

  const needLabel = geoBlocked && pushBlocked
    ? 'Aktivizo lokacionin dhe njoftimet'
    : geoBlocked
      ? 'Aktivizo lokacionin'
      : 'Aktivizo njoftimet';
  const Icon = geoBlocked && !pushBlocked ? MapPin : Bell;
  const handleClick = () => {
    if (geoBlocked) void enableGeo();
    if (pushBlocked) void enablePush();
  };

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 mb-3">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-amber-700 flex-shrink-0" />
        <span className="text-xs text-amber-900 flex-1 min-w-0 truncate">{needLabel}</span>
        <button
          type="button"
          onClick={handleClick}
          disabled={busy}
          className="inline-flex items-center text-[11px] font-semibold px-2.5 py-1 rounded-md bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60 flex-shrink-0"
        >
          {busy ? '...' : 'Aktivizo'}
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-amber-700 hover:text-amber-900 flex-shrink-0"
          aria-label="Mbyll"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {hint && <p className="text-[11px] text-amber-800 mt-1 pl-6">{hint}</p>}
    </div>
  );
}
