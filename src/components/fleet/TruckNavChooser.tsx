import { Info, Navigation, Truck, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../../i18n';

interface Props {
  destLat: number;
  destLng: number;
  label?: string;
  onClose: () => void;
}

type Platform = 'ios' | 'android' | 'other';

interface NavApp {
  name: string;
  tag: string;
  description: string;
  free: boolean;
  scheme: (lat: number, lng: number, label?: string) => string;
  androidStore: string;
  iosStore: string;
}

const APPS: NavApp[] = [
  {
    name: 'OsmAnd',
    tag: 'Rekomandohet - falas',
    description: 'Open-source me profil specifik per kamiona (HGV): peshe, lartesi, gjeresi dhe kufizime te rrugeve per LKW.',
    free: true,
    scheme: (lat, lng) => `osmand.api://navigate?dest_lat=${lat}&dest_lon=${lng}&profile=truck&show_search_results=false`,
    androidStore: 'https://play.google.com/store/apps/details?id=net.osmand',
    iosStore: 'https://apps.apple.com/app/osmand-maps-travel-navigate/id934850257',
  },
  {
    name: 'Sygic Truck',
    tag: 'Standardi i flotave',
    description: 'Rruge te dedikuara per kamiona me rregulla EU (peshe, lartesi, gjeresi, ADR). Kerkon licence.',
    free: false,
    scheme: (lat, lng) => `com.sygic.aura://coordinate|${lng}|${lat}|drive`,
    androidStore: 'https://play.google.com/store/apps/details?id=com.sygic.truck',
    iosStore: 'https://apps.apple.com/app/sygic-truck-caravan-gps/id1310573318',
  },
];

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent || '';
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  if (/mac/i.test(ua) && (navigator.maxTouchPoints ?? 0) > 1) return 'ios';
  return 'other';
}

export default function TruckNavChooser({ destLat, destLng, label, onClose }: Props) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [launching, setLaunching] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const platform = detectPlatform();

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  async function copyCoords() {
    try {
      await navigator.clipboard.writeText(`${destLat}, ${destLng}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* noop */
    }
  }

  function launch(app: NavApp) {
    const storeUrl = platform === 'ios' ? app.iosStore : app.androidStore;

    if (platform === 'other') {
      window.open(storeUrl, '_blank', 'noopener');
      return;
    }

    setLaunching(app.name);
    const startedAt = Date.now();
    let handled = false;

    const cleanup = () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('blur', onHide);
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const onVisibility = () => {
      if (document.hidden) {
        handled = true;
        cleanup();
        setLaunching(null);
      }
    };
    const onHide = () => {
      handled = true;
      cleanup();
      setLaunching(null);
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onHide);
    window.addEventListener('blur', onHide);

    timerRef.current = window.setTimeout(() => {
      cleanup();
      setLaunching(null);
      if (handled) return;
      if (Date.now() - startedAt < 2500) {
        window.location.href = storeUrl;
      }
    }, 1500);

    try {
      window.location.href = app.scheme(destLat, destLng, label);
    } catch {
      cleanup();
      setLaunching(null);
      window.location.href = storeUrl;
    }
  }

  return (
    <div className="fixed inset-0 z-[1100] flex items-end sm:items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-in">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-teal-600" />
            <h2 className="text-lg font-bold text-slate-900">{t('common.truckNavigation')}</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100" aria-label="Mbyll">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-start gap-2 text-xs bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-900">
            <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-semibold">Mos perdor Google Maps per navigim</div>
              <div className="mt-0.5">
                Google Maps dhe Waze nuk kane profil per kamiona — ato dergojne neper rruge ku LKW nuk lejohen. Perdor nje nga aplikacionet me profil HGV me poshte.
              </div>
            </div>
          </div>

          <div className="text-xs text-slate-500">
            Destinacioni: <span className="font-mono text-slate-700">{destLat.toFixed(5)}, {destLng.toFixed(5)}</span>
          </div>

          <div className="space-y-3">
            {APPS.map((app) => {
              const isLaunching = launching === app.name;
              return (
                <div key={app.name} className="rounded-xl border border-teal-200 bg-teal-50/40 p-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-900">{app.name}</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 bg-teal-600 text-white rounded uppercase">HGV</span>
                    {app.free ? (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded">Falas</span>
                    ) : (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-slate-200 text-slate-700 rounded">Me pagese</span>
                    )}
                    <span className="text-[10px] text-slate-500 italic">{app.tag}</span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1 leading-snug">{app.description}</p>

                  <button
                    onClick={() => launch(app)}
                    disabled={isLaunching}
                    className="w-full mt-3 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-70"
                  >
                    <Navigation className="w-4 h-4" />
                    {isLaunching ? `Duke hapur ${app.name}...` : `Hap ne ${app.name}`}
                  </button>
                  <p className="text-[11px] text-slate-500 mt-1.5 text-center">
                    {platform === 'other'
                      ? 'Ne desktop hapet faqja e shkarkimit.'
                      : 'Nese nuk eshte i instaluar, hapet automatikisht dyqani per shkarkim.'}
                  </p>
                </div>
              );
            })}
          </div>

          <button
            onClick={copyCoords}
            className="w-full text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg py-2.5"
          >
            {copied ? 'Koordinatat u kopjuan' : 'Kopjo koordinatat'}
          </button>
        </div>
      </div>
    </div>
  );
}
