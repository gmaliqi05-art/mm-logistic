import { useEffect, useMemo, useState } from 'react';
import { Calculator, Check, Crosshair, MapPin, Navigation, Route, Search, Send, Truck, User } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { useTranslation } from '../../i18n';
import { logger } from '../../utils/logger';
import { formatCurrency, formatNumber } from '../../types/accounting';
import RouteMapPicker, { reverseGeocode, type Point } from '../../components/fleet/RouteMapPicker';

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

interface DriverLite {
  id: string;
  full_name: string;
}

interface VehicleLite {
  id: string;
  license_plate: string;
  brand: string;
  model: string;
  vehicle_type: string;
  max_weight_kg: number | null;
  length_mm: number | null;
  width_mm: number | null;
  height_mm: number | null;
  axle_load_kg: number | null;
  adr_class: string | null;
  tunnel_category: string | null;
}

async function geocode(query: string): Promise<Point | null> {
  const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`);
  const arr = (await r.json()) as Array<{ lat: string; lon: string; display_name: string }>;
  if (arr.length === 0) return null;
  return { lat: Number(arr[0].lat), lng: Number(arr[0].lon), label: arr[0].display_name };
}

export default function CompanyRoutePlanner() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [originText, setOriginText] = useState('');
  const [destText, setDestText] = useState('');
  const [origin, setOrigin] = useState<Point | null>(null);
  const [dest, setDest] = useState<Point | null>(null);
  const [pickMode, setPickMode] = useState<'origin' | 'destination' | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ selected: Option; options: Option[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vehicleConsumption, setVehicleConsumption] = useState(32);
  const [fuelPrice, setFuelPrice] = useState(1.65);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [deliveries, setDeliveries] = useState<DeliveryNoteLite[]>([]);
  const [drivers, setDrivers] = useState<DriverLite[]>([]);
  const [vehicles, setVehicles] = useState<VehicleLite[]>([]);
  const [deliveryId, setDeliveryId] = useState<string>('');
  const [driverId, setDriverId] = useState<string>('');
  const [vehicleId, setVehicleId] = useState<string>('');
  const [assigning, setAssigning] = useState(false);
  const [assigned, setAssigned] = useState(false);

  useEffect(() => {
    if (!profile?.company_id) return;
    void (async () => {
      const [d1, d2, d3] = await Promise.all([
        supabase
          .from('delivery_notes')
          .select('id, note_number, delivery_address, pickup_address, assigned_driver_id, status')
          .eq('company_id', profile.company_id)
          .in('status', ['scheduled', 'in_transit', 'assigned'])
          .order('created_at', { ascending: false })
          .limit(25),
        supabase
          .from('profiles')
          .select('id, full_name')
          .eq('company_id', profile.company_id)
          .eq('role', 'driver')
          .order('full_name'),
        supabase
          .from('vehicles')
          .select('id, license_plate, brand, model, vehicle_type, max_weight_kg, length_mm, width_mm, height_mm, axle_load_kg, adr_class, tunnel_category')
          .eq('company_id', profile.company_id)
          .eq('vehicle_type', 'truck')
          .eq('status', 'active')
          .order('license_plate'),
      ]);
      setDeliveries((d1.data ?? []) as DeliveryNoteLite[]);
      setDrivers((d2.data ?? []) as DriverLite[]);
      setVehicles((d3.data ?? []) as VehicleLite[]);
    })();
  }, [profile?.company_id]);

  useEffect(() => {
    if (!deliveryId) return;
    const d = deliveries.find((x) => x.id === deliveryId);
    if (d?.pickup_address) setOriginText(d.pickup_address);
    if (d?.delivery_address) setDestText(d.delivery_address);
    if (d?.assigned_driver_id) setDriverId(d.assigned_driver_id);
    setOrigin(null);
    setDest(null);
    setResult(null);
    setAssigned(false);
  }, [deliveryId, deliveries]);

  const selected = result?.options[selectedIdx] ?? result?.selected;

  async function handleSetOrigin(p: Point) {
    setOrigin(p);
    setPickMode(null);
    const label = await reverseGeocode(p.lat, p.lng);
    setOriginText(label);
  }

  async function handleSetDest(p: Point) {
    setDest(p);
    setPickMode(null);
    const label = await reverseGeocode(p.lat, p.lng);
    setDestText(label);
  }

  async function handlePlan() {
    setError(null);
    setAssigned(false);
    setLoading(true);
    try {
      let o = origin;
      if (!o && originText.trim()) o = await geocode(originText);
      if (!o) throw new Error(t('company.routePlanner.originNotFound') || 'Nuk u gjet adresa e nisjes. Kliko ne harte ose shkruaj adresen.');
      setOrigin(o);
      let d = dest;
      if (!d && destText.trim()) d = await geocode(destText);
      if (!d) throw new Error(t('company.routePlanner.destinationNotFound') || 'Nuk u gjet adresa e destinacionit.');
      setDest(d);

      const v = vehicleId ? vehicles.find((x) => x.id === vehicleId) ?? null : null;
      const { data, error: fnErr } = await supabase.functions.invoke('plan-truck-route', {
        body: {
          origin: o,
          destination: d,
          vehicle_profile: 'driving-hgv',
          avg_consumption_l_100km: vehicleConsumption,
          fuel_price_eur_per_l: fuelPrice,
          prefer: 'cheapest',
          driver_id: driverId || null,
          vehicle_id: vehicleId || null,
          company_id: profile?.company_id ?? null,
          // Pass the physical vehicle restrictions so the routing engine
          // can keep the truck off roads / tunnels it cannot legally use.
          // Nulls are tolerated by plan-truck-route (no constraint).
          vehicle: v ? {
            length_mm: v.length_mm,
            width_mm: v.width_mm,
            height_mm: v.height_mm,
            max_weight_kg: v.max_weight_kg,
            axle_load_kg: v.axle_load_kg,
            adr_class: v.adr_class,
            tunnel_category: v.tunnel_category,
          } : null,
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

  async function assignRoute() {
    if (!result || !selected || !profile?.id) return;
    if (!deliveryId && !driverId) {
      setError(t('company.routePlanner.pickDriverOrTransport') || 'Zgjedh nje shofer ose nje transport para se te caktosh rrugen.');
      return;
    }
    setAssigning(true);
    setError(null);
    try {
      if (deliveryId) {
        const delivery = deliveries.find((d) => d.id === deliveryId);
        const patch: Record<string, unknown> = {
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
        };
        if (driverId && delivery?.assigned_driver_id !== driverId) {
          patch.assigned_driver_id = driverId;
        }
        await supabase.from('delivery_notes').update(patch).eq('id', deliveryId);
      } else if (driverId) {
        await supabase.from('driver_route_plans').insert({
          company_id: profile.company_id,
          driver_id: profile.id,
          target_driver_id: driverId,
          origin_address: origin?.label ?? originText,
          destination_address: dest?.label ?? destText,
          origin_lat: origin?.lat,
          origin_lng: origin?.lng,
          destination_lat: dest?.lat,
          destination_lng: dest?.lng,
          vehicle_profile: 'driving-hgv',
          total_distance_km: selected.distance_km,
          total_duration_min: selected.duration_min,
          toll_cost_eur: selected.toll_eur,
          fuel_cost_eur: selected.fuel_eur,
          total_cost_eur: selected.total_eur,
          country_breakdown: selected.country_breakdown,
          alternatives: result.options.map((o) => ({
            label: o.label,
            distance_km: o.distance_km,
            duration_min: o.duration_min,
            toll_eur: o.toll_eur,
            fuel_eur: o.fuel_eur,
            total_eur: o.total_eur,
          })),
          selected_option: selected.label,
          geojson: { type: 'LineString', coordinates: selected.geometry },
        });
      }

      const targetDriver = driverId || deliveries.find((d) => d.id === deliveryId)?.assigned_driver_id;
      if (targetDriver && profile.company_id) {
        await supabase.from('notifications').insert({
          company_id: profile.company_id,
          user_id: targetDriver,
          type: 'route_assigned',
          title: 'Rruge e re e caktuar',
          message: 'Kompania te ka caktuar nje rruge te re. Hap Navigimin per detajet.',
          data: { kind: 'route_assigned', delivery_note_id: deliveryId || null },
        });
      }

      setAssigned(true);
    } catch (err) {
      logger.warn('assign route failed', { error: err });
      setError(t('company.routePlanner.routeNotSaved') || 'Nuk u ruajt rruga.');
    } finally {
      setAssigning(false);
    }
  }

  const alternatives = useMemo(() => result?.options.map((o) => ({ label: o.label, geometry: o.geometry })) ?? [], [result]);
  const selectedDelivery = deliveries.find((d) => d.id === deliveryId);
  const driverLocked = !!(selectedDelivery?.assigned_driver_id);

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Route className="w-6 h-6 text-teal-600" /> Planifikim Rruge - 3 Alternativa
        </h1>
        <p className="text-sm text-slate-600 mt-1">Zgjedh shoferin, vendos pikat ne harte dhe dergoji rrugen shoferit.</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-600 uppercase flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" />{t('common.shoferi')}</label>
            <select
              value={driverId}
              onChange={(e) => setDriverId(e.target.value)}
              disabled={driverLocked}
              className="w-full mt-1 px-3 py-2.5 rounded-lg border border-slate-300 text-sm disabled:bg-slate-100"
            >
              <option value="">-- Zgjedh shoferin --</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>{d.full_name}</option>
              ))}
            </select>
            {driverLocked && (
              <p className="text-[11px] text-slate-500 mt-1">{t('common.shoferiEshteMarreNgaTransportiI')}</p>
            )}
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 uppercase">Transporti (opsionale)</label>
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
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-600 uppercase">Nisja</label>
            <div className="relative mt-1 flex gap-2">
              <div className="relative flex-1">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-600" />
                <input
                  value={originText}
                  onChange={(e) => { setOriginText(e.target.value); setOrigin(null); }}
                  placeholder={t('common.adresaENisjes')}
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-teal-500 outline-none text-sm"
                />
              </div>
              <button
                type="button"
                onClick={() => setPickMode(pickMode === 'origin' ? null : 'origin')}
                className={`px-3 rounded-lg border text-xs font-semibold flex items-center gap-1 ${pickMode === 'origin' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}
                title="Zgjedh ne harte"
              >
                <Crosshair className="w-3.5 h-3.5" /> Harte
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 uppercase">Destinacioni</label>
            <div className="relative mt-1 flex gap-2">
              <div className="relative flex-1">
                <Navigation className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-600" />
                <input
                  value={destText}
                  onChange={(e) => { setDestText(e.target.value); setDest(null); }}
                  placeholder={t('common.adresaEDestinacionit')}
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-teal-500 outline-none text-sm"
                />
              </div>
              <button
                type="button"
                onClick={() => setPickMode(pickMode === 'destination' ? null : 'destination')}
                className={`px-3 rounded-lg border text-xs font-semibold flex items-center gap-1 ${pickMode === 'destination' ? 'bg-red-600 text-white border-red-600' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}
              >
                <Crosshair className="w-3.5 h-3.5" /> Harte
              </button>
            </div>
          </div>
        </div>

        {vehicles.length > 0 && (
          <div>
            <label className="text-xs font-semibold text-slate-600 uppercase flex items-center gap-1.5">
              <Truck className="w-3 h-3" /> Mjeti (per dimensione / ADR)
            </label>
            <select
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
            >
              <option value="">— pa kufizime mjeti —</option>
              {vehicles.map((v) => {
                const missing = (!v.length_mm && !v.width_mm && !v.height_mm && !v.max_weight_kg) ? ' (pa dimensione)' : '';
                return (
                  <option key={v.id} value={v.id}>
                    {v.license_plate} — {v.brand} {v.model}{missing}
                  </option>
                );
              })}
            </select>
            {vehicleId && (() => {
              const v = vehicles.find((x) => x.id === vehicleId);
              if (!v) return null;
              const parts: string[] = [];
              if (v.length_mm) parts.push(`${formatNumber(v.length_mm / 1000)} m gjat.`);
              if (v.width_mm) parts.push(`${formatNumber(v.width_mm / 1000)} m gjer.`);
              if (v.height_mm) parts.push(`${formatNumber(v.height_mm / 1000)} m lart.`);
              if (v.max_weight_kg) parts.push(`${(v.max_weight_kg / 1000).toFixed(1)} t`);
              if (v.axle_load_kg) parts.push(`${(v.axle_load_kg / 1000).toFixed(1)} t/akse`);
              if (v.adr_class && v.adr_class !== 'none') parts.push(`ADR ${v.adr_class}`);
              if (v.tunnel_category) parts.push(`tunel ${v.tunnel_category}`);
              if (parts.length === 0) return (
                <p className="mt-1 text-[11px] text-amber-700">
                  Ky mjet nuk ka dimensione te plotesuara — kalkulimi do te perdore profilin gjenerik HGV.
                </p>
              );
              return (
                <p className="mt-1 text-[11px] text-slate-600">
                  {parts.join(' • ')}
                </p>
              );
            })()}
          </div>
        )}

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
          disabled={loading || (!originText.trim() && !origin) || (!destText.trim() && !dest)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold disabled:opacity-50"
        >
          {loading ? <Search className="w-4 h-4 animate-pulse" /> : <Calculator className="w-4 h-4" />}
          {loading ? 'Duke kalkuluar 3 alternativat...' : 'Kalkulo 3 Alternativat'}
        </button>

        {error && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</div>
        )}
      </div>

      <RouteMapPicker
        origin={origin}
        dest={dest}
        mode={pickMode}
        onSetOrigin={handleSetOrigin}
        onSetDest={handleSetDest}
        alternatives={alternatives}
        selectedIdx={selectedIdx}
        height={440}
      />

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
                      <span className="w-3 h-3 rounded-full" style={{ background: ['#0f766e', '#d97706', '#6b7280'][idx % 3] }} />
                      <span className="text-sm font-semibold text-slate-900">
                        {idx === 0 ? 'Me kosto me te ulet' : idx === 1 ? 'Alternativa 2' : 'Alternativa 3'}
                      </span>
                    </div>
                    {isSelected && <Check className="w-5 h-5 text-teal-600" />}
                  </div>
                  <div className="mt-3 space-y-1.5 text-sm">
                    <div className="flex justify-between"><span className="text-slate-500">Distanca</span><span className="font-semibold">{opt.distance_km} km</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Koha</span><span className="font-semibold">{hours}h {mins}min</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Taksa</span><span className="font-semibold">{formatCurrency(opt.toll_eur, "EUR")}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Karburant</span><span className="font-semibold">{formatCurrency(opt.fuel_eur, "EUR")}</span></div>
                    <div className="flex justify-between pt-1.5 border-t border-slate-200">
                      <span className="text-slate-700 font-semibold">{t('common.total2')}</span>
                      <span className="font-bold text-teal-700">{formatCurrency(opt.total_eur, "EUR")}</span>
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
                      <span className="font-semibold text-slate-900">{formatCurrency(c.toll_eur, "EUR")}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(driverId || deliveryId) && selected && (
            <button
              onClick={assignRoute}
              disabled={assigning || assigned}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-white disabled:opacity-70 ${assigned ? 'bg-emerald-600' : 'bg-slate-900 hover:bg-slate-800'}`}
            >
              {assigned ? <><Check className="w-4 h-4" /> Rruga u dergua te shoferi</> : <><Send className="w-4 h-4" /> {assigning ? 'Duke dërguar...' : 'Cakto kete rruge per shoferin'}</>}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
