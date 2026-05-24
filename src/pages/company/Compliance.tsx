import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Download, Loader2, Filter, Truck, User, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import ExpiryBadge from '../../components/fleet/ExpiryBadge';
import { daysUntil, expiryLevel, type ExpiryLevel } from '../../lib/fleetCompliance';
import { useFleetComplianceTypes } from '../../hooks/useFleetComplianceTypes';
import { useTranslation } from '../../i18n';

interface Row {
  entity: 'vehicle' | 'driver';
  entityId: string;
  entityLabel: string;
  entitySub: string;
  type: string;
  expiryDate: string;
  extra?: string;
  linkTo: string;
}

export default function Compliance() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const vehicleTypes = useFleetComplianceTypes('vehicle');
  const driverTypes = useFleetComplianceTypes('driver');
  const labelForType = (key: string): string =>
    vehicleTypes.byKey[key]?.label ?? driverTypes.byKey[key]?.label ?? key;
  const STATUS_FILTER: { value: ExpiryLevel | 'all'; label: string }[] = [
    { value: 'all', label: t('fleet.filter.all') },
    { value: 'expired', label: t('fleet.filter.expired') },
    { value: 'critical', label: t('fleet.filter.critical') },
    { value: 'warning', label: t('fleet.filter.warning') },
    { value: 'soon', label: t('fleet.filter.soon') },
    { value: 'ok', label: t('fleet.filter.ok') },
  ];
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterEntity, setFilterEntity] = useState<'all' | 'vehicle' | 'driver'>('all');
  const [filterStatus, setFilterStatus] = useState<ExpiryLevel | 'all'>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [checking, setChecking] = useState(false);
  const [checkMessage, setCheckMessage] = useState<string | null>(null);

  useEffect(() => { if (profile?.company_id) fetchAll(); }, [profile?.company_id]);

  async function fetchAll() {
    setLoading(true);
    const cid = profile!.company_id!;
    const [vehicles, inspections, insurance, taxes, driversRes, licenses, quals, medicals] = await Promise.all([
      supabase.from('vehicles').select('id, license_plate, brand, model').eq('company_id', cid),
      supabase.from('vehicle_inspections').select('vehicle_id, inspection_type, expiry_date').eq('company_id', cid),
      supabase.from('vehicle_insurance').select('vehicle_id, insurance_type, end_date, provider').eq('company_id', cid),
      supabase.from('vehicle_taxes').select('vehicle_id, tax_year, due_date, paid_at').eq('company_id', cid).is('paid_at', null),
      supabase.from('profiles').select('id, full_name, email').eq('company_id', cid).eq('role', 'driver'),
      supabase.from('driver_licenses').select('driver_id, expiry_date, license_number').eq('company_id', cid),
      supabase.from('driver_qualifications').select('driver_id, qualification_type, expiry_date').eq('company_id', cid),
      supabase.from('driver_medical').select('driver_id, exam_type, expiry_date').eq('company_id', cid),
    ]);

    const vMap = new Map<string, { plate: string; label: string }>();
    (vehicles.data || []).forEach((v: { id: string; license_plate: string; brand: string; model: string }) => {
      vMap.set(v.id, { plate: v.license_plate, label: `${v.brand} ${v.model}`.trim() });
    });
    const dMap = new Map<string, { name: string; email: string }>();
    (driversRes.data || []).forEach((d: { id: string; full_name: string; email: string }) => {
      dMap.set(d.id, { name: d.full_name, email: d.email });
    });

    const out: Row[] = [];

    (inspections.data || []).forEach((r: { vehicle_id: string; inspection_type: string; expiry_date: string }) => {
      const v = vMap.get(r.vehicle_id); if (!v) return;
      out.push({
        entity: 'vehicle', entityId: r.vehicle_id,
        entityLabel: v.plate || v.label, entitySub: v.label,
        type: r.inspection_type, expiryDate: r.expiry_date,
        linkTo: `/company/vehicles/${r.vehicle_id}`,
      });
    });
    (insurance.data || []).forEach((r: { vehicle_id: string; insurance_type: string; end_date: string; provider: string }) => {
      const v = vMap.get(r.vehicle_id); if (!v) return;
      out.push({
        entity: 'vehicle', entityId: r.vehicle_id,
        entityLabel: v.plate || v.label, entitySub: v.label,
        type: r.insurance_type, expiryDate: r.end_date, extra: r.provider,
        linkTo: `/company/vehicles/${r.vehicle_id}`,
      });
    });
    (taxes.data || []).forEach((r: { vehicle_id: string; tax_year: number; due_date: string }) => {
      const v = vMap.get(r.vehicle_id); if (!v) return;
      out.push({
        entity: 'vehicle', entityId: r.vehicle_id,
        entityLabel: v.plate || v.label, entitySub: v.label,
        type: 'kfz_steuer', expiryDate: r.due_date, extra: String(r.tax_year),
        linkTo: `/company/vehicles/${r.vehicle_id}`,
      });
    });
    (licenses.data || []).forEach((r: { driver_id: string; expiry_date: string; license_number: string }) => {
      const d = dMap.get(r.driver_id); if (!d) return;
      out.push({
        entity: 'driver', entityId: r.driver_id,
        entityLabel: d.name, entitySub: d.email,
        type: 'license', expiryDate: r.expiry_date, extra: r.license_number,
        linkTo: `/company/drivers/${r.driver_id}`,
      });
    });
    (quals.data || []).forEach((r: { driver_id: string; qualification_type: string; expiry_date: string }) => {
      const d = dMap.get(r.driver_id); if (!d) return;
      out.push({
        entity: 'driver', entityId: r.driver_id,
        entityLabel: d.name, entitySub: d.email,
        type: r.qualification_type, expiryDate: r.expiry_date,
        linkTo: `/company/drivers/${r.driver_id}`,
      });
    });
    (medicals.data || []).forEach((r: { driver_id: string; exam_type: string; expiry_date: string }) => {
      const d = dMap.get(r.driver_id); if (!d) return;
      out.push({
        entity: 'driver', entityId: r.driver_id,
        entityLabel: d.name, entitySub: d.email,
        type: r.exam_type, expiryDate: r.expiry_date,
        linkTo: `/company/drivers/${r.driver_id}`,
      });
    });

    out.sort((a, b) => {
      const da = daysUntil(a.expiryDate) ?? 99999;
      const db = daysUntil(b.expiryDate) ?? 99999;
      return da - db;
    });
    setRows(out);
    setLoading(false);
  }

  const allTypes = useMemo(() => Array.from(new Set(rows.map(r => r.type))).sort(), [rows]);

  const filtered = rows.filter(r => {
    if (filterEntity !== 'all' && r.entity !== filterEntity) return false;
    if (filterType !== 'all' && r.type !== filterType) return false;
    if (filterStatus !== 'all' && expiryLevel(r.expiryDate) !== filterStatus) return false;
    return true;
  });

  const counts = useMemo(() => {
    const byLevel: Record<ExpiryLevel, number> = { expired: 0, critical: 0, warning: 0, soon: 0, ok: 0, none: 0 };
    for (const r of rows) byLevel[expiryLevel(r.expiryDate)]++;
    return byLevel;
  }, [rows]);

  function exportCsv() {
    const header = ['Tipi', 'Entiteti', 'Nen-info', 'Lloji', 'Data e skadimit', 'Dite te mbetura', 'Extra'];
    const body = filtered.map(r => [
      r.entity === 'vehicle' ? 'Mjet' : 'Shofer',
      r.entityLabel, r.entitySub,
      labelForType(r.type),
      r.expiryDate,
      String(daysUntil(r.expiryDate) ?? ''),
      r.extra || '',
    ]);
    const csv = [header, ...body].map(row => row.map(c => `"${(c || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `compliance-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function runComplianceCheck() {
    setChecking(true);
    setCheckMessage(null);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-compliance-expirations`;
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ companyId: profile?.company_id ?? null }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json().catch(() => ({}));
      setCheckMessage(json.message ?? (t('common.done') || 'U krye'));
      await fetchAll();
    } catch (err) {
      setCheckMessage((err as Error).message || 'Error');
    } finally {
      setChecking(false);
    }
  }

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-teal-600" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Perputhshmeria ligjore</h1>
          <p className="text-gray-500 mt-1 text-sm">
            Te gjitha afatet per mjete dhe shofera sipas StVZO, FeV, BKrFQG, PflVG dhe ArbMedVV.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={runComplianceCheck}
            disabled={checking}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium disabled:opacity-50"
          >
            {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {t('common.checkNow') || 'Kontrollo tani'}
          </button>
          <button onClick={exportCsv} className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium">
            <Download className="w-4 h-4" /> Eksporto CSV
          </button>
        </div>
      </div>
      {checkMessage && (
        <div className="bg-teal-50 border border-teal-200 text-teal-800 text-sm px-4 py-2 rounded-lg">
          {checkMessage}
        </div>
      )}
      <div className="hidden">
        <span>{/* spacer */}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard label="Skaduar" count={counts.expired} level="expired" onClick={() => setFilterStatus('expired')} />
        <StatCard label="Kritike (7d)" count={counts.critical} level="critical" onClick={() => setFilterStatus('critical')} />
        <StatCard label="30 dite" count={counts.warning} level="warning" onClick={() => setFilterStatus('warning')} />
        <StatCard label="90 dite" count={counts.soon} level="soon" onClick={() => setFilterStatus('soon')} />
        <StatCard label="Ne rregull" count={counts.ok} level="ok" onClick={() => setFilterStatus('ok')} />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-4 border-b border-gray-100 flex flex-wrap gap-3 items-center">
          <Filter className="w-4 h-4 text-gray-400" />
          <select value={filterEntity} onChange={(e) => setFilterEntity(e.target.value as 'all' | 'vehicle' | 'driver')}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
            <option value="all">Te gjitha entitetet</option>
            <option value="vehicle">Vetem mjete</option>
            <option value="driver">Vetem shofere</option>
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as ExpiryLevel | 'all')}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
            {STATUS_FILTER.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
            <option value="all">Te gjitha llojet</option>
            {allTypes.map(tp => <option key={tp} value={tp}>{labelForType(tp)}</option>)}
          </select>
          <div className="ml-auto text-xs text-gray-500">{filtered.length} regjistrime</div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Entiteti</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Lloji</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider hidden md:table-cell">Extra</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Statusi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 ? (
                <tr><td colSpan={4} className="px-5 py-12 text-center text-gray-400">
                  <ShieldCheck className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                  Asnje regjistrim per filtrat e zgjedhur.
                </td></tr>
              ) : filtered.map((r, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <Link to={r.linkTo} className="flex items-center gap-2">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center ${r.entity === 'vehicle' ? 'bg-blue-100 text-blue-600' : 'bg-teal-100 text-teal-600'}`}>
                        {r.entity === 'vehicle' ? <Truck className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">{r.entityLabel}</div>
                        <div className="text-xs text-gray-500">{r.entitySub}</div>
                      </div>
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-700">{labelForType(r.type)}</td>
                  <td className="px-5 py-3 text-xs text-gray-500 hidden md:table-cell">{r.extra || '—'}</td>
                  <td className="px-5 py-3"><ExpiryBadge date={r.expiryDate} size="sm" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, count, level, onClick }: { label: string; count: number; level: ExpiryLevel; onClick: () => void }) {
  const bg = level === 'expired' ? 'bg-rose-50 border-rose-200 text-rose-800'
    : level === 'critical' ? 'bg-red-50 border-red-200 text-red-800'
    : level === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800'
    : level === 'soon' ? 'bg-yellow-50 border-yellow-200 text-yellow-800'
    : 'bg-emerald-50 border-emerald-200 text-emerald-800';
  return (
    <button onClick={onClick} className={`p-4 rounded-xl border text-left transition-all hover:scale-[1.02] ${bg}`}>
      <div className="text-2xl font-bold">{count}</div>
      <div className="text-xs font-medium mt-0.5">{label}</div>
    </button>
  );
}
