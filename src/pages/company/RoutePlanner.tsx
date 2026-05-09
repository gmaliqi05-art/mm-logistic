import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Calculator, Check, Euro, Fuel, MapPin, Navigation, Route, Search, Send, Timer, Truck } from 'lucide-react';
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

interface DeliveryNoteLite {
  id: string;
  note_number: string;
  delivery_address: string | null;
  pickup_address: string | null;
  assigned_driver_id: string | null;
  status: string;
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

const ROUTE_COLORS = ['#0f766e', '#d97706', '#6b7280'];

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
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [deliveries, setDeliveries] = useState<DeliveryNoteLite[]>([]);
  const [deliveryId, setDeliveryId] = useState<string>('');
  const [assigning, setAssigning] = useState(false);
  const [assigned, setAssigned] = useState(false);

  useEffect(() => {
    if (!profile?.company_id) return;
    void (async () => {
      const { data } = await supabase
        .from('delivery_notes')
        .select('id, note_number, delivery_address, pickup_address, assigned_driver_id, status')
        .eq('company_id', profile.company_id)
        .in('status', ['scheduled', 'in_transit', 'assigned'])
        .order('created_at', { ascending: false })
        .limit(25);
      setDeliveries((data ?? []) as DeliveryNoteLite[]);
    })();
  }, [profile?.company_id]);

  useEffect(() => {
    if (!deliveryId) return;
    const d = deliveries.find((x) => x.id === deliveryId);
    if (d?.pickup_address) setOriginText(d.pickup_address);
    if (d?.delivery_address) setDestText(d.delivery_address);
    setOrigin(null);
    setDest(null);
    setResult(null);
    setAssigned(false);
  }, [deliveryId, deliveries]);

  const selected = result?.options[selectedIdx] ?? result?.selected;

  const geometryLatLng = useMemo(() => {
    if (!selected) return [] as [number, number][];
    return selected.geometry.map(([lng, lat]) => [lat, lng] as [number, number]);
  }, [selected]);

  async function handlePlan() {
    setError(null);
    setAssigned(false);
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
          prefer: 'cheapest',
          driver_id: null,
          company_id: profile?.company_id ?? null,
        },
      });
      if (fnErr) throw fnErr;
      if (!data || data.error) throw new Error(data?.error ?? 'Gabim gjate kalkulimit');

      const typed = data as { selected: Option; options: Option[] };
      setResult(typed);
      const cheapestIdx = typed.options.findIndex((o) => o.label === typed.selected.label);
      setSelectedIdx(cheapestIdx >= 0 ? cheapestIdx : 0);
    } catch (err) {
      logger.warn('plan route failed', { error: err });
      setError(err instanceof Error ? err.message : 'Gabim gjate kalkulimit');
    } finally {
      setLoading(false);
    }
  }

  async function assignToDelivery() {
    if (!deliveryId || !result || !selected || !profile?.id) return;
    setAssigning(true);
    try {
      await supabase
        .from('delivery_notes')
        .update({
          route_alternatives: result.options.map((o) => ({
            label: o.label,
            distance_km: o.distance_km,
            duration_min: o.duration_min,
            toll_eur: o.toll_eur,
            fuel_eur: o.fuel_eur,
            total_eur: o.total_eur,
            country_breakdown: o.country_breakdown,
            geometry: o.geometry,
          })),
          route_selected_label: selected.label,
          route_assigned_at: new Date().toISOString(),
          route_assigned_by: profile.id,
          planned_route_geojson: { type: 'LineString', coordinates: selected.geometry },
          planned_toll_cost_eur: selected.toll_eur,
          planned_distance_km: selected.distance_km,
          planned_duration_min: selected.duration_min,
        })
        .eq('id', deliveryId);
      setAssigned(true);
    } catch (err) {
      logger.warn('assign route failed', { error: err });
      setError('Nuk u ruajt rruga.');
    } finally {
      setAssigning(false);
    }
  }

  const center: [number, number] = origin ? [origin.lat, origin.lng] : [50.1, 10.3];

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Route className="w-6 h-6 text-teal-600" /> Planifikim Rruge - 3 Alternativa
        </h1>
        <p className="text-sm text-slate-600 mt-1">Zgjedh nje nga 3 rruget per kamiona dhe cakto-ja te nje transport.</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        {deliveries.length > 0 && (
          <div>
            <label className="text-xs font-semibold text-slate-600 uppercase">Lidh me transport (opsionale)</label>
            <select
              value={deliveryId}
              onChange={(e) => setDeliveryId(e.target.value)}
              className="w-full mt-1 px-3 py-2.5 rounded-lg border border-slate-300 text-sm"
            >
              <option value="">-- Pa transport --</option>
              {deliveries.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.note_number} · {d.delivery_address ?? 'pa destinacion'}
                </option>
              ))}
            </select>
          </div>
        )}

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

        <div className="grid grid-cols-2 gap-3">
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
        </div>

        <button
          onClick={handlePlan}
          disabled={loading || !originText.trim() || !destText.trim()}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold disabled:opacity-50"
        >
          {loading ? <Search className="w-4 h-4 animate-pulse" /> : <Calculator className="w-4 h-4" />}
          {loading ? 'Duke kalkuluar 3 alternativat...' : 'Kalkulo 3 Alternativat'}
        </button>

        {error && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</div>
        )}
      </div>

      <div className="fleet-map-root rounded-xl overflow-hidden border border-slate-200 bg-white" style={{ height: '420px' }}>
        <MapContainer center={center} zoom={6} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap contributors' />
          {geometryLatLng.length > 1 && <FitToRoute geometry={selected?.geometry ?? []} />}
          {origin && <Marker position={[origin.lat, origin.lng]} icon={originIcon} />}
          {dest && <Marker position={[dest.lat, dest.lng]} icon={destIcon} />}
          {result?.options.map((opt, idx) => {
            const positions = opt.geometry.map(([lng, lat]) => [lat, lng] as [number, number]);
            if (positions.length < 2) return null;
            const isSelected = idx === selectedIdx;
            return (
              <Polyline
                key={idx}
                positions={positions}
                pathOptions={{
                  color: ROUTE_COLORS[idx % ROUTE_COLORS.length],
                  weight: isSelected ? 6 : 3,
                  opacity: isSelected ? 0.95 : 0.45,
                  dashArray: isSelected ? undefined : '6 8',
                }}
              />
            );
          })}
        </MapContainer>
      </div>

      {result && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {result.options.slice(0, 3).map((opt, idx) => {
              const isSelected = idx === selectedIdx;
              const hours = Math.floor(opt.duration_min / 60);
              const mins = Math.round(opt.duration_min % 60);
              return (
                <button
                  key={idx}
                  onClick={() => setSelectedIdx(idx)}
                  className={`text-left rounded-xl border-2 p-4 transition ${isSelected ? 'border-teal-600 bg-teal-50 shadow-md' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ background: ROUTE_COLORS[idx % ROUTE_COLORS.length] }} />
                      <span className="text-sm font-semibold text-slate-900 capitalize">
                        {idx === 0 ? 'Me kosto me te ulet' : idx === 1 ? 'Alternativa 2' : 'Alternativa 3'}
                      </span>
                    </div>
                    {isSelected && <Check className="w-5 h-5 text-teal-600" />}
                  </div>
                  <div className="mt-3 space-y-1.5 text-sm">
                    <div className="flex justify-between"><span className="text-slate-500">Distanca</span><span className="font-semibold">{opt.distance_km} km</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Koha</span><span className="font-semibold">{hours}h {mins}min</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Taksa</span><span className="font-semibold">{opt.toll_eur.toFixed(2)} EUR</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Karburant</span><span className="font-semibold">{opt.fuel_eur.toFixed(2)} EUR</span></div>
                    <div className="flex justify-between pt-1.5 border-t border-slate-200">
                      <span className="text-slate-700 font-semibold">Total</span>
                      <span className="font-bold text-teal-700">{opt.total_eur.toFixed(2)} EUR</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {selected && (
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-1.5">
                <Truck className="w-4 h-4 text-teal-600" /> Ndarja sipas vendeve (rruga e zgjedhur)
              </h3>
              <div className="space-y-1.5">
                {selected.country_breakdown.map((c) => (
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
          )}

          {deliveryId && selected && (
            <button
              onClick={assignToDelivery}
              disabled={assigning || assigned}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-white disabled:opacity-70 ${assigned ? 'bg-emerald-600' : 'bg-slate-900 hover:bg-slate-800'}`}
            >
              {assigned ? <><Check className="w-4 h-4" /> Rruga u dergua te shoferi</> : <><Send className="w-4 h-4" /> {assigning ? 'Duke dërguar...' : 'Cakto kete rruge per kete transport'}</>}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
