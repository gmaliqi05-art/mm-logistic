import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Calculator, MapPin, Navigation, Route, Search, Timer, Truck } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { logger } from '../../utils/logger';

interface Point { lat: number; lng: number; label?: string }
interface CountrySegment {
  country_code: string;
  country_name: string;
  km: number;
}
interface DriverRoute {
  distance_km: number;
  duration_min: number;
  country_breakdown: CountrySegment[];
  geometry: [number, number][];
}

const originIcon = L.divIcon({
  className: '',
  html: `<div style="width:18px;height:18px;border-radius:50%;background:#10b981;border:3px solid white;box-shadow:0 0 0 2px #10b981"></div>`,
  iconSize: [18, 18], iconAnchor: [9, 9],
});
const destIcon = L.divIcon({
  className: '',
  html: `<div style="width:18px;height:18px;border-radius:50%;background:#dc2626;border:3px solid white;box-shadow:0 0 0 2px #dc2626"></div>`,
  iconSize: [18, 18], iconAnchor: [9, 9],
});

function FitToRoute({ geometry }: { geometry: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (geometry.length === 0) return;
    const bounds = L.latLngBounds(geometry.map(([lng, lat]) => [lat, lng] as [number, number]));
    map.fitBounds(bounds, { padding: [40, 40] });
  }, [geometry, map]);
  return null;
}

async function geocode(query: string): Promise<Point | null> {
  const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`);
  const arr = (await r.json()) as Array<{ lat: string; lon: string; display_name: string }>;
  if (arr.length === 0) return null;
  return { lat: Number(arr[0].lat), lng: Number(arr[0].lon), label: arr[0].display_name };
}

export default function DriverRoutePlanner() {
  const { profile } = useAuth();
  const [originText, setOriginText] = useState('');
  const [destText, setDestText] = useState('');
  const [origin, setOrigin] = useState<Point | null>(null);
  const [dest, setDest] = useState<Point | null>(null);
  const [loading, setLoading] = useState(false);
  const [route, setRoute] = useState<DriverRoute | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (origin) return;
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: 'Vendndodhja aktuale' });
        setOriginText(`${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`);
      },
      () => {},
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
    );
  }, [origin]);

  const geometryLatLng = useMemo(() => {
    if (!route) return [] as [number, number][];
    return route.geometry.map(([lng, lat]) => [lat, lng] as [number, number]);
  }, [route]);

  async function resolveOrigin(): Promise<Point | null> {
    if (origin && originText.startsWith(`${origin.lat.toFixed(5)}`)) return origin;
    if (!originText.trim()) return origin;
    const p = await geocode(originText);
    if (p) setOrigin(p);
    return p;
  }

  async function handlePlan() {
    setError(null);
    setLoading(true);
    try {
      const o = await resolveOrigin();
      if (!o) throw new Error('Nuk u gjet adresa e nisjes.');
      let d = dest;
      if (!d || (destText && destText !== d.label)) {
        d = await geocode(destText);
      }
      if (!d) throw new Error('Nuk u gjet adresa e destinacionit.');
      setDest(d);

      const { data, error: fnErr } = await supabase.functions.invoke('plan-truck-route', {
        body: {
          origin: o,
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

  const center: [number, number] = origin ? [origin.lat, origin.lng] : [50.1, 10.3];
  const hours = route ? Math.floor(route.duration_min / 60) : 0;
  const minutes = route ? route.duration_min % 60 : 0;

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Route className="w-6 h-6 text-teal-600" /> Planifiko Rrugen
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Rruga e lejuar per kamiona - distanca dhe koha e udhetimit.
        </p>
      </div>

      <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 flex items-center gap-2 text-sm text-teal-900">
        <Truck className="w-4 h-4" />
        <span>Kalkulimi perdor vetem rruget e lejuara per kamiona (HGV).</span>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-600 uppercase">Nisja</label>
            <div className="relative mt-1">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-600" />
              <input
                value={originText}
                onChange={(e) => setOriginText(e.target.value)}
                placeholder="Adresa ose vendndodhja aktuale"
                className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-teal-500 outline-none text-sm"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 uppercase">Destinacioni</label>
            <div className="relative mt-1">
              <Navigation className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-600" />
              <input
                value={destText}
                onChange={(e) => setDestText(e.target.value)}
                placeholder="p.sh. Zurich, Hauptstrasse 12"
                className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-teal-500 outline-none text-sm"
              />
            </div>
          </div>
        </div>

        <button
          onClick={handlePlan}
          disabled={loading || !destText.trim()}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold disabled:opacity-50"
        >
          {loading ? <Search className="w-4 h-4 animate-pulse" /> : <Calculator className="w-4 h-4" />}
          {loading ? 'Duke kalkuluar...' : 'Kalkulo Rrugen'}
        </button>

        {error && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</div>
        )}
      </div>

      <div className="fleet-map-root rounded-xl overflow-hidden border border-slate-200 bg-white" style={{ height: '380px' }}>
        <MapContainer center={center} zoom={6} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap contributors' />
          {geometryLatLng.length > 1 && <FitToRoute geometry={route?.geometry ?? []} />}
          {origin && <Marker position={[origin.lat, origin.lng]} icon={originIcon} />}
          {dest && <Marker position={[dest.lat, dest.lng]} icon={destIcon} />}
          {geometryLatLng.length > 1 && (
            <Polyline positions={geometryLatLng} pathOptions={{ color: '#0f766e', weight: 5 }} />
          )}
        </MapContainer>
      </div>

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
