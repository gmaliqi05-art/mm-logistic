import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { requireEnv } from "../_shared/env.ts";
import { isServiceRoleCall, forbidden } from "../_shared/requireCaller.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

let _url: string, _key: string;
function getEnv() {
  if (!_url) { _url = requireEnv("SUPABASE_URL"); _key = requireEnv("SUPABASE_SERVICE_ROLE_KEY"); }
  return { url: _url, key: _key };
}

interface Delivery {
  id: string;
  company_id: string;
  assigned_driver_id: string;
  note_number: string;
  status: string;
  delivery_address: string | null;
  current_lat: number | null;
  current_lng: number | null;
  delivery_lat: number | null;
  delivery_lng: number | null;
}

interface CompanyConfig {
  id: string;
  traffic_provider: string;
  traffic_api_key: string | null;
}

const companyCache = new Map<string, CompanyConfig | null>();

async function getCompany(companyId: string): Promise<CompanyConfig | null> {
  if (companyCache.has(companyId)) return companyCache.get(companyId) ?? null;
  const rows = await pg<CompanyConfig[]>(`companies?id=eq.${companyId}&select=id,traffic_provider,traffic_api_key`);
  const c = rows[0] ?? null;
  companyCache.set(companyId, c);
  return c;
}

async function pg<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const { url, key } = getEnv();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`REST ${res.status}: ${await res.text()}`);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// KE2 / L13 hardening: numbers from a JSON body or stale DB rows
// can deserialise as strings or NaN. Every URL builder below must
// validate finiteness first, otherwise a future RLS regression
// letting a delivery_notes row carry `46;@evil.example.com` in a
// lat/lng field would shape the upstream URL.
function isFiniteCoord(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

async function geocodeOSM(q: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
    const r = await fetch(url, { headers: { "User-Agent": "MM-Logistic/1.0" } });
    const arr = await r.json();
    if (Array.isArray(arr) && arr.length > 0) {
      const lat = parseFloat(arr[0].lat);
      const lng = parseFloat(arr[0].lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { lat, lng };
    }
  } catch (_) { /* ignore */ }
  return null;
}

async function osrmRoute(oLat: number, oLng: number, dLat: number, dLng: number): Promise<{ duration: number; distance: number; geometry: unknown } | null> {
  if (![oLat, oLng, dLat, dLng].every(isFiniteCoord)) return null;
  try {
    // URL constructor + numeric formatting kills any injection
    // through lat/lng. OSRM expects `{lng},{lat};{lng},{lat}` path
    // segments — clean fixed decimals so a NaN cannot reach the wire.
    const o = `${oLng.toFixed(7)},${oLat.toFixed(7)}`;
    const d = `${dLng.toFixed(7)},${dLat.toFixed(7)}`;
    const u = new URL(`https://router.project-osrm.org/route/v1/driving/${o};${d}`);
    u.searchParams.set('overview', 'simplified');
    u.searchParams.set('geometries', 'geojson');
    const r = await fetch(u.toString());
    const j = await r.json();
    if (j?.routes?.[0]) {
      return { duration: j.routes[0].duration, distance: j.routes[0].distance, geometry: j.routes[0].geometry };
    }
  } catch (_) { /* ignore */ }
  return null;
}

async function tomtomTraffic(oLat: number, oLng: number, dLat: number, dLng: number, apiKey: string): Promise<{ delaySec: number; totalSec: number } | null> {
  if (!apiKey) return null;
  if (![oLat, oLng, dLat, dLng].every(isFiniteCoord)) return null;
  try {
    // TomTom path is `{lat},{lng}:{lat},{lng}`. Same coordinate
    // hygiene as OSRM. The API key MUST sit in the query string
    // (TomTom has no header auth), so we keep it there but never
    // log the URL — fetch() doesn't log and the catch only swallows.
    const path = `${oLat.toFixed(7)},${oLng.toFixed(7)}:${dLat.toFixed(7)},${dLng.toFixed(7)}`;
    const u = new URL(`https://api.tomtom.com/routing/1/calculateRoute/${path}/json`);
    u.searchParams.set('traffic', 'true');
    u.searchParams.set('travelMode', 'truck');
    u.searchParams.set('key', apiKey);
    const r = await fetch(u.toString());
    const j = await r.json();
    const s = j?.routes?.[0]?.summary;
    if (s) {
      return { delaySec: s.trafficDelayInSeconds ?? 0, totalSec: s.travelTimeInSeconds ?? 0 };
    }
  } catch (_) { /* ignore */ }
  return null;
}

function severityFor(delayMin: number): "low" | "moderate" | "high" {
  if (delayMin >= 30) return "high";
  if (delayMin >= 15) return "moderate";
  return "low";
}

async function checkOne(delivery: Delivery): Promise<{ checked: boolean; alerted: boolean }> {
  const company = await getCompany(delivery.company_id);
  if (!company || company.traffic_provider !== 'tomtom' || !company.traffic_api_key) {
    return { checked: false, alerted: false };
  }

  const oLat = delivery.current_lat;
  const oLng = delivery.current_lng;
  if (oLat == null || oLng == null) return { checked: false, alerted: false };

  let dLat = delivery.delivery_lat ?? null;
  let dLng = delivery.delivery_lng ?? null;
  if ((dLat == null || dLng == null) && delivery.delivery_address) {
    const g = await geocodeOSM(delivery.delivery_address);
    if (g) { dLat = g.lat; dLng = g.lng; }
  }
  if (dLat == null || dLng == null) return { checked: false, alerted: false };

  const [baseline, traffic] = await Promise.all([
    osrmRoute(oLat, oLng, dLat, dLng),
    tomtomTraffic(oLat, oLng, dLat, dLng, company.traffic_api_key),
  ]);

  if (!traffic) return { checked: true, alerted: false };
  const delayMin = Math.round(traffic.delaySec / 60);

  if (delayMin < 10) return { checked: true, alerted: false };

  const existing = await pg<Array<{ id: string }>>(
    `route_traffic_alerts?delivery_note_id=eq.${delivery.id}&resolved_at=is.null&select=id&limit=1`,
  );
  if (existing.length > 0) return { checked: true, alerted: false };

  const severity = severityFor(delayMin);
  const message = `Trafik i rende ne rrugen drejt ${delivery.delivery_address ?? "destinacionit"}. Vonese e pritshme rreth ${delayMin} min.`;

  const [alert] = await pg<Array<{ id: string }>>(`route_traffic_alerts`, {
    method: "POST",
    body: JSON.stringify({
      company_id: delivery.company_id,
      driver_id: delivery.assigned_driver_id,
      delivery_note_id: delivery.id,
      severity,
      delay_minutes: delayMin,
      distance_km: baseline ? Math.round(baseline.distance / 100) / 10 : 0,
      message,
      incident_type: "congestion",
      polyline_segment: baseline?.geometry ?? null,
      origin_lat: oLat,
      origin_lng: oLng,
      dest_lat: dLat,
      dest_lng: dLng,
      notified_company_at: new Date().toISOString(),
      notified_driver_at: new Date().toISOString(),
    }),
  });

  const companyAdmins = await pg<Array<{ id: string }>>(
    `profiles?company_id=eq.${delivery.company_id}&role=in.("company_admin","logistics","dispatcher")&select=id`,
  );
  const recipientIds = Array.from(new Set([delivery.assigned_driver_id, ...companyAdmins.map((p) => p.id)]));

  const { url: envUrl, key: envKey } = getEnv();
  await fetch(`${envUrl}/functions/v1/dispatch-notification`, {
    method: "POST",
    headers: {
      apikey: envKey,
      Authorization: `Bearer ${envKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      channelCode: "traffic_alert",
      title: `Trafik ne rrugen e dergeses ${delivery.note_number}`,
      body: message,
      data: {
        type: "traffic_alert",
        alert_id: alert?.id ?? "",
        delivery_note_id: delivery.id,
        severity,
        delay_minutes: String(delayMin),
      },
      recipientIds,
      targetPlatforms: ["web", "android", "ios"],
      url: `/company/drivers/${delivery.assigned_driver_id}/reports`,
    }),
  }).catch(() => { /* best effort */ });

  return { checked: true, alerted: true };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  // Cron-only (pg_cron via http_post with service-role bearer).
  if (!isServiceRoleCall(req)) return forbidden(corsHeaders, "Service-role required");
  try {
    const payload = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const deliveryId = payload?.delivery_note_id as string | undefined;

    let deliveries: Delivery[] = [];
    if (deliveryId) {
      deliveries = await pg<Delivery[]>(
        `delivery_notes?id=eq.${deliveryId}&select=id,company_id,assigned_driver_id,note_number,status,delivery_address,current_lat,current_lng,delivery_lat,delivery_lng`,
      );
    } else {
      deliveries = await pg<Delivery[]>(
        `delivery_notes?status=eq.in_transit&assigned_driver_id=not.is.null&current_lat=not.is.null&delivery_address=not.is.null&select=id,company_id,assigned_driver_id,note_number,status,delivery_address,current_lat,current_lng,delivery_lat,delivery_lng&limit=50`,
      );
    }

    let checked = 0;
    let alerted = 0;
    for (const d of deliveries) {
      try {
        const r = await checkOne(d);
        if (r.checked) checked += 1;
        if (r.alerted) alerted += 1;
      } catch (e) {
        console.error("check failed", d.id, e);
      }
    }

    return new Response(JSON.stringify({ checked, alerted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
