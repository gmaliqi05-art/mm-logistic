import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Clock, MapPin, Navigation as NavigationIcon, Route, Truck } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

interface CountrySegment {
  country_code: string;
  country_name: string;
  km: number;
}

interface AssignedDelivery {
  id: string;
  note_number: string;
  delivery_address: string | null;
  pickup_address: string | null;
  status: string;
  planned_distance_km: number | null;
  planned_duration_min: number | null;
  planned_route_geojson: { coordinates: [number, number][] } | null;
  route_selected_label: string | null;
  route_assigned_at: string | null;
  route_alternatives: Array<{
    label: string;
    distance_km: number;
    duration_min: number;
    country_breakdown: CountrySegment[];
    geometry: [number, number][];
  }> | null;
}

const pickupIcon = L.divIcon({
  className: '',
  html: `<div style="width:18px;height:18px;border-radius:50%;background:#10b981;border:3px solid white;box-shadow:0 0 0 2px #10b981"></div>`,
  iconSize: [18, 18], iconAnchor: [9, 9],
});
const deliverIcon = L.divIcon({
  className: '',
  html: `<div style="width:18px;height:18px;border-radius:50%;background:#dc2626;border:3px solid white;box-shadow:0 0 0 2px #dc2626"></div>`,
  iconSize: [18, 18], iconAnchor: [9, 9],
});
const truckIcon = L.divIcon({
  className: '',
  html: `<div style="width:28px;height:28px;border-radius:50%;background:#0f766e;border:3px solid white;box-shadow:0 0 0 3px #0f766e;display:flex;align-items:center;justify-content:center;color:white;font-size:14px">T</div>`,
  iconSize: [28, 28], iconAnchor: [14, 14],
});

function FitToRoute({ geometry }: { geometry: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (geometry.length === 0) return;
    const bounds = L.latLngBounds(geometry.map(([lng, lat]) => [lat, lng] as [number, number]));
    map.fitBounds(bounds, { padding: [60, 60] });
  }, [geometry, map]);
  return null;
}

export default function DriverNavigation() {
  const { profile } = useAuth();
  const [delivery, setDelivery] = useState<AssignedDelivery | null>(null);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from('delivery_notes')
        .select('id, note_number, delivery_address, pickup_address, status, planned_distance_km, planned_duration_min, planned_route_geojson, route_selected_label, route_assigned_at, route_alternatives')
        .eq('assigned_driver_id', profile.id)
        .in('status', ['scheduled', 'in_transit', 'assigned'])
        .not('planned_route_geojson', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) {
        setDelivery((data as AssignedDelivery | null) ?? null);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [profile?.id]);

  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  const geometry = useMemo<[number, number][]>(() => {
    const coords = delivery?.planned_route_geojson?.coordinates;
    if (!coords) return [];
    return coords;
  }, [delivery]);

  const geometryLatLng = useMemo(() => {
    return geometry.map(([lng, lat]) => [lat, lng] as [number, number]);
  }, [geometry]);

  const selectedAlt = useMemo(() => {
    if (!delivery?.route_alternatives || !delivery.route_selected_label) return null;
    return delivery.route_alternatives.find((a) => a.label === delivery.route_selected_label) ?? null;
  }, [delivery]);

  const first = geometryLatLng[0];
  const last = geometryLatLng[geometryLatLng.length - 1];

  if (loading) {
    return (
      <div className="p-4 text-center text-slate-500 text-sm">Duke ngarkuar navigimin...</div>
    );
  }

  if (!delivery || geometryLatLng.length < 2) {
    return (
      <div className="p-4 max-w-2xl mx-auto">
        <div className="bg-white rounded-xl border border-slate-200 p-6 text-center">
          <NavigationIcon className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-slate-900">Nuk ka rrugen e caktuar</h2>
          <p className="text-sm text-slate-600 mt-1">Kompania ende nuk te ka caktuar nje rruge per transportin tend.</p>
        </div>
      </div>
    );
  }

  const hours = Math.floor((delivery.planned_duration_min ?? 0) / 60);
  const minutes = Math.round((delivery.planned_duration_min ?? 0) % 60);
  const center: [number, number] = me ? [me.lat, me.lng] : (first ?? [50.1, 10.3]);

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <NavigationIcon className="w-6 h-6 text-teal-600" /> Navigimi (LKW)
        </h1>
        <p className="text-sm text-slate-600 mt-1">Rruga e caktuar nga kompania per kamiona.</p>
      </div>

      <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 flex items-center gap-2 text-sm text-teal-900">
        <Truck className="w-4 h-4" />
        <span>Vetem rruge te lejuara per kamiona - caktuar nga kompania.</span>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase font-semibold text-slate-500">Transporti</div>
            <div className="text-lg font-bold text-slate-900">{delivery.note_number}</div>
          </div>
          <span className="text-xs font-semibold px-2 py-1 rounded-full bg-teal-100 text-teal-800 capitalize">
            {delivery.status}
          </span>
        </div>
        {delivery.pickup_address && (
          <div className="mt-3 flex items-start gap-2 text-sm text-slate-700">
            <MapPin className="w-4 h-4 text-emerald-600 mt-0.5" />
            <div>
              <div className="text-xs text-slate-500 uppercase">Nisja</div>
              <div>{delivery.pickup_address}</div>
            </div>
          </div>
        )}
        {delivery.delivery_address && (
          <div className="mt-2 flex items-start gap-2 text-sm text-slate-700">
            <MapPin className="w-4 h-4 text-red-600 mt-0.5" />
            <div>
              <div className="text-xs text-slate-500 uppercase">Destinacioni</div>
              <div>{delivery.delivery_address}</div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <div className="text-xs uppercase font-semibold text-slate-500 flex items-center gap-1.5">
            <Route className="w-3.5 h-3.5 text-teal-600" /> Distanca
          </div>
          <div className="text-xl font-bold text-slate-900 mt-1">{delivery.planned_distance_km ?? '—'} km</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <div className="text-xs uppercase font-semibold text-slate-500 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-teal-600" /> Koha
          </div>
          <div className="text-xl font-bold text-slate-900 mt-1">{hours}h {minutes}min</div>
        </div>
      </div>

      <div className="fleet-map-root rounded-xl overflow-hidden border border-slate-200 bg-white" style={{ height: '480px' }}>
        <MapContainer center={center} zoom={7} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap contributors' />
          <FitToRoute geometry={geometry} />
          {first && <Marker position={first} icon={pickupIcon} />}
          {last && <Marker position={last} icon={deliverIcon} />}
          {me && <Marker position={[me.lat, me.lng]} icon={truckIcon} />}
          <Polyline positions={geometryLatLng} pathOptions={{ color: '#0f766e', weight: 6 }} />
        </MapContainer>
      </div>

      {selectedAlt && selectedAlt.country_breakdown.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-2">Vendet qe pershkohen</h3>
          <div className="space-y-1.5">
            {selectedAlt.country_breakdown.map((c) => (
              <div key={c.country_code} className="flex items-center justify-between text-sm py-1.5 border-b border-slate-100 last:border-0">
                <span className="font-medium text-slate-800">
                  {c.country_name} <span className="text-xs text-slate-500">({c.country_code})</span>
                </span>
                <span className="text-slate-600">{c.km} km</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {me && last && (
        <a
          href={`https://www.google.com/maps/dir/?api=1&origin=${me.lat},${me.lng}&destination=${last[0]},${last[1]}&travelmode=driving`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-900 text-white font-semibold"
        >
          <NavigationIcon className="w-4 h-4" />
          Hap navigimin ne Google Maps
        </a>
      )}
    </div>
  );
}
