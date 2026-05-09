import { useEffect, useRef, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Crosshair, Loader2, Map as MapIcon, MapPin, Navigation, Search, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Props {
  address: string;
  lat: number | null;
  lng: number | null;
  driverId?: string | null;
  onChange: (next: { address: string; lat: number | null; lng: number | null }) => void;
}

const markerIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

async function geocode(q: string): Promise<{ lat: number; lng: number; display: string } | null> {
  if (!q || q.trim().length < 3) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    const j = await r.json();
    if (Array.isArray(j) && j.length > 0) {
      return { lat: parseFloat(j[0].lat), lng: parseFloat(j[0].lon), display: j[0].display_name as string };
    }
  } catch { /* ignore */ }
  return null;
}

async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    const j = await r.json();
    return (j?.display_name as string) ?? null;
  } catch {
    return null;
  }
}

function ClickCapture({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (e) => onPick(e.latlng.lat, e.latlng.lng),
  });
  return null;
}

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], Math.max(map.getZoom(), 13));
  }, [lat, lng, map]);
  return null;
}

export default function DestinationPicker({ address, lat, lng, driverId, onChange }: Props) {
  const [mapOpen, setMapOpen] = useState(false);
  const [pickerLat, setPickerLat] = useState<number>(lat ?? 44.5);
  const [pickerLng, setPickerLng] = useState<number>(lng ?? 20.5);
  const [searchValue, setSearchValue] = useState('');
  const [searching, setSearching] = useState(false);
  const [loadingDriver, setLoadingDriver] = useState(false);
  const [driverErr, setDriverErr] = useState<string | null>(null);
  const blurTimer = useRef<number | null>(null);

  async function handleAddressBlur() {
    if (!address || address.trim().length < 3) return;
    if (lat != null && lng != null) return;
    const g = await geocode(address);
    if (g) onChange({ address, lat: g.lat, lng: g.lng });
  }

  async function useDriverLocation() {
    if (!driverId) {
      setDriverErr('Nuk ka shofer te caktuar. Zgjidh nje shofer ne fillim.');
      return;
    }
    setLoadingDriver(true);
    setDriverErr(null);
    try {
      const { data } = await supabase
        .from('driver_locations')
        .select('lat, lng, recorded_at')
        .eq('driver_id', driverId)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!data) {
        setDriverErr('Shoferi nuk ka vendndodhje te fundit te regjistruar.');
        return;
      }
      const la = Number((data as { lat: number }).lat);
      const ln = Number((data as { lng: number }).lng);
      const addr = (await reverseGeocode(la, ln)) ?? `${la.toFixed(5)}, ${ln.toFixed(5)}`;
      onChange({ address: addr, lat: la, lng: ln });
    } finally {
      setLoadingDriver(false);
    }
  }

  async function handleSearch() {
    if (!searchValue) return;
    setSearching(true);
    const g = await geocode(searchValue);
    setSearching(false);
    if (g) {
      setPickerLat(g.lat);
      setPickerLng(g.lng);
    }
  }

  function confirmMap() {
    void (async () => {
      const addr = (await reverseGeocode(pickerLat, pickerLng)) ?? `${pickerLat.toFixed(5)}, ${pickerLng.toFixed(5)}`;
      onChange({ address: addr, lat: pickerLat, lng: pickerLng });
      setMapOpen(false);
    })();
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <MapPin className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={address}
            onChange={(e) => {
              if (blurTimer.current) window.clearTimeout(blurTimer.current);
              onChange({ address: e.target.value, lat: null, lng: null });
            }}
            onBlur={() => {
              if (blurTimer.current) window.clearTimeout(blurTimer.current);
              blurTimer.current = window.setTimeout(() => {
                void handleAddressBlur();
              }, 200);
            }}
            placeholder="Shkruaj adresen e destinacionit"
            className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={useDriverLocation}
          disabled={loadingDriver}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-teal-50 text-teal-800 hover:bg-teal-100 disabled:opacity-60"
        >
          {loadingDriver ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Navigation className="w-3.5 h-3.5" />}
          Vendndodhja e shoferit
        </button>
        <button
          type="button"
          onClick={() => {
            if (lat != null && lng != null) {
              setPickerLat(lat);
              setPickerLng(lng);
            }
            setMapOpen(true);
          }}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-800 hover:bg-slate-200"
        >
          <MapIcon className="w-3.5 h-3.5" /> Zgjidh ne harte
        </button>
        {lat != null && lng != null && (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-slate-500 bg-slate-50 border border-slate-200">
            <Crosshair className="w-3 h-3" /> {lat.toFixed(5)}, {lng.toFixed(5)}
          </span>
        )}
      </div>

      {driverErr && <p className="text-xs text-red-600">{driverErr}</p>}

      {mapOpen && (
        <div className="fixed inset-0 z-[2000] bg-black/60 flex items-center justify-center p-4" onClick={() => setMapOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
              <div className="font-semibold text-slate-900 text-sm">Zgjidh destinacionin ne harte</div>
              <button onClick={() => setMapOpen(false)} className="text-slate-500 hover:text-slate-700"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-3 border-b border-slate-100 flex gap-2">
              <div className="flex-1 relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleSearch())}
                  placeholder="Kerko qytet/adrese"
                  className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <button
                type="button"
                onClick={handleSearch}
                disabled={searching}
                className="px-3 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-60"
              >
                {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Kerko'}
              </button>
            </div>
            <div className="h-[400px]">
              <MapContainer center={[pickerLat, pickerLng]} zoom={13} style={{ height: '100%', width: '100%' }}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
                <Recenter lat={pickerLat} lng={pickerLng} />
                <ClickCapture onPick={(la, ln) => { setPickerLat(la); setPickerLng(ln); }} />
                <Marker position={[pickerLat, pickerLng]} icon={markerIcon} />
              </MapContainer>
            </div>
            <div className="px-4 py-3 flex items-center justify-between border-t border-slate-100">
              <div className="text-xs text-slate-500">{pickerLat.toFixed(5)}, {pickerLng.toFixed(5)}</div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setMapOpen(false)} className="px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-100">Anulo</button>
                <button type="button" onClick={confirmMap} className="px-3 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700">Konfirmo</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
