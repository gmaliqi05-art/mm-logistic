import { ExternalLink, Info, Navigation, Truck, X } from 'lucide-react';
import { useState } from 'react';

interface Props {
  destLat: number;
  destLng: number;
  label?: string;
  onClose: () => void;
}

interface NavApp {
  name: string;
  tag: string;
  description: string;
  free: boolean;
  truckProfile: boolean;
  openUrl: (lat: number, lng: number, label?: string) => string;
  installAndroid?: string;
  installIos?: string;
  platformNote?: string;
}

const APPS: NavApp[] = [
  {
    name: 'OsmAnd',
    tag: 'Rekomandohet',
    description: 'Falas, open-source. Ka profil specifik per kamiona (HGV) me ndalesa per pesha, lartesi dhe kufizime.',
    free: true,
    truckProfile: true,
    openUrl: (lat, lng) => `osmand.navigation:q=${lat},${lng}`,
    installAndroid: 'https://play.google.com/store/apps/details?id=net.osmand',
    installIos: 'https://apps.apple.com/app/osmand-maps-travel-navigate/id934850257',
  },
  {
    name: 'Sygic Truck',
    tag: 'Standardi i flotave',
    description: 'Ruten specifike per kamiona me rregulla EU (peshe, lartesi, gjeresi, ADR). Aplikacioni kerkon licence.',
    free: false,
    truckProfile: true,
    openUrl: (lat, lng) => `com.sygic.aura://coordinate|${lng}|${lat}|drive`,
    installAndroid: 'https://play.google.com/store/apps/details?id=com.sygic.truck',
    installIos: 'https://apps.apple.com/app/sygic-truck-caravan-gps/id1310573318',
  },
  {
    name: 'Magic Earth',
    tag: 'Alternative falas',
    description: 'Falas me profil kamioni, pa reklama. Mbulim i mire per Europen.',
    free: true,
    truckProfile: true,
    openUrl: (lat, lng, label) => `magicearth://?drive_to&lat=${lat}&lon=${lng}${label ? `&name=${encodeURIComponent(label)}` : ''}`,
    installAndroid: 'https://play.google.com/store/apps/details?id=com.generalmagic.magicearth',
    installIos: 'https://apps.apple.com/app/magic-earth-navigation-maps/id1008279475',
  },
  {
    name: 'HERE WeGo',
    tag: 'Pa profil kamioni',
    description: 'Falas por pa profil te dedikuar per kamiona. Perdor vetem si alternative emergjence.',
    free: true,
    truckProfile: false,
    openUrl: (lat, lng) => `https://wego.here.com/directions/drive/mylocation/${lat},${lng}`,
    platformNote: 'Hapet ne shfletues ose aplikacion.',
  },
];

export default function TruckNavChooser({ destLat, destLng, label, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  async function copyCoords() {
    try {
      await navigator.clipboard.writeText(`${destLat}, ${destLng}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* noop */
    }
  }

  function openApp(app: NavApp) {
    const url = app.openUrl(destLat, destLng, label);
    window.location.href = url;
  }

  return (
    <div className="fixed inset-0 z-[1100] flex items-end sm:items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-in">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-teal-600" />
            <h2 className="text-lg font-bold text-slate-900">Navigim per Kamiona</h2>
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
              <div className="mt-0.5">Google Maps dhe Waze nuk kane profil per kamiona — ato dergojne neper rruge ku LKW nuk lejohen (kufizime per peshe, lartesi, qytete). Perdor nje nga aplikacionet me profil HGV me poshte.</div>
            </div>
          </div>

          <div className="text-xs text-slate-500">
            Destinacioni: <span className="font-mono text-slate-700">{destLat.toFixed(5)}, {destLng.toFixed(5)}</span>
          </div>

          <div className="space-y-2.5">
            {APPS.map((app) => (
              <div key={app.name} className={`rounded-xl border p-3 ${app.truckProfile ? 'border-teal-200 bg-teal-50/40' : 'border-slate-200'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900">{app.name}</span>
                      {app.truckProfile && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 bg-teal-600 text-white rounded uppercase">HGV</span>
                      )}
                      {app.free ? (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded">Falas</span>
                      ) : (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-slate-200 text-slate-700 rounded">Me pagese</span>
                      )}
                      <span className="text-[10px] text-slate-500 italic">{app.tag}</span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1 leading-snug">{app.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <button
                    onClick={() => openApp(app)}
                    className="flex-1 min-w-[140px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700"
                  >
                    <Navigation className="w-3.5 h-3.5" /> Hap ne {app.name}
                  </button>
                  {app.installAndroid && (
                    <a
                      href={app.installAndroid}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold hover:bg-slate-200"
                    >
                      <ExternalLink className="w-3 h-3" /> Android
                    </a>
                  )}
                  {app.installIos && (
                    <a
                      href={app.installIos}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold hover:bg-slate-200"
                    >
                      <ExternalLink className="w-3 h-3" /> iOS
                    </a>
                  )}
                </div>
              </div>
            ))}
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
