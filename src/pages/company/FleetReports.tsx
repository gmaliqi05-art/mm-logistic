import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Calendar, Clock, MapPin, Pause, Route as RouteIcon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { useTranslation } from '../../i18n';

interface LocPoint {
  driver_id: string;
  lat: number;
  lng: number;
  speed_kmh: number | null;
  recorded_at: string;
}
interface DriverRow {
  id: string;
  full_name: string;
}
interface AggRow {
  driver_id: string;
  driver_name: string;
  distance_km: number;
  active_min: number;
  stationary_min: number;
  first_at: string | null;
  last_at: string | null;
}

type Preset = 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'custom';

function rangeFor(preset: Preset, customFrom: string, customTo: string): { from: Date; to: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (preset) {
    case 'today':
      return { from: start, to: new Date(start.getTime() + 24 * 3600 * 1000) };
    case 'yesterday': {
      const y = new Date(start.getTime() - 24 * 3600 * 1000);
      return { from: y, to: start };
    }
    case 'week': {
      const d = (start.getDay() + 6) % 7; // Mon=0
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

const STATIONARY_KMH = 3;
const GAP_MIN = 20;

export default function CompanyFleetReports() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [preset, setPreset] = useState<Preset>('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [rows, setRows] = useState<AggRow[]>([]);
  const [loading, setLoading] = useState(false);

  const range = useMemo(() => rangeFor(preset, customFrom, customTo), [preset, customFrom, customTo]);

  useEffect(() => {
    if (!profile?.company_id) return;
    void (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('company_id', profile.company_id)
        .eq('role', 'driver')
        .order('full_name');
      setDrivers((data ?? []) as DriverRow[]);
    })();
  }, [profile?.company_id]);

  useEffect(() => {
    if (!profile?.company_id) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const from = range.from.toISOString();
      const to = range.to.toISOString();
      const { data } = await supabase
        .from('driver_locations')
        .select('driver_id, lat, lng, speed_kmh, recorded_at')
        .eq('company_id', profile.company_id)
        .gte('recorded_at', from)
        .lt('recorded_at', to)
        .order('recorded_at', { ascending: true })
        .limit(50000);
      if (cancelled) return;

      const byDriver = new Map<string, LocPoint[]>();
      for (const p of (data ?? []) as LocPoint[]) {
        const arr = byDriver.get(p.driver_id) ?? [];
        arr.push(p);
        byDriver.set(p.driver_id, arr);
      }

      const driverMap = new Map(drivers.map((d) => [d.id, d.full_name]));
      const result: AggRow[] = [];
      byDriver.forEach((points, driverId) => {
        let dist = 0;
        let activeMs = 0;
        let stationaryMs = 0;
        for (let i = 1; i < points.length; i++) {
          const a = points[i - 1];
          const b = points[i];
          const dt = new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime();
          if (dt <= 0 || dt > GAP_MIN * 60 * 1000) continue;
          const d = haversine(a.lat, a.lng, b.lat, b.lng);
          const speed = b.speed_kmh ?? (d / (dt / 3600000));
          dist += d;
          if (speed < STATIONARY_KMH) stationaryMs += dt;
          else activeMs += dt;
        }
        result.push({
          driver_id: driverId,
          driver_name: driverMap.get(driverId) ?? 'N/A',
          distance_km: Math.round(dist * 10) / 10,
          active_min: Math.round(activeMs / 60000),
          stationary_min: Math.round(stationaryMs / 60000),
          first_at: points[0]?.recorded_at ?? null,
          last_at: points[points.length - 1]?.recorded_at ?? null,
        });
      });

      result.sort((a, b) => b.distance_km - a.distance_km);
      setRows(result);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [profile?.company_id, range.from, range.to, drivers]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.distance_km += r.distance_km;
        acc.active_min += r.active_min;
        acc.stationary_min += r.stationary_min;
        return acc;
      },
      { distance_km: 0, active_min: 0, stationary_min: 0 },
    );
  }, [rows]);

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-teal-600" /> Raportet e Flotes
        </h1>
        <p className="text-sm text-slate-600 mt-1">{t('common.analyzeKmHoursWorkAndImmutableTime')}</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {(['today', 'yesterday', 'week', 'month', 'year', 'custom'] as Preset[]).map((p) => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${preset === p ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              {p === 'today' ? 'Sot' : p === 'yesterday' ? 'Dje' : p === 'week' ? 'Kjo jave' : p === 'month' ? 'Ky muaj' : p === 'year' ? 'Ky vit' : 'I personalizuar'}
            </button>
          ))}
        </div>

        {preset === 'custom' && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-semibold text-slate-600 uppercase">Nga</label>
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-300 text-sm" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 uppercase">Deri</label>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-300 text-sm" />
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Calendar className="w-3.5 h-3.5" />
          <span>{range.from.toLocaleDateString()} → {new Date(range.to.getTime() - 1).toLocaleDateString()}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <SummaryCard icon={RouteIcon} label="Total km" value={`${totals.distance_km.toFixed(1)} km`} />
        <SummaryCard icon={Clock} label="Ore pune" value={`${Math.floor(totals.active_min / 60)}h ${totals.active_min % 60}min`} />
        <SummaryCard icon={Pause} label="Koha e ndalur" value={`${Math.floor(totals.stationary_min / 60)}h ${totals.stationary_min % 60}min`} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-teal-600" />
          <h2 className="text-sm font-semibold text-slate-900">{t('common.perShofer')}</h2>
        </div>
        {loading ? (
          <div className="p-6 text-center text-sm text-slate-500">{t('common.dukeLlogaritur')}</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500">{t('common.nukKaTeDhenaPerKete')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-600">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold">{t('common.shoferi')}</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Distanca</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Aktive</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Ndalur</th>
                  <th className="text-right px-4 py-2.5 font-semibold hidden md:table-cell">Fillimi</th>
                  <th className="text-right px-4 py-2.5 font-semibold hidden md:table-cell">Fundi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.driver_id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-slate-900">{r.driver_name}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-teal-700">{r.distance_km.toFixed(1)} km</td>
                    <td className="px-4 py-2.5 text-right text-slate-700">{Math.floor(r.active_min / 60)}h {r.active_min % 60}m</td>
                    <td className="px-4 py-2.5 text-right text-amber-700">{Math.floor(r.stationary_min / 60)}h {r.stationary_min % 60}m</td>
                    <td className="px-4 py-2.5 text-right text-xs text-slate-500 hidden md:table-cell">{r.first_at ? new Date(r.first_at).toLocaleString() : '—'}</td>
                    <td className="px-4 py-2.5 text-right text-xs text-slate-500 hidden md:table-cell">{r.last_at ? new Date(r.last_at).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase">
        <Icon className="w-3.5 h-3.5 text-teal-600" /> {label}
      </div>
      <div className="text-xl font-bold text-slate-900 mt-1">{value}</div>
    </div>
  );
}
