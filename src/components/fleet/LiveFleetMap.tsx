import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '../../lib/supabase';
import { logger } from '../../utils/logger';

interface DriverPing {
  driver_id: string;
  driver_name: string;
  lat: number;
  lng: number;
  last_location_at: string;
  delivery_note_id: string | null;
  note_number: string | null;
  status: string | null;
}

interface Props {
  companyId: string;
  height?: string;
}

const truckIcon = L.divIcon({
  className: '',
  html: `<div style="width:32px;height:32px;border-radius:50%;background:#0f766e;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:14px">T</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

function FitBounds({ drivers }: { drivers: DriverPing[] }) {
  const map = useMap();
  useEffect(() => {
    if (drivers.length === 0) return;
    const bounds = L.latLngBounds(drivers.map((d) => [d.lat, d.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
  }, [drivers, map]);
  return null;
}

interface DeliveryRow {
  id: string;
  note_number: string;
  status: string;
  assigned_driver_id: string;
  current_lat: number;
  current_lng: number;
  last_location_at: string;
  driver?: { full_name: string } | null;
}

function rowsToPings(rows: DeliveryRow[]): Record<string, DriverPing> {
  const byDriver: Record<string, DriverPing> = {};
  for (const r of rows) {
    if (r.current_lat == null || r.current_lng == null || !r.assigned_driver_id) continue;
    const existing = byDriver[r.assigned_driver_id];
    const at = r.last_location_at ? new Date(r.last_location_at).getTime() : 0;
    const prevAt = existing?.last_location_at ? new Date(existing.last_location_at).getTime() : 0;
    if (!existing || at > prevAt) {
      byDriver[r.assigned_driver_id] = {
        driver_id: r.assigned_driver_id,
        driver_name: r.driver?.full_name ?? '',
        lat: Number(r.current_lat),
        lng: Number(r.current_lng),
        last_location_at: r.last_location_at,
        delivery_note_id: r.id,
        note_number: r.note_number,
        status: r.status,
      };
    }
  }
  return byDriver;
}

export default function LiveFleetMap({ companyId, height = '600px' }: Props) {
  const [drivers, setDrivers] = useState<Record<string, DriverPing>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;

    const load = async () => {
      try {
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data, error } = await supabase
          .from('delivery_notes')
          .select(
            'id, note_number, status, assigned_driver_id, current_lat, current_lng, last_location_at, driver:profiles!delivery_notes_assigned_driver_id_fkey(full_name)',
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
        if (!cancelled) {
          setDrivers(rowsToPings((data as unknown as DeliveryRow[]) ?? []));
          setLoading(false);
        }
      } catch (err) {
        logger.error('LiveFleetMap load failed', { error: err });
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    const channel = supabase
      .channel(`live_fleet_${companyId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'delivery_notes', filter: `company_id=eq.${companyId}` },
        () => {
          void load();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [companyId]);

  const list = useMemo(() => Object.values(drivers), [drivers]);
  const center: [number, number] = list.length > 0 ? [list[0].lat, list[0].lng] : [50.1, 10.3];

  return (
    <div className="rounded-xl overflow-hidden border border-slate-200 bg-white relative" style={{ height }}>
      {loading && list.length === 0 ? (
        <div className="h-full flex items-center justify-center text-sm text-slate-500">Loading map...</div>
      ) : (
        <MapContainer center={center} zoom={6} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitBounds drivers={list} />
          {list.map((d) => (
            <Marker key={d.driver_id} position={[d.lat, d.lng]} icon={truckIcon}>
              <Popup>
                <div className="text-sm">
                  <div className="font-semibold text-slate-900">{d.driver_name || 'Driver'}</div>
                  {d.note_number && <div className="text-xs text-slate-600">Delivery {d.note_number}</div>}
                  {d.status && <div className="text-xs text-slate-500">Status: {d.status}</div>}
                  <div className="text-[11px] text-slate-400 mt-1">{new Date(d.last_location_at).toLocaleTimeString()}</div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      )}
      {list.length === 0 && !loading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-white/90 backdrop-blur px-4 py-2 rounded-lg text-sm text-slate-600 shadow">
            No active drivers in the last 24 hours
          </div>
        </div>
      )}
    </div>
  );
}
