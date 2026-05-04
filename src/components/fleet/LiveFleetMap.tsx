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
  recorded_at: string;
  speed_kmh: number | null;
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

export default function LiveFleetMap({ companyId, height = '600px' }: Props) {
  const [drivers, setDrivers] = useState<Record<string, DriverPing>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;

    const load = async () => {
      try {
        const { data: locs, error } = await supabase
          .from('driver_locations')
          .select('driver_id, lat, lng, recorded_at, speed_kmh, delivery_note_id')
          .eq('company_id', companyId)
          .gte('recorded_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .order('recorded_at', { ascending: false })
          .limit(500);
        if (error) throw error;

        const byDriver: Record<string, DriverPing> = {};
        for (const row of (locs ?? []) as Array<Record<string, unknown>>) {
          const did = String(row.driver_id);
          if (!byDriver[did]) {
            byDriver[did] = {
              driver_id: did,
              driver_name: '',
              lat: Number(row.lat),
              lng: Number(row.lng),
              recorded_at: String(row.recorded_at),
              speed_kmh: row.speed_kmh === null ? null : Number(row.speed_kmh),
              delivery_note_id: row.delivery_note_id ? String(row.delivery_note_id) : null,
              note_number: null,
              status: null,
            };
          }
        }

        const ids = Object.keys(byDriver);
        if (ids.length > 0) {
          const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', ids);
          for (const p of (profs ?? []) as Array<{ id: string; full_name: string }>) {
            if (byDriver[p.id]) byDriver[p.id].driver_name = p.full_name ?? '';
          }
          const deliveryIds = Object.values(byDriver).map((d) => d.delivery_note_id).filter(Boolean) as string[];
          if (deliveryIds.length > 0) {
            const { data: dns } = await supabase
              .from('delivery_notes')
              .select('id, note_number, status, assigned_driver_id')
              .in('id', deliveryIds);
            for (const dn of (dns ?? []) as Array<{ id: string; note_number: string; status: string; assigned_driver_id: string }>) {
              const driver = Object.values(byDriver).find((d) => d.delivery_note_id === dn.id);
              if (driver) {
                driver.note_number = dn.note_number;
                driver.status = dn.status;
              }
            }
          }
        }

        if (!cancelled) {
          setDrivers(byDriver);
          setLoading(false);
        }
      } catch (err) {
        logger.error('LiveFleetMap load failed', { error: err });
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    const channel = supabase
      .channel(`driver_locations_${companyId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'driver_locations', filter: `company_id=eq.${companyId}` },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          setDrivers((prev) => {
            const did = String(row.driver_id);
            const existing = prev[did];
            return {
              ...prev,
              [did]: {
                driver_id: did,
                driver_name: existing?.driver_name ?? '',
                lat: Number(row.lat),
                lng: Number(row.lng),
                recorded_at: String(row.recorded_at),
                speed_kmh: row.speed_kmh === null ? null : Number(row.speed_kmh),
                delivery_note_id: row.delivery_note_id ? String(row.delivery_note_id) : existing?.delivery_note_id ?? null,
                note_number: existing?.note_number ?? null,
                status: existing?.status ?? null,
              },
            };
          });
        }
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
    <div className="rounded-xl overflow-hidden border border-slate-200 bg-white" style={{ height }}>
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
                  {d.speed_kmh !== null && <div className="text-xs text-slate-500">Speed: {Math.round(d.speed_kmh)} km/h</div>}
                  <div className="text-[11px] text-slate-400 mt-1">{new Date(d.recorded_at).toLocaleTimeString()}</div>
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
