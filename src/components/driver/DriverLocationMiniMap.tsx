import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ExternalLink, Navigation } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTranslation } from '../../i18n';

interface Props {
  driverId: string;
  companyId: string;
  lat: number;
  lng: number;
  heading: number | null;
  speed: number | null;
}

const geocodeCache = new Map<string, string>();

async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const cached = geocodeCache.get(key);
  if (cached) return cached;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      { headers: { 'Accept-Language': 'sq,en' } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const a = data.address ?? {};
    const street = [a.road, a.house_number].filter(Boolean).join(' ');
    const place = a.city || a.town || a.village || a.municipality || a.suburb || '';
    const parts = [street, [a.postcode, place].filter(Boolean).join(' ')].filter(Boolean);
    const compact = parts.join(', ');
    const result = compact || data.display_name || null;
    if (result) geocodeCache.set(key, result);
    return result;
  } catch {
    return null;
  }
}

function buildDriverIcon(heading: number | null): L.DivIcon {
  const rotation = heading != null ? (heading - 90 + 360) % 360 : 0;
  return L.divIcon({
    className: 'driver-mini-map-icon',
    html: `
      <div style="width:40px;height:24px;transform:rotate(${rotation}deg);transform-origin:50% 50%;transition:transform .4s ease;">
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="24" viewBox="0 0 80 44" style="filter:drop-shadow(0 2px 4px rgba(0,0,0,.4));overflow:visible;">
          <rect x="2" y="6" width="50" height="28" rx="3" fill="#0f766e"/>
          <path d="M52 14 L68 14 L76 24 L76 34 L52 34 Z" fill="#115e59"/>
          <rect x="55" y="17" width="14" height="8" rx="1.5" fill="#bae6fd" opacity="0.9"/>
          <circle cx="15" cy="36" r="5" fill="#0f172a"/>
          <circle cx="15" cy="36" r="2" fill="#475569"/>
          <circle cx="62" cy="36" r="5" fill="#0f172a"/>
          <circle cx="62" cy="36" r="2" fill="#475569"/>
        </svg>
      </div>
    `,
    iconSize: [40, 24],
    iconAnchor: [20, 12],
  });
}

function CenterOnDriver({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  const initialized = useRef(false);
  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      return;
    }
    map.panTo([lat, lng], { animate: true, duration: 0.6 });
  }, [lat, lng, map]);
  return null;
}

export default function DriverLocationMiniMap({ driverId, companyId, lat, lng, heading, speed }: Props) {
  const { t } = useTranslation();
  const [trail, setTrail] = useState<[number, number][]>([]);
  const [address, setAddress] = useState<string | null>(null);
  const addrKeyRef = useRef('');

  useEffect(() => {
    if (!driverId || !companyId) return;
    let cancelled = false;
    const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    void (async () => {
      const { data } = await supabase
        .from('driver_locations')
        .select('lat, lng')
        .eq('driver_id', driverId)
        .eq('company_id', companyId)
        .gte('recorded_at', cutoff)
        .order('recorded_at', { ascending: true })
        .limit(50);
      if (!cancelled && data) {
        setTrail(data.map((r: { lat: number; lng: number }) => [r.lat, r.lng]));
      }
    })();
    return () => { cancelled = true; };
  }, [driverId, companyId]);

  useEffect(() => {
    const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    if (key === addrKeyRef.current) return;
    addrKeyRef.current = key;
    const timer = window.setTimeout(async () => {
      const result = await reverseGeocode(lat, lng);
      if (result) setAddress(result);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [lat, lng]);

  const icon = useMemo(() => buildDriverIcon(heading), [heading]);

  const trailWithCurrent = useMemo(() => {
    const pts = [...trail, [lat, lng] as [number, number]];
    return pts;
  }, [trail, lat, lng]);

  return (
    <div className="rounded-xl overflow-hidden border border-slate-200 bg-white relative" style={{ height: '180px' }}>
      <MapContainer
        center={[lat, lng]}
        zoom={15}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={false}
        zoomControl={false}
        dragging={false}
        attributionControl={false}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <CenterOnDriver lat={lat} lng={lng} />
        {trailWithCurrent.length >= 2 && (
          <Polyline
            positions={trailWithCurrent}
            pathOptions={{ color: '#0d9488', weight: 3, opacity: 0.6, lineCap: 'round', lineJoin: 'round' }}
          />
        )}
        <Marker position={[lat, lng]} icon={icon} />
      </MapContainer>

      <div className="absolute bottom-0 left-0 right-0 z-[5] bg-gradient-to-t from-black/60 to-transparent px-3 py-2">
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0 flex-1">
            {address && (
              <p className="text-[11px] text-white font-medium truncate leading-tight">{address}</p>
            )}
            <div className="flex items-center gap-2 mt-0.5">
              {speed != null && speed > 0 && (
                <span className="text-[10px] text-white/80 font-medium">{Math.round(speed * 3.6)} km/h</span>
              )}
              {heading != null && (
                <span className="text-[10px] text-white/70 flex items-center gap-0.5">
                  <Navigation className="w-2.5 h-2.5" style={{ transform: `rotate(${heading}deg)` }} />
                </span>
              )}
            </div>
          </div>
          <a
            href={`https://www.google.com/maps?q=${lat},${lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-white/20 backdrop-blur text-white text-[10px] font-semibold hover:bg-white/30 transition-colors flex-shrink-0"
          >
            <ExternalLink className="w-3 h-3" />
            {t('driver.dashboard.openInMaps')}
          </a>
        </div>
      </div>
    </div>
  );
}
