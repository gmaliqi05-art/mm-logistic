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
      await subscribe({ silent: false });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 mb-4 flex flex-col sm:flex-row sm:items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-amber-900 mb-1">
          Lejime te nevojshme
        </div>
        <ul className="text-sm text-amber-800 space-y-1">
          {geoBlocked && (
            <li className="flex items-start gap-2">
              <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>
                Lokacioni eshte i bllokuar. Hape nga cilesimet e shfletuesit qe
                kompania te shohe gjurmimin tuaj.
              </span>
            </li>
          )}
          {pushBlocked && (
            <li className="flex items-start gap-2">
              <Bell className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>
                Njoftimet jane te bllokuara. Aktivizoji per te marre lajmerime
                kur kompania te kerkon veprim.
              </span>
            </li>
          )}
        </ul>
        <div className="flex flex-wrap gap-2 mt-3">
          {geoBlocked && (
            <button
              type="button"
              onClick={enableGeo}
              disabled={busy}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60"
            >
              <MapPin className="w-3.5 h-3.5" />
              Lejo lokacionin
            </button>
          )}
          {pushBlocked && (
            <button
              type="button"
              onClick={enablePush}
              disabled={busy}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60"
            >
              <Bell className="w-3.5 h-3.5" />
              Lejo njoftimet
            </button>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="text-amber-700 hover:text-amber-900 self-start"
        aria-label="Mbyll"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
