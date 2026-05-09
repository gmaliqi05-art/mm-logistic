import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Calculator, Euro, Fuel, MapPin, Navigation, Route, Search, Timer } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { logger } from '../../utils/logger';

interface Point { lat: number; lng: number; label?: string }
interface CountrySegment {
  country_code: string;
  country_name: string;
  km: number;
  toll_eur: number;
}
interface Option {
  label: string;
  distance_km: number;
  duration_min: number;
  toll_eur: number;
  fuel_eur: number;
  total_eur: number;
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

export default function CompanyRoutePlanner() {
  const { profile } = useAuth();
  const [originText, setOriginText] = useState('');
  const [destText, setDestText] = useState('');
  const [origin, setOrigin] = useState<Point | null>(null);
  const [dest, setDest] = useState<Point | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ selected: Option; options: Option[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vehicleConsumption, setVehicleConsumption] = useState(32);
  const [fuelPrice, setFuelPrice] = useState(1.65);
  const [prefer, setPrefer] = useState<'cheapest' | 'fastest'>('cheapest');

  const geometryLatLng = useMemo(() => {
    if (!result) return [] as [number, number][];
    return result.selected.geometry.map(([lng, lat]) => [lat, lng] as [number, number]);
  }, [result]);

  async function handlePlan() {
    setError(null);
    setLoading(true);
    try {
      const o = origin ?? (await geocode(originText));
      if (!o) throw new Error('Nuk u gjet adresa e nisjes.');
      setOrigin(o);
      const d = dest ?? (await geocode(destText));
      if (!d) throw new Error('Nuk u gjet adresa e destinacionit.');
      setDest(d);

      const { data, error: fnErr } = await supabase.functions.invoke('plan-truck-route', {
        body: {
          origin: o,
          destination: d,
          vehicle_profile: 'driving-hgv',
          avg_consumption_l_100km: vehicleConsumption,
          fuel_price_eur_per_l: fuelPrice,
          prefer,
          driver_id: null,
          company_id: profile?.company_id ?? null,
        },
      });
      if (fnErr) throw fnErr;
      if (!data || data.error) throw new Error(data?.error ?? 'Gabim gjate kalkulimit');

      setResult(data as { selected: Option; options: Option[] });
    } catch (err) {
      logger.warn('plan route failed', { error: err });
      setError(err instanceof Error ? err.message : 'Gabim gjate kalkulimit');
    } finally {
      setLoading(false);
    }
  }

  const center: [number, number] = origin ? [origin.lat, origin.lng] : [50.1, 10.3];

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Route className="w-6 h-6 text-teal-600" /> Planifikim Rruge - Kosto
        </h1>
        <p className="text-sm text-slate-600 mt-1">Kalkulo koston totale te rruges: taksa per cdo shtet, karburant dhe distance.</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-600 uppercase">Nisja</label>
            <div className="relative mt-1">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-600" />
              <input
                value={originText}
                onChange={(e) => { setOriginText(e.target.value); setOrigin(null); }}
                placeholder="Adresa e nisjes"
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
                onChange={(e) => { setDestText(e.target.value); setDest(null); }}
                placeholder="p.sh. Zurich, Hauptstrasse 12"
                className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-teal-500 outline-none text-sm"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-600 uppercase">Konsumi L/100km</label>
            <input
              type="number"
              value={vehicleConsumption}
              onChange={(e) => setVehicleConsumption(Number(e.target.value) || 0)}
              className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-300 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 uppercase">Cmimi EUR/L</label>
            <input
              type="number"
              step="0.01"
              value={fuelPrice}
              onChange={(e) => setFuelPrice(Number(e.target.value) || 0)}
              className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-300 text-sm"
            />
          </div>
          <div className="col-span-2">
            <label className="text-xs font-semibold text-slate-600 uppercase">Preferenca</label>
            <div className="mt-1 flex rounded-lg overflow-hidden border border-slate-300 text-sm">
              <button
                onClick={() => setPrefer('cheapest')}
                className={`flex-1 px-3 py-2 ${prefer === 'cheapest' ? 'bg-teal-600 text-white' : 'bg-white text-slate-700'}`}
              >Me kosto me te ulet</button>
              <button
                onClick={() => setPrefer('fastest')}
                className={`flex-1 px-3 py-2 ${prefer === 'fastest' ? 'bg-teal-600 text-white' : 'bg-white text-slate-700'}`}
              >Me i shpejte</button>
            </div>
          </div>
        </div>

        <button
          onClick={handlePlan}
          disabled={loading || !originText.trim() || !destText.trim()}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold disabled:opacity-50"
        >
          {loading ? <Search className="w-4 h-4 animate-pulse" /> : <Calculator className="w-4 h-4" />}
          {loading ? 'Duke kalkuluar...' : 'Kalkulo Koston'}
        </button>

        {error && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</div>
        )}
      </div>

      <div className="fleet-map-root rounded-xl overflow-hidden border border-slate-200 bg-white" style={{ height: '380px' }}>
        <MapContainer center={center} zoom={6} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap contributors' />
          {geometryLatLng.length > 1 && <FitToRoute geometry={result?.selected.geometry ?? []} />}
          {origin && <Marker position={[origin.lat, origin.lng]} icon={originIcon} />}
          {dest && <Marker position={[dest.lat, dest.lng]} icon={destIcon} />}
          {geometryLatLng.length > 1 && (
            <Polyline positions={geometryLatLng} pathOptions={{ color: '#0f766e', weight: 5 }} />
          )}
        </MapContainer>
      </div>

      {result && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard icon={Route} label="Distanca" value={`${result.selected.distance_km} km`} />
            <MetricCard icon={Timer} label="Koha" value={`${Math.floor(result.selected.duration_min / 60)}h ${result.selected.duration_min % 60}min`} />
            <MetricCard icon={Euro} label="Taksa" value={`${result.selected.toll_eur.toFixed(2)} EUR`} />
            <MetricCard icon={Fuel} label="Karburant" value={`${result.selected.fuel_eur.toFixed(2)} EUR`} />
          </div>
          <div className="bg-teal-600 text-white rounded-xl p-4 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold uppercase opacity-80">Kosto totale ({result.selected.label})</div>
              <div className="text-3xl font-bold mt-1">{result.selected.total_eur.toFixed(2)} EUR</div>
            </div>
            <Calculator className="w-10 h-10 opacity-60" />
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-2">Ndarja sipas vendeve</h3>
            <div className="space-y-1.5">
              {result.selected.country_breakdown.map((c) => (
                <div key={c.country_code} className="flex items-center justify-between text-sm py-1.5 border-b border-slate-100 last:border-0">
                  <span className="font-medium text-slate-800">{c.country_name} <span className="text-xs text-slate-500">({c.country_code})</span></span>
                  <div className="flex items-center gap-4 text-slate-600">
                    <span>{c.km} km</span>
                    <span className="font-semibold text-slate-900">{c.toll_eur.toFixed(2)} EUR</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {result.options.length > 1 && (
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-900 mb-2">Alternativa</h3>
              <div className="space-y-1.5">
                {result.options.map((o, i) => (
                  <div key={i} className="flex items-center justify-between text-xs py-1.5">
                    <span className="font-medium text-slate-700 capitalize">{o.label}</span>
                    <div className="flex items-center gap-3 text-slate-600">
                      <span>{o.distance_km} km</span>
                      <span>{Math.round(o.duration_min)} min</span>
                      <span className="font-semibold text-slate-900">{o.total_eur.toFixed(2)} EUR</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase">
        <Icon className="w-3.5 h-3.5 text-teal-600" /> {label}
      </div>
      <div className="text-lg font-bold text-slate-900 mt-1">{value}</div>
    </div>
  );
}
