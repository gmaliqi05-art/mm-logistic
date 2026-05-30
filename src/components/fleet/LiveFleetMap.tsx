import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AlertTriangle, Compass, Copy, Crosshair, ExternalLink, Gauge, Home, LocateFixed, MapPin, Navigation, Phone, Route, Send } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { logger } from '../../utils/logger';
import { useTranslation } from '../../i18n';

interface DriverPing {
  driver_id: string;
  driver_name: string;
  phone: string | null;
  vehicle_plate: string | null;
  lat: number;
  lng: number;
  speed_kmh: number | null;
  heading_deg: number | null;
  last_location_at: string;
  delivery_note_id: string | null;
  note_number: string | null;
  status: string | null;
  delivery_address: string | null;
  current_address: string | null;
  base_address: string | null;
  base_lat: number | null;
  base_lng: number | null;
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
    const data = (await res.json()) as {
      address?: {
        road?: string;
        house_number?: string;
        suburb?: string;
        village?: string;
        town?: string;
        city?: string;
        municipality?: string;
        county?: string;
        state?: string;
        postcode?: string;
        country?: string;
      };
      display_name?: string;
    };
    const a = data.address ?? {};
    const street = [a.road, a.house_number].filter(Boolean).join(' ');
    const place = a.city || a.town || a.village || a.municipality || a.suburb || a.county || '';
    const parts = [street, [a.postcode, place].filter(Boolean).join(' ')].filter(Boolean);
    const compact = parts.join(', ');
    const result = compact || data.display_name || null;
    if (result) geocodeCache.set(key, result);
    return result;
  } catch {
    return null;
  }
}

interface Props {
  companyId: string;
  height?: string;
  compact?: boolean;
}

function haversine(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function normalizeAddr(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase().replace(/[,.\s]+/g, ' ').trim();
}

function hasRealDeliveryDestination(d: { delivery_address: string | null; status: string | null; base_address: string | null }): boolean {
  const addr = (d.delivery_address ?? '').trim();
  if (!addr) return false;
  if (d.status === 'delivered') return false;
  if (normalizeAddr(addr) === normalizeAddr(d.base_address)) return false;
  return true;
}

function deriveInitials(name: string | null | undefined): string {
  if (!name) return 'D';
  const parts = name.trim().split(/[\s-]+/).filter(Boolean);
  if (parts.length === 0) return 'D';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
}

function computeBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const toDeg = (x: number) => (x * 180) / Math.PI;
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function buildTruckIcon(initials: string, selected: boolean, headingDeg: number | null): L.DivIcon {
  const cargoColor = selected ? '#047857' : '#0f766e';
  const cabColor = selected ? '#064e3b' : '#115e59';
  // Shrunk ~20% from previous sizes (56x32 -> 45x26, 64x36 -> 51x29).
  const width = selected ? 51 : 45;
  const height = selected ? 29 : 26;
  const fontSize = selected ? 12 : 11;
  // SVG baseline points East (cab on the right). Rotate so heading 0 = North.
  const rotation = headingDeg != null ? (headingDeg - 90 + 360) % 360 : 0;
  return L.divIcon({
    className: 'live-truck-icon',
    html: `
      <div style="width:${width}px;height:${height}px;transform:rotate(${rotation}deg);transform-origin:50% 50%;transition:transform .4s ease;">
        <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 80 44" style="filter:drop-shadow(0 2px 4px rgba(0,0,0,.4));overflow:visible;">
          <rect x="2" y="6" width="50" height="28" rx="3" fill="${cargoColor}"/>
          <path d="M52 14 L68 14 L76 24 L76 34 L52 34 Z" fill="${cabColor}"/>
          <rect x="55" y="17" width="14" height="8" rx="1.5" fill="#bae6fd" opacity="0.9"/>
          <circle cx="15" cy="36" r="5" fill="#0f172a"/>
          <circle cx="15" cy="36" r="2" fill="#475569"/>
          <circle cx="62" cy="36" r="5" fill="#0f172a"/>
          <circle cx="62" cy="36" r="2" fill="#475569"/>
          <text x="27" y="26" text-anchor="middle" font-family="system-ui,-apple-system,sans-serif" font-size="${fontSize}" font-weight="800" fill="white" letter-spacing="0.5">${initials}</text>
        </svg>
      </div>
    `,
    iconSize: [width, height],
    iconAnchor: [width / 2, height / 2],
  });
}

function MapRefCapture({ onReady }: { onReady: (map: L.Map) => void }) {
  const map = useMap();
  useEffect(() => {
    onReady(map);
  }, [map, onReady]);
  return null;
}

function FollowDriver({ target, driverId }: { target: [number, number] | null; driverId: string | null }) {
  const map = useMap();
  const prevDriverRef = useRef<string | null>(null);
  useEffect(() => {
    if (!target) {
      prevDriverRef.current = null;
      return;
    }
    const isNewFollow = driverId !== prevDriverRef.current;
    prevDriverRef.current = driverId;
    if (isNewFollow) {
      map.flyTo(target, 15, { animate: true, duration: 1.2 });
    } else {
      map.panTo(target, { animate: true, duration: 0.6 });
    }
  }, [target, driverId, map]);
  return null;
}

function FitBounds({ drivers, active }: { drivers: DriverPing[]; active: boolean }) {
  const map = useMap();
  const didInitialFit = useRef(false);
  useEffect(() => {
    if (!active) return;
    if (drivers.length === 0) return;
    if (didInitialFit.current) return;
    if (drivers.length === 1) {
      map.flyTo([drivers[0].lat, drivers[0].lng], 15, { animate: true, duration: 1.2 });
    } else {
      const bounds = L.latLngBounds(drivers.map((d) => [d.lat, d.lng] as [number, number]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
    didInitialFit.current = true;
  }, [drivers, map, active]);
  return null;
}

interface TrafficAlert {
  id: string;
  driver_id: string;
  delivery_note_id: string | null;
  severity: 'low' | 'moderate' | 'high';
  delay_minutes: number;
  message: string;
  created_at: string;
  resolved_at: string | null;
  acknowledged_at: string | null;
}

interface DeliveryRow {
  id: string;
  note_number: string;
  status: string;
  delivery_address: string | null;
  assigned_driver_id: string;
  current_lat: number;
  current_lng: number;
  last_location_at: string;
  driver?: { full_name: string; phone: string | null; base_address: string | null; base_lat: number | null; base_lng: number | null } | null;
}

function MapRotation({ heading, active }: { heading: number | null; active: boolean }) {
  const map = useMap();
  const rotationRef = useRef(0);
  useEffect(() => {
    const pane = map.getContainer().querySelector('.leaflet-map-pane') as HTMLElement | null;
    if (!pane) return;
    if (!active || heading == null) {
      if (rotationRef.current !== 0) {
        pane.style.transition = 'transform 0.8s ease';
        pane.style.transform = '';
        pane.style.transformOrigin = '';
        rotationRef.current = 0;
      }
      return;
    }
    const rot = -heading;
    rotationRef.current = rot;
    const container = map.getContainer();
    const cx = container.clientWidth / 2;
    const cy = container.clientHeight / 2;
    pane.style.transition = 'transform 0.8s ease';
    pane.style.transformOrigin = `${cx}px ${cy}px`;
    pane.style.transform = `rotate(${rot}deg)`;
  }, [heading, active, map]);
  useEffect(() => {
    if (!active) return;
    const pane = map.getContainer().querySelector('.leaflet-map-pane') as HTMLElement | null;
    if (!pane) return;
    const handler = () => {
      const container = map.getContainer();
      const cx = container.clientWidth / 2;
      const cy = container.clientHeight / 2;
      pane.style.transformOrigin = `${cx}px ${cy}px`;
    };
    map.on('move', handler);
    map.on('zoom', handler);
    return () => {
      map.off('move', handler);
      map.off('zoom', handler);
    };
  }, [active, map]);
  return null;
}

function agoLabel(iso: string | null, now: number = Date.now()): string {
  if (!iso) return '';
  const diff = now - new Date(iso).getTime();
  const s = Math.max(1, Math.round(diff / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  return `${h}h`;
}

export default function LiveFleetMap({ companyId, height = '520px', compact = false }: Props) {
  const { t } = useTranslation();
  const [drivers, setDrivers] = useState<Record<string, DriverPing>>({});
  const [trails, setTrails] = useState<Record<string, [number, number][]>>({});
  const [loading, setLoading] = useState(true);
  const [followId, setFollowId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [extendOpen, setExtendOpen] = useState<string | null>(null);
  const [extendText, setExtendText] = useState('');
  const [extendSaving, setExtendSaving] = useState(false);
  const [trafficAlerts, setTrafficAlerts] = useState<TrafficAlert[]>([]);
  const [nowTick, setNowTick] = useState(Date.now());
  const [routeToBaseFor, setRouteToBaseFor] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [locating, setLocating] = useState(false);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    const t = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    const loadAlerts = async () => {
      const { data } = await supabase
        .from('route_traffic_alerts')
        .select('id, driver_id, delivery_note_id, severity, delay_minutes, message, created_at, resolved_at, acknowledged_at')
        .eq('company_id', companyId)
        .is('resolved_at', null)
        .order('created_at', { ascending: false })
        .limit(10);
      if (!cancelled) setTrafficAlerts((data as TrafficAlert[]) ?? []);
    };
    void loadAlerts();
    const ch = supabase
      .channel(`traffic_alerts_${companyId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'route_traffic_alerts', filter: `company_id=eq.${companyId}` },
        () => { void loadAlerts(); },
      )
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(ch);
    };
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;

    const load = async () => {
      try {
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const liveCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
        const { data, error } = await supabase
          .from('delivery_notes')
          .select(
            'id, note_number, status, delivery_address, assigned_driver_id, current_lat, current_lng, last_location_at, driver:profiles!delivery_notes_assigned_driver_id_fkey(full_name, phone, base_address, base_lat, base_lng)',
          )
          .eq('company_id', companyId)
          .in('status', ['sent', 'in_transit', 'delivered'])
          .not('assigned_driver_id', 'is', null)
          .not('current_lat', 'is', null)
          .not('current_lng', 'is', null)
          .gte('last_location_at', cutoff)
          .order('last_location_at', { ascending: false })
          .limit(500);
        if (error) throw error;
        if (cancelled) return;

        const byDriver: Record<string, DriverPing> = {};
        for (const r of (data as unknown as DeliveryRow[]) ?? []) {
          const at = r.last_location_at ? new Date(r.last_location_at).getTime() : 0;
          const existing = byDriver[r.assigned_driver_id];
          const prevAt = existing ? new Date(existing.last_location_at).getTime() : 0;
          if (!existing || at > prevAt) {
            byDriver[r.assigned_driver_id] = {
              driver_id: r.assigned_driver_id,
              driver_name: r.driver?.full_name ?? '',
              phone: r.driver?.phone ?? null,
              vehicle_plate: null,
              lat: Number(r.current_lat),
              lng: Number(r.current_lng),
              speed_kmh: null,
              heading_deg: null,
              last_location_at: r.last_location_at,
              delivery_note_id: r.id,
              note_number: r.note_number,
              status: r.status,
              delivery_address: r.delivery_address,
              current_address: null,
              base_address: r.driver?.base_address ?? null,
              base_lat: r.driver?.base_lat ?? null,
              base_lng: r.driver?.base_lng ?? null,
            };
          }
        }

        // Also pull from driver_locations so a driver who activated tracking
        // without an in-progress delivery is still visible on the company map.
        const { data: liveRows } = await supabase
          .from('driver_locations')
          .select('driver_id, lat, lng, speed_kmh, heading_deg, recorded_at')
          .eq('company_id', companyId)
          .gte('recorded_at', liveCutoff)
          .order('recorded_at', { ascending: false })
          .limit(1000);
        const latestPerDriver: Record<string, { lat: number; lng: number; speed_kmh: number | null; heading_deg: number | null; recorded_at: string }> = {};
        for (const r of (liveRows as Array<{ driver_id: string; lat: number; lng: number; speed_kmh: number | null; heading_deg: number | null; recorded_at: string }>) ?? []) {
          if (!latestPerDriver[r.driver_id]) latestPerDriver[r.driver_id] = r;
        }
        const missingDriverIds = Object.keys(latestPerDriver).filter((id) => !byDriver[id]);
        if (missingDriverIds.length > 0) {
          const { data: profs } = await supabase
            .from('profiles')
            .select('id, full_name, phone, base_address, base_lat, base_lng')
            .in('id', missingDriverIds);
          const profMap: Record<string, { full_name: string | null; phone: string | null; base_address: string | null; base_lat: number | null; base_lng: number | null }> = {};
          for (const p of (profs as Array<{ id: string; full_name: string | null; phone: string | null; base_address: string | null; base_lat: number | null; base_lng: number | null }>) ?? []) {
            profMap[p.id] = p;
          }
          for (const id of missingDriverIds) {
            const latest = latestPerDriver[id];
            const prof = profMap[id];
            byDriver[id] = {
              driver_id: id,
              driver_name: prof?.full_name ?? '',
              phone: prof?.phone ?? null,
              vehicle_plate: null,
              lat: Number(latest.lat),
              lng: Number(latest.lng),
              speed_kmh: latest.speed_kmh != null ? Number(latest.speed_kmh) : null,
              heading_deg: latest.heading_deg != null ? Number(latest.heading_deg) : null,
              last_location_at: latest.recorded_at,
              delivery_note_id: null,
              note_number: null,
              status: null,
              delivery_address: null,
              current_address: null,
              base_address: prof?.base_address ?? null,
              base_lat: prof?.base_lat ?? null,
              base_lng: prof?.base_lng ?? null,
            };
          }
        }
        // Refresh existing drivers with any newer live ping.
        for (const [id, latest] of Object.entries(latestPerDriver)) {
          const cur = byDriver[id];
          if (!cur) continue;
          if (new Date(latest.recorded_at).getTime() > new Date(cur.last_location_at).getTime()) {
            cur.lat = Number(latest.lat);
            cur.lng = Number(latest.lng);
            cur.speed_kmh = latest.speed_kmh != null ? Number(latest.speed_kmh) : cur.speed_kmh;
            cur.heading_deg = latest.heading_deg != null ? Number(latest.heading_deg) : cur.heading_deg;
            cur.last_location_at = latest.recorded_at;
          }
        }
        setDrivers(byDriver);

        const driverIds = Object.keys(byDriver);
        if (driverIds.length > 0) {
          const trailCutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
          const { data: locs } = await supabase
            .from('driver_locations')
            .select('driver_id, lat, lng, speed_kmh, heading_deg, recorded_at')
            .eq('company_id', companyId)
            .in('driver_id', driverIds)
            .gte('recorded_at', trailCutoff)
            .order('recorded_at', { ascending: true })
            .limit(2000);
          const byId: Record<string, [number, number][]> = {};
          for (const row of (locs as Array<{ driver_id: string; lat: number; lng: number; speed_kmh: number | null; heading_deg: number | null; recorded_at: string }>) ?? []) {
            const id = row.driver_id;
            (byId[id] ||= []).push([Number(row.lat), Number(row.lng)]);
            const current = byDriver[id];
            if (current && new Date(row.recorded_at).getTime() >= new Date(current.last_location_at).getTime() - 1000) {
              current.speed_kmh = row.speed_kmh != null ? Number(row.speed_kmh) : current.speed_kmh;
              current.heading_deg = row.heading_deg != null ? Number(row.heading_deg) : current.heading_deg;
            }
          }
          setTrails(byId);
          setDrivers({ ...byDriver });
        } else {
          setTrails({});
        }
        setLoading(false);
      } catch (err) {
        logger.error('LiveFleetMap load failed', { error: err });
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    const locationChannel = supabase
      .channel(`live_fleet_locations_${companyId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'driver_locations', filter: `company_id=eq.${companyId}` },
        (payload) => {
          const row = payload.new as {
            driver_id: string;
            lat: number;
            lng: number;
            speed_kmh: number | null;
            heading_deg: number | null;
            recorded_at: string;
            delivery_note_id: string | null;
          };
          setDrivers((prev) => {
            const existing = prev[row.driver_id];
            if (!existing) {
              // New driver just came online. Insert a minimal ping so they
              // appear on the map immediately; profile details will be
              // hydrated by the next full load() tick.
              const newLat = Number(row.lat);
              const newLng = Number(row.lng);
              return {
                ...prev,
                [row.driver_id]: {
                  driver_id: row.driver_id,
                  driver_name: '',
                  phone: null,
                  vehicle_plate: null,
                  lat: newLat,
                  lng: newLng,
                  speed_kmh: row.speed_kmh != null ? Number(row.speed_kmh) : null,
                  heading_deg: row.heading_deg != null ? Number(row.heading_deg) : null,
                  last_location_at: row.recorded_at,
                  delivery_note_id: row.delivery_note_id,
                  note_number: null,
                  status: null,
                  delivery_address: null,
                  current_address: null,
                  base_address: null,
                  base_lat: null,
                  base_lng: null,
                },
              };
            }
            const newLat = Number(row.lat);
            const newLng = Number(row.lng);
            let derived: number | null = null;
            if (existing.last_location_at) {
              const dtSec = (new Date(row.recorded_at).getTime() - new Date(existing.last_location_at).getTime()) / 1000;
              if (dtSec > 0.5 && dtSec < 120) {
                const meters = haversine(existing.lat, existing.lng, newLat, newLng);
                derived = Math.max(0, (meters / dtSec) * 3.6);
                if (derived < 1) derived = 0;
              }
            }
            const fromRow = row.speed_kmh != null ? Number(row.speed_kmh) : null;
            const speed = fromRow != null && fromRow > 0 ? fromRow : (derived ?? fromRow ?? existing.speed_kmh);
            return {
              ...prev,
              [row.driver_id]: {
                ...existing,
                lat: newLat,
                lng: newLng,
                speed_kmh: speed,
                heading_deg: row.heading_deg != null ? Number(row.heading_deg) : existing.heading_deg,
                last_location_at: row.recorded_at,
              },
            };
          });
          setTrails((prev) => {
            const next = { ...prev };
            const arr = (next[row.driver_id] ||= []);
            arr.push([Number(row.lat), Number(row.lng)]);
            if (arr.length > 400) arr.splice(0, arr.length - 400);
            next[row.driver_id] = [...arr];
            return next;
          });
        },
      )
      .subscribe();

    const deliveryChannel = supabase
      .channel(`live_fleet_delivery_${companyId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'delivery_notes', filter: `company_id=eq.${companyId}` },
        () => {
          void load();
        },
      )
      .subscribe();

    const interval = window.setInterval(() => {
      void load();
    }, 30000);

    const livePoll = window.setInterval(async () => {
      if (cancelled) return;
      try {
        const { data: rows } = await supabase
          .from('driver_locations')
          .select('driver_id, lat, lng, speed_kmh, heading_deg, recorded_at')
          .eq('company_id', companyId)
          .gte('recorded_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
          .order('recorded_at', { ascending: false })
          .limit(200);
        if (cancelled || !rows) return;
        const latestByDriver: Record<string, { lat: number; lng: number; speed_kmh: number | null; heading_deg: number | null; recorded_at: string }> = {};
        for (const r of rows as Array<{ driver_id: string; lat: number; lng: number; speed_kmh: number | null; heading_deg: number | null; recorded_at: string }>) {
          if (!latestByDriver[r.driver_id]) latestByDriver[r.driver_id] = r;
        }
        setDrivers((prev) => {
          let changed = false;
          const next = { ...prev };
          for (const [driverId, latest] of Object.entries(latestByDriver)) {
            const cur = next[driverId];
            if (!cur) {
              next[driverId] = {
                driver_id: driverId,
                driver_name: '',
                phone: null,
                vehicle_plate: null,
                lat: Number(latest.lat),
                lng: Number(latest.lng),
                speed_kmh: latest.speed_kmh != null ? Number(latest.speed_kmh) : null,
                heading_deg: latest.heading_deg != null ? Number(latest.heading_deg) : null,
                last_location_at: latest.recorded_at,
                delivery_note_id: null,
                note_number: null,
                status: null,
                delivery_address: null,
                current_address: null,
                base_address: null,
                base_lat: null,
                base_lng: null,
              };
              changed = true;
              continue;
            }
            const lat = Number(latest.lat);
            const lng = Number(latest.lng);
            let derived: number | null = null;
            if (cur.last_location_at && latest.recorded_at !== cur.last_location_at) {
              const dtSec = (new Date(latest.recorded_at).getTime() - new Date(cur.last_location_at).getTime()) / 1000;
              if (dtSec > 0.5 && dtSec < 120) {
                const meters = haversine(cur.lat, cur.lng, lat, lng);
                derived = Math.max(0, (meters / dtSec) * 3.6);
                if (derived < 1) derived = 0;
              }
            }
            const fromRow = latest.speed_kmh != null ? Number(latest.speed_kmh) : null;
            const speed = fromRow != null && fromRow > 0 ? fromRow : (derived ?? fromRow ?? cur.speed_kmh);
            const heading = latest.heading_deg != null ? Number(latest.heading_deg) : cur.heading_deg;
            if (cur.lat === lat && cur.lng === lng && cur.speed_kmh === speed && cur.last_location_at === latest.recorded_at) continue;
            next[driverId] = { ...cur, lat, lng, speed_kmh: speed, heading_deg: heading, last_location_at: latest.recorded_at };
            changed = true;
          }
          return changed ? next : prev;
        });
        setTrails((prev) => {
          const next = { ...prev };
          for (const [driverId, latest] of Object.entries(latestByDriver)) {
            const arr = (next[driverId] ||= []);
            const lat = Number(latest.lat);
            const lng = Number(latest.lng);
            const last = arr[arr.length - 1];
            if (!last || last[0] !== lat || last[1] !== lng) {
              arr.push([lat, lng]);
              if (arr.length > 400) arr.splice(0, arr.length - 400);
              next[driverId] = [...arr];
            }
          }
          return next;
        });
      } catch (err) {
        logger.warn('live poll failed', { error: err });
      }
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.clearInterval(livePoll);
      void supabase.removeChannel(locationChannel);
      void supabase.removeChannel(deliveryChannel);
    };
  }, [companyId]);

  const list = useMemo(() => Object.values(drivers), [drivers]);

  const lastGeocodedRef = useRef<Record<string, string>>({});
  useEffect(() => {
    const timers: number[] = [];
    for (const d of list) {
      const key = `${d.lat.toFixed(4)},${d.lng.toFixed(4)}`;
      if (lastGeocodedRef.current[d.driver_id] === key) continue;
      lastGeocodedRef.current[d.driver_id] = key;
      const cached = geocodeCache.get(key);
      if (cached) {
        setDrivers((prev) => {
          const cur = prev[d.driver_id];
          if (!cur || cur.current_address === cached) return prev;
          return { ...prev, [d.driver_id]: { ...cur, current_address: cached } };
        });
        continue;
      }
      const t = window.setTimeout(async () => {
        const addr = await reverseGeocode(d.lat, d.lng);
        if (!addr) return;
        setDrivers((prev) => {
          const cur = prev[d.driver_id];
          if (!cur) return prev;
          return { ...prev, [d.driver_id]: { ...cur, current_address: addr } };
        });
      }, 1500);
      timers.push(t);
    }
    return () => { timers.forEach((t) => window.clearTimeout(t)); };
  }, [list]);

  const activeDriver = useMemo(() => list.find((d) => d.driver_id === activeId) ?? null, [list, activeId]);
  const followTarget: [number, number] | null = useMemo(() => {
    if (!followId) return null;
    const d = drivers[followId];
    return d ? [d.lat, d.lng] : null;
  }, [followId, drivers]);

  const followHeading: number | null = useMemo(() => {
    if (!followId) return null;
    const d = drivers[followId];
    if (!d) return null;
    if (d.heading_deg != null && !Number.isNaN(d.heading_deg)) return d.heading_deg;
    const trail = trails[followId];
    if (trail && trail.length >= 2) {
      for (let i = trail.length - 1; i > 0; i--) {
        const [lat2, lng2] = trail[i];
        const [lat1, lng1] = trail[i - 1];
        if (haversine(lat1, lng1, lat2, lng2) > 8) {
          return computeBearing(lat1, lng1, lat2, lng2);
        }
      }
    }
    return null;
  }, [followId, drivers, trails]);

  const center: [number, number] = list.length > 0 ? [list[0].lat, list[0].lng] : [50.1, 10.3];

  async function submitExtension(driver: DriverPing) {
    if (!extendText.trim() || !driver.delivery_note_id) return;
    setExtendSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error('No user');
      await supabase.from('route_extension_requests').insert({
        company_id: companyId,
        driver_id: driver.driver_id,
        delivery_note_id: driver.delivery_note_id,
        requested_address: extendText.trim(),
        reason: 'Company request',
        status: 'accepted',
        decided_by: uid,
        decided_at: new Date().toISOString(),
      });
      await supabase.from('notifications').insert({
        user_id: driver.driver_id,
        type: 'delivery',
        title: 'Zgjatje e rruges',
        message: `Shto nje ndalese te re: ${extendText.trim()}`,
        reference_id: driver.delivery_note_id,
        data: { titleKey: 'notifications.routeExt.title', messageKey: 'notifications.routeExt.body', params: { address: extendText.trim() } },
      });
      setExtendOpen(null);
      setExtendText('');
    } catch (err) {
      logger.warn('route extension failed', { error: err });
    } finally {
      setExtendSaving(false);
    }
  }

  return (
    <div className="fleet-map-root rounded-xl overflow-hidden border border-slate-200 bg-white relative" style={{ height, minHeight: '280px' }}>
      {trafficAlerts.length > 0 && (
        <div className="absolute top-2 left-2 right-2 z-[8] flex flex-col gap-1.5 pointer-events-none">
          {trafficAlerts.slice(0, 3).map((a) => {
            const severityCls =
              a.severity === 'high'
                ? 'bg-red-600 text-white border-red-700'
                : a.severity === 'moderate'
                ? 'bg-amber-500 text-white border-amber-600'
                : 'bg-amber-100 text-amber-900 border-amber-200';
            const driver = drivers[a.driver_id];
            return (
              <div
                key={a.id}
                className={`pointer-events-auto flex items-start gap-2 rounded-lg border shadow-lg px-3 py-2 text-xs ${severityCls}`}
              >
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">
                    {driver?.driver_name || 'Shoferi'} {a.delay_minutes ? ` • vonese ${a.delay_minutes} min` : ''}
                  </div>
                  <div className="truncate opacity-90">{a.message}</div>
                </div>
                <button
                  onClick={() => {
                    setActiveId(a.driver_id);
                    setFollowId(a.driver_id);
                  }}
                  className="text-[11px] font-semibold underline whitespace-nowrap"
                >
                  Shiko
                </button>
              </div>
            );
          })}
        </div>
      )}
      {!compact && !loading && (
        <div className="absolute right-3 bottom-14 z-[7] flex flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              setLocating(true);
              if (!navigator.geolocation) { setLocating(false); return; }
              navigator.geolocation.getCurrentPosition(
                (pos) => {
                  const c: [number, number] = [pos.coords.latitude, pos.coords.longitude];
                  setUserLocation(c);
                  mapRef.current?.panTo(c, { animate: true });
                  mapRef.current?.setZoom(Math.max(mapRef.current.getZoom() ?? 13, 14));
                  setLocating(false);
                },
                () => setLocating(false),
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
              );
            }}
            title="Lokalizo veten"
            className="w-10 h-10 rounded-full bg-white shadow-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-colors"
          >
            <LocateFixed className={`w-[18px] h-[18px] ${userLocation ? 'text-blue-600' : 'text-slate-700'} ${locating ? 'animate-pulse' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => {
              if (activeDriver) {
                mapRef.current?.flyTo([activeDriver.lat, activeDriver.lng], 16, { animate: true, duration: 1 });
              } else if (list.length > 0) {
                const bounds = L.latLngBounds(list.map((d) => [d.lat, d.lng] as [number, number]));
                mapRef.current?.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
              }
            }}
            title="Drejto harten"
            className="w-10 h-10 rounded-full bg-white shadow-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-colors"
          >
            <Compass className="w-[18px] h-[18px] text-slate-700" />
          </button>
          {activeDriver && activeDriver.base_lat != null && activeDriver.base_lng != null && (
            <button
              type="button"
              onClick={() => {
                setRouteToBaseFor((prev) => (prev === activeDriver.driver_id ? null : activeDriver.driver_id));
                if (activeDriver.base_lat != null && activeDriver.base_lng != null) {
                  const bounds = L.latLngBounds([
                    [activeDriver.lat, activeDriver.lng],
                    [activeDriver.base_lat, activeDriver.base_lng],
                  ]);
                  mapRef.current?.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });
                }
              }}
              title={routeToBaseFor === activeDriver.driver_id ? 'Fshi vijen ne depo' : 'Drejto ne depo'}
              className={`w-10 h-10 rounded-full shadow-lg border flex items-center justify-center transition-colors ${
                routeToBaseFor === activeDriver.driver_id
                  ? 'bg-teal-600 border-teal-700 text-white hover:bg-teal-700'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Home className="w-[18px] h-[18px]" />
            </button>
          )}
        </div>
      )}
      {loading && list.length === 0 ? (
        <div className="h-full flex items-center justify-center text-sm text-slate-500">Loading map...</div>
      ) : (
        <>
          <MapContainer center={center} zoom={6} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
            <TileLayer
              attribution='&copy; OpenStreetMap contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FitBounds drivers={list} active={followId === null} />
            <FollowDriver target={followTarget} driverId={followId} />
            <MapRotation heading={followHeading} active={followId !== null} />
            {list.map((d) => {
              const trail = trails[d.driver_id];
              const isActive = activeId === d.driver_id;
              const initials = deriveInitials(d.driver_name);
              let heading = d.heading_deg;
              if ((heading == null || Number.isNaN(heading)) && trail && trail.length >= 2) {
                for (let i = trail.length - 1; i > 0; i--) {
                  const [lat2, lng2] = trail[i];
                  const [lat1, lng1] = trail[i - 1];
                  const dist = haversine(lat1, lng1, lat2, lng2);
                  if (dist > 8) {
                    heading = computeBearing(lat1, lng1, lat2, lng2);
                    break;
                  }
                }
              }
              const showRouteToBase =
                routeToBaseFor === d.driver_id && d.base_lat != null && d.base_lng != null;
              return (
                <Fragment key={d.driver_id}>
                  {showRouteToBase && (
                    <Polyline
                      positions={[[d.lat, d.lng], [d.base_lat as number, d.base_lng as number]]}
                      pathOptions={{ color: '#0f766e', weight: 4, opacity: 0.8, dashArray: '6 6' }}
                    />
                  )}
                  <Marker
                    position={[d.lat, d.lng]}
                    icon={buildTruckIcon(initials, isActive, heading ?? null)}
                    eventHandlers={{
                      click: () => setActiveId(d.driver_id),
                    }}
                  />
                </Fragment>
              );
            })}
            {userLocation && (
              <Marker
                position={userLocation}
                icon={L.divIcon({
                  className: 'user-location-icon',
                  html: `<div style="width:18px;height:18px;border-radius:50%;background:#2563eb;border:3px solid white;box-shadow:0 0 0 2px rgba(37,99,235,.35), 0 2px 6px rgba(0,0,0,.35);"></div>`,
                  iconSize: [18, 18],
                  iconAnchor: [9, 9],
                })}
              />
            )}
            <MapRefCapture onReady={(m) => { mapRef.current = m; }} />
          </MapContainer>

          {followId && followHeading != null && (
            <div className="absolute top-3 left-3 z-[8] pointer-events-none">
              <div
                className="w-10 h-10 rounded-full bg-white/90 backdrop-blur shadow-lg border border-slate-200 flex items-center justify-center"
                style={{ transform: `rotate(${-followHeading}deg)`, transition: 'transform 0.8s ease' }}
              >
                <div className="flex flex-col items-center leading-none">
                  <span className="text-[9px] font-black text-red-600">N</span>
                  <svg width="12" height="10" viewBox="0 0 12 10" className="-mt-0.5">
                    <polygon points="6,0 2,10 6,7 10,10" fill="#dc2626" opacity="0.9" />
                  </svg>
                </div>
              </div>
            </div>
          )}

          {!compact && list.length > 0 && !activeDriver && (
            <div className="absolute top-3 right-3 z-[6] bg-white/95 backdrop-blur rounded-xl shadow-lg border border-slate-200 p-2 max-w-[220px] w-[200px]">
              <div className="text-[11px] font-semibold text-slate-500 uppercase mb-1 px-1">Shoferet aktive</div>
              <div className="max-h-[140px] sm:max-h-[200px] overflow-y-auto space-y-1">
                {list.map((d) => (
                  <button
                    key={d.driver_id}
                    onClick={() => {
                      setActiveId(d.driver_id);
                      setFollowId((id) => (id === d.driver_id ? null : d.driver_id));
                    }}
                    className={`w-full text-left px-2 py-1.5 rounded-lg text-xs flex items-center gap-2 ${followId === d.driver_id ? 'bg-teal-600 text-white' : 'hover:bg-slate-100 text-slate-700'}`}
                  >
                    <MiniTruck initials={deriveInitials(d.driver_name)} inverted={followId === d.driver_id} size="xs" />
                    <span className="flex-1 truncate font-medium">{d.driver_name || 'Driver'}</span>
                    {d.speed_kmh != null && <span className="text-[10px] opacity-80">{Math.round(d.speed_kmh)}</span>}
                    {followId === d.driver_id && <Crosshair className="w-3.5 h-3.5" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeDriver && !compact && (
            <div className="absolute top-3 right-3 z-[7] bg-white/95 backdrop-blur rounded-xl shadow-lg border border-slate-200 p-3 w-[300px] max-w-[calc(100%-1.5rem)] max-h-[50vh] sm:max-h-[calc(100%-1.5rem)] overflow-y-auto">
              <div className="flex items-start gap-2">
                <MiniTruck initials={deriveInitials(activeDriver.driver_name)} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-900 text-sm truncate">{activeDriver.driver_name || 'Driver'}</div>
                  {activeDriver.note_number && (
                    <div className="text-xs text-slate-600">Dergesa {activeDriver.note_number} - {activeDriver.status}</div>
                  )}
                  <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1">
                    {activeDriver.speed_kmh != null && (
                      <span className="inline-flex items-center gap-1"><Gauge className="w-3 h-3" />{Math.round(activeDriver.speed_kmh)} km/h</span>
                    )}
                    <span>
                      <LiveDot lastAt={activeDriver.last_location_at} nowTick={nowTick} />
                      {agoLabel(activeDriver.last_location_at, nowTick)} me pare
                    </span>
                  </div>
                </div>
                <button onClick={() => setActiveId(null)} className="text-slate-400 text-xs px-1">x</button>
              </div>

              <div className="mt-2 rounded-lg bg-teal-50 border border-teal-100 p-2">
                <div className="flex items-start gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-teal-700 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-bold text-teal-800 uppercase tracking-wide">{t('common.whereIsNow')}</div>
                    <div className="text-xs font-semibold text-slate-800 break-words">
                      {activeDriver.current_address ?? (
                        <span className="text-slate-500 font-normal">Duke marre adresen...</span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                      {activeDriver.lat.toFixed(5)}, {activeDriver.lng.toFixed(5)}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        const text = activeDriver.current_address
                          ? `${activeDriver.current_address} (${activeDriver.lat.toFixed(5)}, ${activeDriver.lng.toFixed(5)})`
                          : `${activeDriver.lat.toFixed(5)}, ${activeDriver.lng.toFixed(5)}`;
                        void navigator.clipboard?.writeText(text);
                      }}
                      title="Kopjo adresen"
                      className="p-1 rounded-md hover:bg-teal-100 text-teal-700"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <a
                      href={`https://www.google.com/maps?q=${activeDriver.lat},${activeDriver.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Hap ne Google Maps"
                      className="p-1 rounded-md hover:bg-teal-100 text-teal-700"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              </div>

              {hasRealDeliveryDestination(activeDriver) ? (
                <div className="mt-1.5 flex items-start gap-1.5 text-[11px] text-slate-500">
                  <Navigation className="w-3 h-3 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <span className="font-semibold text-slate-600">Destinacioni: </span>
                    <span className="break-words">{activeDriver.delivery_address}</span>
                  </div>
                </div>
              ) : activeDriver.base_address && activeDriver.base_lat != null && activeDriver.base_lng != null ? (
                <div className="mt-1.5 flex items-start gap-1.5 text-[11px] text-slate-500">
                  <Navigation className="w-3 h-3 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <span className="font-semibold text-slate-600">Ne baze: </span>
                    <span className="break-words">{activeDriver.base_address}</span>
                  </div>
                </div>
              ) : null}
              <div className="flex gap-2 mt-2">
                {activeDriver.phone && (
                  <a
                    href={`tel:${activeDriver.phone}`}
                    className="flex-1 inline-flex items-center justify-center gap-1 text-xs font-medium py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200"
                  >
                    <Phone className="w-3.5 h-3.5" /> Thirr
                  </a>
                )}
                <button
                  onClick={() => setExtendOpen(activeDriver.driver_id)}
                  className="flex-1 inline-flex items-center justify-center gap-1 text-xs font-medium py-1.5 rounded-lg bg-teal-600 text-white hover:bg-teal-700"
                >
                  <Route className="w-3.5 h-3.5" /> Zgjat rrugen
                </button>
              </div>

              {extendOpen === activeDriver.driver_id && (
                <div className="mt-2 p-2 rounded-lg bg-slate-50 border border-slate-200">
                  <textarea
                    value={extendText}
                    onChange={(e) => setExtendText(e.target.value)}
                    placeholder="Adresa e re / ndalesa shtese"
                    className="w-full text-xs rounded-md border border-slate-200 p-2 focus:ring-2 focus:ring-teal-500 outline-none"
                    rows={2}
                  />
                  <div className="flex justify-end gap-2 mt-1.5">
                    <button
                      onClick={() => { setExtendOpen(null); setExtendText(''); }}
                      className="text-xs px-2 py-1 rounded-md text-slate-600 hover:bg-slate-200"
                    >Anulo</button>
                    <button
                      disabled={extendSaving || !extendText.trim()}
                      onClick={() => submitExtension(activeDriver)}
                      className="text-xs px-3 py-1 rounded-md bg-teal-600 text-white disabled:opacity-50 inline-flex items-center gap-1"
                    >
                      <Send className="w-3 h-3" /> Dergo
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
      {list.length === 0 && !loading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-white/90 backdrop-blur px-4 py-2 rounded-lg text-sm text-slate-600 shadow">
            Asnje shofer aktiv ne 24 oret e fundit
          </div>
        </div>
      )}
    </div>
  );
}

function LiveDot({ lastAt, nowTick }: { lastAt: string | null; nowTick: number }) {
  if (!lastAt) return null;
  const diff = nowTick - new Date(lastAt).getTime();
  const live = diff < 20000;
  return (
    <span
      className={`inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle ${live ? 'bg-emerald-500' : 'bg-slate-400'}`}
      style={live ? { boxShadow: '0 0 0 0 rgba(16,185,129,.7)', animation: 'pulse-dot 1.4s infinite' } : undefined}
    />
  );
}

function MiniTruck({ initials, inverted = false, size = 'md' }: { initials: string; inverted?: boolean; size?: 'xs' | 'md' }) {
  const cargoColor = inverted ? '#ffffff' : '#0f766e';
  const cabColor = inverted ? '#e2e8f0' : '#115e59';
  const textColor = inverted ? '#0f766e' : '#ffffff';
  const windowColor = inverted ? '#94a3b8' : '#bae6fd';
  const wheelColor = inverted ? '#475569' : '#0f172a';
  const width = size === 'xs' ? 28 : 40;
  const height = size === 'xs' ? 16 : 22;
  const svgFontSize = size === 'xs' ? 14 : 13;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 80 44"
      className="flex-shrink-0"
      style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.15))' }}
    >
      <rect x="2" y="6" width="50" height="28" rx="3" fill={cargoColor} />
      <path d="M52 14 L68 14 L76 24 L76 34 L52 34 Z" fill={cabColor} />
      <rect x="55" y="17" width="14" height="8" rx="1.5" fill={windowColor} opacity="0.9" />
      <circle cx="15" cy="36" r="5" fill={wheelColor} />
      <circle cx="62" cy="36" r="5" fill={wheelColor} />
      <text
        x="27"
        y="26"
        textAnchor="middle"
        fontFamily="system-ui,-apple-system,sans-serif"
        fontSize={svgFontSize}
        fontWeight="800"
        fill={textColor}
        letterSpacing="0.5"
      >
        {initials}
      </text>
    </svg>
  );
}
