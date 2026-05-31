import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BarChart3,
  Calendar,
  Clock,
  Gauge,
  MapPin,
  Pause,
  Route as RouteIcon,
  Truck,
  Loader2,
  Package,
  TrendingUp,
} from 'lucide-react';
import { useTranslation } from '../../i18n';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface DriverProfile {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  is_active: boolean;
  avatar_url: string | null;
}

interface LocPoint {
  lat: number;
  lng: number;
  speed_kmh: number | null;
  recorded_at: string;
}

interface DeliveryItem {
  id: string;
  note_number: string;
  status: string;
  delivery_address: string | null;
  created_at: string;
  delivered_at: string | null;
}

type Preset = 'today' | 'week' | 'month' | 'year' | 'custom';

const STATIONARY_KMH = 3;
const GAP_MIN = 20;

function rangeFor(preset: Preset, customFrom: string, customTo: string): { from: Date; to: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (preset) {
    case 'today':
      return { from: start, to: new Date(start.getTime() + 24 * 3600 * 1000) };
    case 'week': {
      const d = (start.getDay() + 6) % 7;
      const from = new Date(start.getTime() - d * 24 * 3600 * 1000);
      return { from, to: new Date(from.getTime() + 7 * 24 * 3600 * 1000) };
    }
    case 'month':
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date(now.getFullYear(), now.getMonth() + 1, 1) };
    case 'year':
      return { from: new Date(now.getFullYear(), 0, 1), to: new Date(now.getFullYear() + 1, 0, 1) };
    case 'custom':
      return {
        from: customFrom ? new Date(customFrom) : start,
        to: customTo ? new Date(new Date(customTo).getTime() + 24 * 3600 * 1000) : new Date(start.getTime() + 24 * 3600 * 1000),
      };
  }
}

function haversine(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function deriveInitials(name: string | null | undefined): string {
  if (!name) return 'D';
  const parts = name.trim().split(/[\s-]+/).filter(Boolean);
  if (parts.length === 0) return 'D';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
}

export default function DriverReports() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const [driver, setDriver] = useState<DriverProfile | null>(null);
  const [preset, setPreset] = useState<Preset>('week');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [points, setPoints] = useState<LocPoint[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const range = useMemo(() => rangeFor(preset, customFrom, customTo), [preset, customFrom, customTo]);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, email, phone, is_active, avatar_url')
        .eq('id', id)
        .maybeSingle();
      if (data) setDriver(data as DriverProfile);
    })();
  }, [id]);

  useEffect(() => {
    if (!id || !profile?.company_id) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const from = range.from.toISOString();
      const to = range.to.toISOString();
      const [locRes, delRes] = await Promise.all([
        supabase
          .from('driver_locations')
          .select('lat, lng, speed_kmh, recorded_at')
          .eq('company_id', profile.company_id)
          .eq('driver_id', id)
          .gte('recorded_at', from)
          .lt('recorded_at', to)
          .order('recorded_at', { ascending: true })
          .limit(5000),
        supabase
          .from('delivery_notes')
          .select('id, note_number, status, delivery_address, created_at, delivered_at')
          .eq('company_id', profile.company_id)
          .eq('assigned_driver_id', id)
          .gte('created_at', from)
          .lt('created_at', to)
          .order('created_at', { ascending: false })
          .limit(200),
      ]);
      if (cancelled) return;
      setPoints((locRes.data ?? []) as LocPoint[]);
      setDeliveries((delRes.data ?? []) as DeliveryItem[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, profile?.company_id, range.from, range.to]);

  const stats = useMemo(() => {
    let dist = 0;
    let activeMs = 0;
    let stationaryMs = 0;
    let maxSpeed = 0;
    let speedSum = 0;
    let speedSamples = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const dt = new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime();
      if (dt <= 0 || dt > GAP_MIN * 60 * 1000) continue;
      const d = haversine(a.lat, a.lng, b.lat, b.lng);
      const speed = b.speed_kmh ?? d / (dt / 3600000);
      dist += d;
      if (speed < STATIONARY_KMH) stationaryMs += dt;
      else {
        activeMs += dt;
        speedSum += speed;
        speedSamples += 1;
        if (speed > maxSpeed) maxSpeed = speed;
      }
    }
    return {
      distance_km: Math.round(dist * 10) / 10,
      active_min: Math.round(activeMs / 60000),
      stationary_min: Math.round(stationaryMs / 60000),
      max_speed: Math.round(maxSpeed),
      avg_speed: speedSamples ? Math.round(speedSum / speedSamples) : 0,
    };
  }, [points]);

  const daily = useMemo(() => {
    const m = new Map<string, number>();
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const dt = new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime();
      if (dt <= 0 || dt > GAP_MIN * 60 * 1000) continue;
      const day = b.recorded_at.slice(0, 10);
      m.set(day, (m.get(day) ?? 0) + haversine(a.lat, a.lng, b.lat, b.lng));
    }
    return Array.from(m.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, km]) => ({ day, km: Math.round(km * 10) / 10 }));
  }, [points]);

  const maxDailyKm = Math.max(1, ...daily.map((d) => d.km));

  const delStats = useMemo(() => {
    let done = 0;
    let cancelled = 0;
    let inProgress = 0;
    for (const d of deliveries) {
      if (d.status === 'completed' || d.status === 'delivered' || d.status === 'confirmed') done += 1;
      else if (d.status === 'cancelled') cancelled += 1;
      else inProgress += 1;
    }
    return { total: deliveries.length, done, cancelled, inProgress };
  }, [deliveries]);

  if (!driver) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      <Link to={`/company/drivers/${id}`} className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-teal-600">
        <ArrowLeft className="w-4 h-4" />{t('common.kthehuTeShoferi')}</Link>

      <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-teal-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0 overflow-hidden">
          {driver.avatar_url ? (
            <img src={driver.avatar_url} alt="" className="w-full h-full object-cover" />
          ) : (
            deriveInitials(driver.full_name)
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-teal-600" /> Raportet e {driver.full_name}
          </h1>
          <p className="text-sm text-slate-500 truncate">
            {driver.email}
            {driver.phone ? ` • ${driver.phone}` : ''}
          </p>
        </div>
        <span
          className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
            driver.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
          }`}
        >
          {driver.is_active ? 'Aktiv' : 'Jo aktiv'}
        </span>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {(['today', 'week', 'month', 'year', 'custom'] as Preset[]).map((p) => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                preset === p ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {p === 'today' ? 'Sot' : p === 'week' ? 'Kjo jave' : p === 'month' ? 'Ky muaj' : p === 'year' ? 'Ky vit' : 'I personalizuar'}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-semibold text-slate-600 uppercase">Nga</label>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 uppercase">Deri</label>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>
          </div>
        )}
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Calendar className="w-3.5 h-3.5" />
          <span>
            {range.from.toLocaleDateString()} to {new Date(range.to.getTime() - 1).toLocaleDateString()}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard icon={RouteIcon} label="Distanca" value={`${stats.distance_km.toFixed(1)} km`} tone="teal" />
        <KpiCard
          icon={Clock}
          label="Ore vozitje"
          value={`${Math.floor(stats.active_min / 60)}h ${stats.active_min % 60}m`}
          tone="emerald"
        />
        <KpiCard
          icon={Pause}
          label="Koha e ndalur"
          value={`${Math.floor(stats.stationary_min / 60)}h ${stats.stationary_min % 60}m`}
          tone="amber"
        />
        <KpiCard icon={Gauge} label="Shpejtesi max" value={`${stats.max_speed} km/h`} tone="rose" />
        <KpiCard icon={TrendingUp} label="Shpejtesi mesatare" value={`${stats.avg_speed} km/h`} tone="slate" />
      </div>

      <div className="grid md:grid-cols-4 gap-3">
        <KpiCard icon={Package} label="Dergesa gjithsej" value={`${delStats.total}`} tone="slate" />
        <KpiCard icon={Package} label="Te perfunduara" value={`${delStats.done}`} tone="emerald" />
        <KpiCard icon={Package} label="Ne vazhdim" value={`${delStats.inProgress}`} tone="teal" />
        <KpiCard icon={Package} label="Anuluara" value={`${delStats.cancelled}`} tone="rose" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-teal-600" />
          <h2 className="text-sm font-semibold text-slate-900">{t('common.kmPerDay')}</h2>
        </div>
        {loading ? (
          <div className="py-8 text-center text-sm text-slate-500">{t('common.dukeLlogaritur')}</div>
        ) : daily.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">{t('common.nukKaTeDhenaPerKete')}</div>
        ) : (
          <div className="space-y-1.5">
            {daily.map((d) => (
              <div key={d.day} className="flex items-center gap-3">
                <div className="w-24 text-xs text-slate-500 font-mono flex-shrink-0">{d.day}</div>
                <div className="flex-1 h-6 bg-slate-100 rounded overflow-hidden">
                  <div
                    className="h-full bg-teal-600 flex items-center justify-end pr-2 text-[10px] font-semibold text-white"
                    style={{ width: `${Math.max(3, (d.km / maxDailyKm) * 100)}%` }}
                  >
                    {d.km} km
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
          <Truck className="w-4 h-4 text-teal-600" />
          <h2 className="text-sm font-semibold text-slate-900">{t('common.deliveriesInThisPeriod')}</h2>
        </div>
        {deliveries.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500">{t('common.noDeliveries')}</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {deliveries.map((d) => (
              <div key={d.id} className="px-4 py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">#{d.note_number}</span>
                    <StatusPill status={d.status} />
                  </div>
                  {d.delivery_address && (
                    <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                      <MapPin className="w-3 h-3" /> {d.delivery_address}
                    </div>
                  )}
                </div>
                <div className="text-xs text-slate-400 text-right flex-shrink-0">
                  {new Date(d.created_at).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone: 'teal' | 'emerald' | 'amber' | 'rose' | 'slate';
}) {
  const toneMap = {
    teal: 'text-teal-600 bg-teal-50',
    emerald: 'text-emerald-600 bg-emerald-50',
    amber: 'text-amber-600 bg-amber-50',
    rose: 'text-rose-600 bg-rose-50',
    slate: 'text-slate-600 bg-slate-100',
  };
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase ${toneMap[tone]}`}>
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className="text-lg font-bold text-slate-900 mt-2">{value}</div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    draft: { cls: 'bg-slate-100 text-slate-700', label: 'Draft' },
    sent: { cls: 'bg-blue-100 text-blue-700', label: 'E derguar' },
    in_transit: { cls: 'bg-teal-100 text-teal-700', label: 'Ne rruge' },
    delivered: { cls: 'bg-emerald-100 text-emerald-700', label: 'Dorezuar' },
    confirmed: { cls: 'bg-emerald-100 text-emerald-700', label: 'Konfirmuar' },
    completed: { cls: 'bg-emerald-100 text-emerald-700', label: 'Perfunduar' },
    cancelled: { cls: 'bg-red-100 text-red-700', label: 'Anuluar' },
    pending_company_review: { cls: 'bg-amber-100 text-amber-700', label: 'Per shqyrtim' },
    pending_stock_confirmation: { cls: 'bg-amber-100 text-amber-700', label: 'Konfirmim stoku' },
  };
  const meta = map[status] ?? { cls: 'bg-slate-100 text-slate-700', label: status };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${meta.cls}`}>
      {meta.label}
    </span>
  );
}
