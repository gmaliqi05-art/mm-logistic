import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface Point { lat: number; lng: number; label?: string }
interface Body {
  origin: Point;
  destination: Point;
  vehicle_profile?: 'driving-hgv' | 'driving-car';
  avg_consumption_l_100km?: number;
  fuel_price_eur_per_l?: number;
  prefer?: 'fastest' | 'cheapest' | 'shortest';
  delivery_note_id?: string | null;
  driver_id?: string | null;
  company_id?: string | null;
}

interface CountryRate {
  country_code: string;
  country_name: string;
  per_km_eur: number;
  fixed_vignette_eur: number;
}

interface CountrySegment {
  country_code: string;
  country_name: string;
  km: number;
  toll_eur: number;
}

interface RouteResult {
  label: string;
  distance_km: number;
  duration_min: number;
  toll_eur: number;
  fuel_eur: number;
  total_eur: number;
  country_breakdown: CountrySegment[];
  geometry: [number, number][];
}

async function geocode(address: string): Promise<Point | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
    const r = await fetch(url, { headers: { 'User-Agent': 'mm-logistic/1.0' } });
    const arr = (await r.json()) as Array<{ lat: string; lon: string; display_name: string }>;
    if (arr.length === 0) return null;
    return { lat: Number(arr[0].lat), lng: Number(arr[0].lon), label: arr[0].display_name };
  } catch {
    return null;
  }
}

async function reverseCountry(lat: number, lng: number): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=3`;
    const r = await fetch(url, { headers: { 'User-Agent': 'mm-logistic/1.0' } });
    const j = (await r.json()) as { address?: { country_code?: string } };
    const code = j.address?.country_code;
    return code ? code.toUpperCase() : null;
  } catch {
    return null;
  }
}

async function osrmRoute(origin: Point, destination: Point, avoidTolls: boolean) {
  const base = 'https://router.project-osrm.org';
  const profile = 'driving';
  const coords = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  const qs = new URLSearchParams({
    overview: 'full',
    geometries: 'geojson',
    alternatives: avoidTolls ? 'true' : 'false',
    annotations: 'false',
  });
  const url = `${base}/route/v1/${profile}/${coords}?${qs.toString()}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`OSRM ${r.status}`);
  const j = await r.json() as {
    routes: Array<{
      distance: number;
      duration: number;
      geometry: { coordinates: [number, number][] };
    }>;
  };
  return j.routes ?? [];
}

async function buildCountryBreakdown(
  geometry: [number, number][],
  rates: Record<string, CountryRate>,
): Promise<CountrySegment[]> {
  if (geometry.length === 0) return [];
  const samples: { country: string | null; lat: number; lng: number }[] = [];
  const step = Math.max(1, Math.floor(geometry.length / 25));
  for (let i = 0; i < geometry.length; i += step) {
    const [lng, lat] = geometry[i];
    const country = await reverseCountry(lat, lng);
    samples.push({ country, lat, lng });
  }
  const last = geometry[geometry.length - 1];
  samples.push({ country: await reverseCountry(last[1], last[0]), lat: last[1], lng: last[0] });

  const segments: { country: string; km: number }[] = [];
  let totalKm = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    const d = haversine(a.lat, a.lng, b.lat, b.lng);
    totalKm += d;
    const cc = (b.country ?? a.country ?? 'DE').toUpperCase();
    const last = segments[segments.length - 1];
    if (last && last.country === cc) last.km += d;
    else segments.push({ country: cc, km: d });
  }
  return segments.map((s) => {
    const rate = rates[s.country];
    const toll = rate ? s.km * rate.per_km_eur + rate.fixed_vignette_eur : 0;
    return {
      country_code: s.country,
      country_name: rate?.country_name ?? s.country,
      km: Math.round(s.km * 10) / 10,
      toll_eur: Math.round(toll * 100) / 100,
    };
  });
}

function haversine(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as Body;
    if (!body.origin || !body.destination) {
      return new Response(JSON.stringify({ error: 'origin and destination required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { data: rateRows } = await admin
      .from('country_toll_rates')
      .select('country_code, country_name, per_km_eur, fixed_vignette_eur')
      .eq('vehicle_class', 'hgv_40t');
    const rates: Record<string, CountryRate> = {};
    for (const r of (rateRows ?? []) as CountryRate[]) {
      rates[r.country_code] = r;
    }

    const consumption = body.avg_consumption_l_100km ?? 32;
    const fuelPrice = body.fuel_price_eur_per_l ?? 1.65;

    const routes = await osrmRoute(body.origin, body.destination, false);
    if (routes.length === 0) {
      return new Response(JSON.stringify({ error: 'No route found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const options: RouteResult[] = [];
    let idx = 0;
    for (const r of routes) {
      const km = r.distance / 1000;
      const min = r.duration / 60;
      const geom = r.geometry.coordinates;
      const breakdown = await buildCountryBreakdown(geom, rates);
      const toll = breakdown.reduce((s, b) => s + b.toll_eur, 0);
      const fuel = (km * consumption * fuelPrice) / 100;
      options.push({
        label: idx === 0 ? 'fastest' : `alt-${idx}`,
        distance_km: Math.round(km * 10) / 10,
        duration_min: Math.round(min),
        toll_eur: Math.round(toll * 100) / 100,
        fuel_eur: Math.round(fuel * 100) / 100,
        total_eur: Math.round((toll + fuel) * 100) / 100,
        country_breakdown: breakdown,
        geometry: geom,
      });
      idx++;
    }

    const cheapest = [...options].sort((a, b) => a.total_eur - b.total_eur)[0];
    cheapest.label = 'cheapest';

    const selected = body.prefer === 'fastest' ? options[0] : cheapest;

    if (body.company_id && body.driver_id) {
      await admin.from('driver_route_plans').insert({
        company_id: body.company_id,
        driver_id: body.driver_id,
        delivery_note_id: body.delivery_note_id ?? null,
        origin_address: body.origin.label ?? '',
        destination_address: body.destination.label ?? '',
        origin_lat: body.origin.lat,
        origin_lng: body.origin.lng,
        destination_lat: body.destination.lat,
        destination_lng: body.destination.lng,
        vehicle_profile: body.vehicle_profile ?? 'driving-hgv',
        total_distance_km: selected.distance_km,
        total_duration_min: selected.duration_min,
        toll_cost_eur: selected.toll_eur,
        fuel_cost_eur: selected.fuel_eur,
        total_cost_eur: selected.total_eur,
        country_breakdown: selected.country_breakdown,
        alternatives: options.map((o) => ({
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

    return new Response(
      JSON.stringify({ selected, options }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'plan failed';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

export { geocode };
