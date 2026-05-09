import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair, Gauge, Phone, Route, Send, Truck } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { logger } from '../../utils/logger';

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
}

interface Props {
  companyId: string;
  height?: string;
  compact?: boolean;
}

const truckIcon = L.divIcon({
  className: '',
  html: `<div style="width:36px;height:36px;border-radius:50%;background:#0f766e;border:3px solid white;box-shadow:0 2px 10px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:14px">T</div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

function FollowDriver({ target }: { target: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) {
      map.panTo(target, { animate: true, duration: 0.6 });
    }
  }, [target, map]);
  return null;
}

function FitBounds({ drivers, active }: { drivers: DriverPing[]; active: boolean }) {
  const map = useMap();
  const didInitialFit = useRef(false);
  useEffect(() => {
    if (!active) return;
    if (drivers.length === 0) return;
    if (didInitialFit.current) return;
    const bounds = L.latLngBounds(drivers.map((d) => [d.lat, d.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    didInitialFit.current = true;
  }, [drivers, map, active]);
  return null;
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
  driver?: { full_name: string; phone: string | null } | null;
}

function agoLabel(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.max(1, Math.round(diff / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  return `${h}h`;
}

export default function LiveFleetMap({ companyId, height = '600px', compact = false }: Props) {
  const [drivers, setDrivers] = useState<Record<string, DriverPing>>({});
  const [trails, setTrails] = useState<Record<string, [number, number][]>>({});
  const [loading, setLoading] = useState(true);
  const [followId, setFollowId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [extendOpen, setExtendOpen] = useState<string | null>(null);
  const [extendText, setExtendText] = useState('');
  const [extendSaving, setExtendSaving] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;

    const load = async () => {
      try {
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data, error } = await supabase
          .from('delivery_notes')
          .select(
            'id, note_number, status, delivery_address, assigned_driver_id, current_lat, current_lng, last_location_at, driver:profiles!delivery_notes_assigned_driver_id_fkey(full_name, phone)',
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
            };
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
            if (!existing) return prev;
            return {
              ...prev,
              [row.driver_id]: {
                ...existing,
                lat: Number(row.lat),
                lng: Number(row.lng),
                speed_kmh: row.speed_kmh != null ? Number(row.speed_kmh) : existing.speed_kmh,
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

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      void supabase.removeChannel(locationChannel);
      void supabase.removeChannel(deliveryChannel);
    };
  }, [companyId]);

  const list = useMemo(() => Object.values(drivers), [drivers]);
  const activeDriver = useMemo(() => list.find((d) => d.driver_id === activeId) ?? null, [list, activeId]);
  const followTarget: [number, number] | null = useMemo(() => {
    if (!followId) return null;
    const d = drivers[followId];
    return d ? [d.lat, d.lng] : null;
  }, [followId, drivers]);

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
    <div className="fleet-map-root rounded-xl overflow-hidden border border-slate-200 bg-white relative" style={{ height }}>
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
            <FollowDriver target={followTarget} />
            {list.map((d) => {
              const trail = trails[d.driver_id];
              return (
                <Fragment key={d.driver_id}>
                  {trail && trail.length > 1 && (
                    <Polyline positions={trail} pathOptions={{ color: '#0f766e', weight: 4, opacity: 0.55 }} />
                  )}
                  <Marker
                    position={[d.lat, d.lng]}
                    icon={truckIcon}
                    eventHandlers={{
                      click: () => setActiveId(d.driver_id),
                    }}
                  >
                    <Popup>
                      <div className="text-sm min-w-[220px]">
                        <div className="font-semibold text-slate-900">{d.driver_name || 'Driver'}</div>
                        {d.phone && (
                          <div className="flex items-center gap-1 text-xs text-slate-600 mt-0.5">
                            <Phone className="w-3 h-3" /> {d.phone}
                          </div>
                        )}
                        {d.note_number && <div className="text-xs text-slate-700 mt-1">Dergesa: {d.note_number}</div>}
                        {d.delivery_address && <div className="text-xs text-slate-500">{d.delivery_address}</div>}
                        {d.speed_kmh != null && (
                          <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
                            <Gauge className="w-3 h-3" /> {Math.round(d.speed_kmh)} km/h
                          </div>
                        )}
                        <div className="text-[11px] text-slate-400 mt-1">{agoLabel(d.last_location_at)} me pare</div>
                      </div>
                    </Popup>
                  </Marker>
                </Fragment>
              );
            })}
          </MapContainer>

          {!compact && list.length > 0 && (
            <div className="absolute top-3 right-3 z-[6] bg-white/95 backdrop-blur rounded-xl shadow-lg border border-slate-200 p-2 max-w-[260px] w-[240px]">
              <div className="text-[11px] font-semibold text-slate-500 uppercase mb-1 px-1">Shoferet aktive</div>
              <div className="max-h-[200px] overflow-y-auto space-y-1">
                {list.map((d) => (
                  <button
                    key={d.driver_id}
                    onClick={() => {
                      setActiveId(d.driver_id);
                      setFollowId((id) => (id === d.driver_id ? null : d.driver_id));
                    }}
                    className={`w-full text-left px-2 py-1.5 rounded-lg text-xs flex items-center gap-2 ${followId === d.driver_id ? 'bg-teal-600 text-white' : 'hover:bg-slate-100 text-slate-700'}`}
                  >
                    <Truck className="w-3.5 h-3.5" />
                    <span className="flex-1 truncate font-medium">{d.driver_name || 'Driver'}</span>
                    {d.speed_kmh != null && <span className="text-[10px] opacity-80">{Math.round(d.speed_kmh)}</span>}
                    {followId === d.driver_id && <Crosshair className="w-3.5 h-3.5" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeDriver && !compact && (
            <div className="absolute bottom-3 left-3 right-3 md:right-auto md:w-[320px] z-[6] bg-white/95 backdrop-blur rounded-xl shadow-lg border border-slate-200 p-3">
              <div className="flex items-start gap-2">
                <div className="w-9 h-9 rounded-full bg-teal-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                  {(activeDriver.driver_name || 'D').charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-900 text-sm truncate">{activeDriver.driver_name || 'Driver'}</div>
                  {activeDriver.note_number && (
                    <div className="text-xs text-slate-600">Dergesa {activeDriver.note_number} - {activeDriver.status}</div>
                  )}
                  {activeDriver.delivery_address && (
                    <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">{activeDriver.delivery_address}</div>
                  )}
                  <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1">
                    {activeDriver.speed_kmh != null && (
                      <span className="inline-flex items-center gap-1"><Gauge className="w-3 h-3" />{Math.round(activeDriver.speed_kmh)} km/h</span>
                    )}
                    <span>{agoLabel(activeDriver.last_location_at)} me pare</span>
                  </div>
                </div>
                <button onClick={() => setActiveId(null)} className="text-slate-400 text-xs px-1">x</button>
              </div>
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
