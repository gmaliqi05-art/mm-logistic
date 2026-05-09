import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface Point { lat: number; lng: number; label?: string }
export interface RouteAlt { label: string; geometry: [number, number][] }

const ROUTE_COLORS = ['#0f766e', '#d97706', '#6b7280'];

const originIcon = L.divIcon({
  className: '',
  html: `<div style="width:20px;height:20px;border-radius:50%;background:#10b981;border:3px solid white;box-shadow:0 0 0 2px #10b981"></div>`,
  iconSize: [20, 20], iconAnchor: [10, 10],
});
const destIcon = L.divIcon({
  className: '',
  html: `<div style="width:20px;height:20px;border-radius:50%;background:#dc2626;border:3px solid white;box-shadow:0 0 0 2px #dc2626"></div>`,
  iconSize: [20, 20], iconAnchor: [10, 10],
});

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=16`);
    const j = (await r.json()) as { display_name?: string };
    return j.display_name ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  } catch {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
}

function FitToGeometry({ geometry }: { geometry: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (geometry.length < 2) return;
    const bounds = L.latLngBounds(geometry.map(([lng, lat]) => [lat, lng] as [number, number]));
    map.fitBounds(bounds, { padding: [40, 40] });
  }, [geometry, map]);
  return null;
}

function ClickHandler({ mode, onSetOrigin, onSetDest }: {
  mode: 'origin' | 'destination' | null;
  onSetOrigin?: (p: Point) => void;
  onSetDest?: (p: Point) => void;
}) {
  useMapEvents({
    click(e) {
      if (mode === 'origin' && onSetOrigin) {
        onSetOrigin({ lat: e.latlng.lat, lng: e.latlng.lng });
      } else if (mode === 'destination' && onSetDest) {
        onSetDest({ lat: e.latlng.lat, lng: e.latlng.lng });
      }
    },
  });
  return null;
}

interface Props {
  origin: Point | null;
  dest: Point | null;
  allowOriginEdit?: boolean;
  mode: 'origin' | 'destination' | null;
  onSetOrigin?: (p: Point) => void;
  onSetDest?: (p: Point) => void;
  alternatives?: RouteAlt[];
  selectedIdx?: number;
  height?: number;
}

export default function RouteMapPicker({
  origin, dest, allowOriginEdit = true, mode, onSetOrigin, onSetDest,
  alternatives = [], selectedIdx = 0, height = 420,
}: Props) {
  const selectedGeom = alternatives[selectedIdx]?.geometry ?? [];
  const selectedLatLng = useMemo(
    () => selectedGeom.map(([lng, lat]) => [lat, lng] as [number, number]),
    [selectedGeom],
  );
  const center: [number, number] = origin ? [origin.lat, origin.lng] : dest ? [dest.lat, dest.lng] : [50.1, 10.3];

  return (
    <div className="fleet-map-root rounded-xl overflow-hidden border border-slate-200 bg-white relative" style={{ height }}>
      {mode && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[500] bg-slate-900 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg">
          Kliko ne harte per te vendosur {mode === 'origin' ? 'nisjen' : 'destinacionin'}
        </div>
      )}
      <MapContainer center={center} zoom={origin || dest ? 8 : 6} style={{ height: '100%', width: '100%', cursor: mode ? 'crosshair' : undefined }} scrollWheelZoom>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap contributors' />
        <ClickHandler mode={mode} onSetOrigin={onSetOrigin} onSetDest={onSetDest} />
        {selectedLatLng.length > 1 && <FitToGeometry geometry={selectedGeom} />}

        {alternatives.map((opt, idx) => {
          const positions = opt.geometry.map(([lng, lat]) => [lat, lng] as [number, number]);
          if (positions.length < 2) return null;
          const isSel = idx === selectedIdx;
          return (
            <Polyline
              key={idx}
              positions={positions}
              pathOptions={{
                color: ROUTE_COLORS[idx % ROUTE_COLORS.length],
                weight: isSel ? 6 : 3,
                opacity: isSel ? 0.95 : 0.45,
                dashArray: isSel ? undefined : '6 8',
              }}
            />
          );
        })}

        {origin && (
          <Marker
            position={[origin.lat, origin.lng]}
            icon={originIcon}
            draggable={allowOriginEdit && !!onSetOrigin}
            eventHandlers={{
              dragend: (e) => {
                const ll = (e.target as L.Marker).getLatLng();
                onSetOrigin?.({ lat: ll.lat, lng: ll.lng });
              },
            }}
          />
        )}
        {dest && (
          <Marker
            position={[dest.lat, dest.lng]}
            icon={destIcon}
            draggable={!!onSetDest}
            eventHandlers={{
              dragend: (e) => {
                const ll = (e.target as L.Marker).getLatLng();
                onSetDest?.({ lat: ll.lat, lng: ll.lng });
              },
            }}
          />
        )}
      </MapContainer>
    </div>
  );
}
