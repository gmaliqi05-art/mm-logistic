import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Calculator, Crosshair, MapPin, Navigation, Route, Search, Timer, Truck } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { useTranslation } from '../../i18n';
import { logger } from '../../utils/logger';
import RouteMapPicker, { reverseGeocode, type Point } from '../../components/fleet/RouteMapPicker';

interface CountrySegment { country_code: string; country_name: string; km: number }
interface DriverRoute {
  distance_km: number;
  duration_min: number;
  country_breakdown: CountrySegment[];
  geometry: [number, number][];
}

async function geocode(query: string): Promise<Point | null> {
  const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`);
  const arr = (await r.json()) as Array<{ lat: string; lon: string; display_name: string }>;
  if (arr.length === 0) return null;
  return { lat: Number(arr[0].lat), lng: Number(arr[0].lon), label: arr[0].display_name };
}

export default function DriverRoutePlanner() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [origin, setOrigin] = useState<Point | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [destText, setDestText] = useState('');
  const [dest, setDest] = useState<Point | null>(null);
  const [pickMode, setPickMode] = useState<'destination' | null>(null);
  const [loading, setLoading] = useState(false);
  const [route, setRoute] = useState<DriverRoute | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setGpsError('GPS nuk mbeshtetet nga pajisja.');
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: 'Vendndodhja aktuale (GPS)' });
        setGpsError(null);
      },
      (err) => setGpsError(err.message || 'Nuk mund te marrim GPS.'),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  async function handleSetDest(p: Point) {
    setDest(p);
    setPickMode(null);
    const label = await reverseGeocode(p.lat, p.lng);
    setDestText(label);
  }

  async function handlePlan() {
    setError(null);
    setLoading(true);
    try {
      if (!origin) throw new Error(t('driver.routePlannerErrors.noGps') || 'Nuk kemi GPS. Aktivizo tracking-un.');
      let d = dest;
      if (!d && destText.trim()) d = await geocode(destText);
      if (!d) throw new Error(t('driver.routePlannerErrors.destinationNotFound') || 'Nuk u gjet destinacioni. Kliko ne harte ose shkruaj adresen.');
      setDest(d);

      const { data, error: fnErr } = await supabase.functions.invoke('plan-truck-route', {
        body: {
          origin,
          destination: d,
          vehicle_profile: 'driving-hgv',
          prefer: 'fastest',
          driver_id: profile?.id ?? null,
          company_id: profile?.company_id ?? null,
        },
      });
      if (fnErr) throw fnErr;
      if (!data || data.error) throw new Error(data?.error ?? 'Gabim gjate kalkulimit');

      const selected = data.selected as {
        distance_km: number;
        duration_min: number;
        country_breakdown: CountrySegment[];
        geometry: [number, number][];
      };
      setRoute({
        distance_km: selected.distance_km,
        duration_min: selected.duration_min,
        country_breakdown: selected.country_breakdown.map((c) => ({
          country_code: c.country_code,
          country_name: c.country_name,
          km: c.km,
        })),
        geometry: selected.geometry,
      });
    } catch (err) {
      logger.warn('plan route failed', { error: err });
      setError(err instanceof Error ? err.message : 'Gabim gjate kalkulimit');
    } finally {
      setLoading(false);
    }
  }

  const alternatives = useMemo(
    () => (route ? [{ label: 'fastest', geometry: route.geometry }] : []),
    [route],
  );
  const hours = route ? Math.floor(route.duration_min / 60) : 0;
  const minutes = route ? Math.round(route.duration_min % 60) : 0;

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Route className="w-6 h-6 text-teal-600" /> Planifiko Rrugen
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Nisja merret automatikisht nga GPS. Vendos vetem destinacionin.
        </p>
      </div>

      <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 flex items-center gap-2 text-sm text-teal-900">
        <Truck className="w-4 h-4" />
        <span>Kalkulimi perdor vetem rruget e lejuara per kamiona (HGV).</span>
      </div>

      {gpsError && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 text-amber-600 flex-shrink-0" />
          <div className="flex-1">
            <div className="font-semibold text-amber-900">{t('common.gpsNotActive')}</div>
            <div className="text-amber-800 text-xs mt-0.5">{gpsError}</div>
            <Link to="/driver/tracking" className="inline-block mt-1 text-xs font-semibold text-teal-700 underline">
              Hap tracking-un
            </Link>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div>
          <label className="text-xs font-semibold text-slate-600 uppercase">Nisja (GPS live)</label>
          <div className="mt-1 flex items-center gap-2 px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm">
            <MapPin className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span className="truncate text-slate-800">
              {origin ? `${origin.lat.toFixed(5)}, ${origin.lng.toFixed(5)}` : 'Duke marre GPS...'}
            </span>
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-600 uppercase">Destinacioni</label>
          <div className="relative mt-1 flex gap-2">
            <div className="relative flex-1">
              <Navigation className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-600" />
              <input
                value={destText}
                onChange={(e) => { setDestText(e.target.value); setDest(null); }}
                placeholder="p.sh. Zurich, Hauptstrasse 12"
                className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-teal-500 outline-none text-sm"
              />
            </div>
            <button
              type="button"
              onClick={() => setPickMode(pickMode === 'destination' ? null : 'destination')}
              className={`px-3 rounded-lg border text-xs font-semibold flex items-center gap-1 ${pickMode === 'destination' ? 'bg-red-600 text-white border-red-600' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}
            >
              <Crosshair className="w-3.5 h-3.5" /> Harte
            </button>
          </div>
        </div>

        <button
          onClick={handlePlan}
          disabled={loading || !origin || (!destText.trim() && !dest)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold disabled:opacity-50"
        >
          {loading ? <Search className="w-4 h-4 animate-pulse" /> : <Calculator className="w-4 h-4" />}
          {loading ? 'Duke kalkuluar...' : 'Kalkulo Rrugen'}
        </button>

        {error && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</div>
        )}
      </div>

      <RouteMapPicker
        origin={origin}
        dest={dest}
        mode={pickMode}
        allowOriginEdit={false}
        onSetDest={handleSetDest}
        alternatives={alternatives}
        selectedIdx={0}
        height={380}
      />

      {route && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase">
                <Route className="w-3.5 h-3.5 text-teal-600" /> Distanca
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-1">{route.distance_km} km</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase">
                <Timer className="w-3.5 h-3.5 text-teal-600" /> Koha
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-1">{hours}h {minutes}min</div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-2">Vendet qe pershkohen</h3>
            <div className="space-y-1.5">
              {route.country_breakdown.map((c) => (
                <div key={c.country_code} className="flex items-center justify-between text-sm py-1.5 border-b border-slate-100 last:border-0">
                  <span className="font-medium text-slate-800">
                    {c.country_name} <span className="text-xs text-slate-500">({c.country_code})</span>
                  </span>
                  <span className="text-slate-600">{c.km} km</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
