import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Truck, Search, Plus, AlertTriangle, X, Loader2, ChevronRight, Container, ShieldCheck, ScanLine } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import ExpiryBadge from '../../components/fleet/ExpiryBadge';
import FleetDocScanner from '../../components/fleet/FleetDocScanner';
import { daysUntil } from '../../lib/fleetCompliance';

interface Vehicle {
  id: string;
  vehicle_type: 'truck' | 'trailer';
  brand: string;
  model: string;
  license_plate: string;
  vin: string;
  first_registration: string | null;
  max_weight_kg: number;
  euro_emission: string;
  status: string;
  depot_id: string | null;
  photo_url: string;
  // Routing dimensions and hazardous-goods metadata (see migration
  // 20260520133000_add_vehicle_routing_dimensions.sql). All optional.
  length_mm?: number | null;
  width_mm?: number | null;
  height_mm?: number | null;
  axle_load_kg?: number | null;
  adr_class?: string | null;
  tunnel_category?: string | null;
  has_tachograph?: boolean;
  tachograph_type?: string | null;
}

interface InspectionRow {
  vehicle_id: string;
  inspection_type: string;
  expiry_date: string;
}

interface InsuranceRow {
  vehicle_id: string;
  insurance_type: string;
  end_date: string;
}

interface Depot { id: string; name: string; }

interface VehicleForm {
  vehicle_type: 'truck' | 'trailer';
  brand: string;
  model: string;
  license_plate: string;
  vin: string;
  first_registration: string;
  zb1_number: string;
  zb2_number: string;
  max_weight_kg: string;
  payload_kg: string;
  axles: string;
  euro_emission: string;
  fuel_type: string;
  engine_power_kw: string;
  color: string;
  depot_id: string;
  status: string;
  notes: string;
  hu_tuv_expiry: string;
  au_expiry: string;
  sp_expiry: string;
  tacho_expiry: string;
  haftpflicht_expiry: string;
  haftpflicht_provider: string;
  vollkasko_expiry: string;
  kfz_steuer_due: string;
  // Routing & ADR (added by migration 20260520133000)
  length_mm: string;
  width_mm: string;
  height_mm: string;
  axle_load_kg: string;
  adr_class: string;
  tunnel_category: string;
  has_tachograph: boolean;
  tachograph_type: string;
}

const emptyForm: VehicleForm = {
  vehicle_type: 'truck', brand: '', model: '', license_plate: '', vin: '',
  first_registration: '', zb1_number: '', zb2_number: '',
  max_weight_kg: '', payload_kg: '', axles: '', euro_emission: 'Euro 6',
  fuel_type: 'Diesel', engine_power_kw: '', color: '', depot_id: '',
  status: 'active', notes: '',
  hu_tuv_expiry: '', au_expiry: '', sp_expiry: '', tacho_expiry: '',
  haftpflicht_expiry: '', haftpflicht_provider: '',
  vollkasko_expiry: '', kfz_steuer_due: '',
  length_mm: '', width_mm: '', height_mm: '',
  axle_load_kg: '', adr_class: 'none', tunnel_category: '',
  has_tachograph: false, tachograph_type: '',
};

export default function CompanyVehicles() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [inspections, setInspections] = useState<InspectionRow[]>([]);
  const [insurance, setInsurance] = useState<InsuranceRow[]>([]);
  const [depots, setDepots] = useState<Depot[]>([]);
  const [tab, setTab] = useState<'truck' | 'trailer'>('truck');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [form, setForm] = useState<VehicleForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile?.company_id) fetchData();
  }, [profile?.company_id]);

  async function fetchData() {
    try {
      setLoading(true);
      setError(null);
      const cid = profile!.company_id!;
      const [vRes, iRes, insRes, dRes] = await Promise.all([
        supabase.from('vehicles').select('*').eq('company_id', cid).order('created_at', { ascending: false }),
        supabase.from('vehicle_inspections').select('vehicle_id, inspection_type, expiry_date').eq('company_id', cid),
        supabase.from('vehicle_insurance').select('vehicle_id, insurance_type, end_date').eq('company_id', cid),
        supabase.from('depots').select('id, name').eq('company_id', cid).eq('is_active', true),
      ]);
      if (vRes.error) throw vRes.error;
      setVehicles((vRes.data || []) as Vehicle[]);
      setInspections((iRes.data || []) as InspectionRow[]);
      setInsurance((insRes.data || []) as InsuranceRow[]);
      setDepots((dRes.data || []) as Depot[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gabim ne ngarkim');
    } finally {
      setLoading(false);
    }
  }

  const latestExpiry = useMemo(() => {
    const byVeh: Record<string, { huTuv?: string; haftpflicht?: string }> = {};
    for (const r of inspections) {
      if (r.inspection_type !== 'hu_tuv') continue;
      const cur = byVeh[r.vehicle_id] || {};
      if (!cur.huTuv || new Date(r.expiry_date) > new Date(cur.huTuv)) cur.huTuv = r.expiry_date;
      byVeh[r.vehicle_id] = cur;
    }
    for (const r of insurance) {
      if (r.insurance_type !== 'haftpflicht') continue;
      const cur = byVeh[r.vehicle_id] || {};
      if (!cur.haftpflicht || new Date(r.end_date) > new Date(cur.haftpflicht)) cur.haftpflicht = r.end_date;
      byVeh[r.vehicle_id] = cur;
    }
    return byVeh;
  }, [inspections, insurance]);

  const filtered = vehicles
    .filter((v) => v.vehicle_type === tab)
    .filter((v) => {
      const q = search.toLowerCase();
      return !q || v.license_plate.toLowerCase().includes(q) || v.vin.toLowerCase().includes(q)
        || v.brand.toLowerCase().includes(q) || v.model.toLowerCase().includes(q);
    });

  const truckCount = vehicles.filter(v => v.vehicle_type === 'truck').length;
  const trailerCount = vehicles.filter(v => v.vehicle_type === 'trailer').length;

  function openAdd(t: 'truck' | 'trailer') {
    setForm({ ...emptyForm, vehicle_type: t });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.license_plate.trim() || !form.brand.trim()) {
      setError(t('company.vehicles.plateBrandRequired') || 'Targa dhe marka jane te detyrueshme');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const cid = profile!.company_id!;
      const { data, error: vErr } = await supabase
        .from('vehicles')
        .insert({
          company_id: cid,
          depot_id: form.depot_id || null,
          vehicle_type: form.vehicle_type,
          brand: form.brand,
          model: form.model,
          license_plate: form.license_plate.toUpperCase(),
          vin: form.vin.toUpperCase(),
          first_registration: form.first_registration || null,
          zb1_number: form.zb1_number,
          zb2_number: form.zb2_number,
          max_weight_kg: Number(form.max_weight_kg) || 0,
          payload_kg: Number(form.payload_kg) || 0,
          axles: Number(form.axles) || 0,
          euro_emission: form.euro_emission,
          fuel_type: form.fuel_type,
          engine_power_kw: Number(form.engine_power_kw) || 0,
          color: form.color,
          status: form.status,
          notes: form.notes,
          length_mm: form.length_mm ? Number(form.length_mm) : null,
          width_mm: form.width_mm ? Number(form.width_mm) : null,
          height_mm: form.height_mm ? Number(form.height_mm) : null,
          axle_load_kg: form.axle_load_kg ? Number(form.axle_load_kg) : null,
          adr_class: form.adr_class || null,
          tunnel_category: form.tunnel_category || null,
          has_tachograph: form.has_tachograph,
          tachograph_type: form.tachograph_type || null,
        })
        .select('id')
        .maybeSingle();
      if (vErr || !data) throw vErr || new Error('Gabim');

      const vid = data.id;
      const inspectionsToAdd: Array<{ type: string; date: string }> = [];
      if (form.hu_tuv_expiry) inspectionsToAdd.push({ type: 'hu_tuv', date: form.hu_tuv_expiry });
      if (form.au_expiry) inspectionsToAdd.push({ type: 'au', date: form.au_expiry });
      if (form.sp_expiry) inspectionsToAdd.push({ type: 'sp', date: form.sp_expiry });
      if (form.tacho_expiry) inspectionsToAdd.push({ type: 'tacho', date: form.tacho_expiry });
      if (inspectionsToAdd.length > 0) {
        await supabase.from('vehicle_inspections').insert(
          inspectionsToAdd.map(i => ({ vehicle_id: vid, company_id: cid, inspection_type: i.type, expiry_date: i.date }))
        );
      }

      const insuranceToAdd: Array<{ type: string; date: string; provider?: string }> = [];
      if (form.haftpflicht_expiry) insuranceToAdd.push({ type: 'haftpflicht', date: form.haftpflicht_expiry, provider: form.haftpflicht_provider });
      if (form.vollkasko_expiry) insuranceToAdd.push({ type: 'vollkasko', date: form.vollkasko_expiry });
      if (insuranceToAdd.length > 0) {
        await supabase.from('vehicle_insurance').insert(
          insuranceToAdd.map(i => ({ vehicle_id: vid, company_id: cid, insurance_type: i.type, end_date: i.date, provider: i.provider || '' }))
        );
      }

      if (form.kfz_steuer_due) {
        await supabase.from('vehicle_taxes').insert({
          vehicle_id: vid, company_id: cid,
          tax_year: new Date(form.kfz_steuer_due).getFullYear(),
          due_date: form.kfz_steuer_due,
        });
      }

      setShowModal(false);
      setForm(emptyForm);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gabim ne ruajtje');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-teal-600" /></div>;
  }

  const criticalCount = vehicles.filter(v => {
    const hu = latestExpiry[v.id]?.huTuv;
    const hp = latestExpiry[v.id]?.haftpflicht;
    const dHu = daysUntil(hu); const dHp = daysUntil(hp);
    return (dHu !== null && dHu <= 30) || (dHp !== null && dHp <= 30);
  }).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Flota</h1>
          <p className="text-gray-500 mt-1 text-sm">
            Menaxhimi i kamioneve (LKW) dhe rimorkiove (Anhanger) sipas ligjit gjerman (StVZO, § 29 StVZO per HU).
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowScanner(true)} className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-teal-600 text-teal-700 rounded-lg hover:bg-teal-50 font-medium">
            <ScanLine className="w-4 h-4" /> Skano Zulassung
          </button>
          <button onClick={() => openAdd(tab)} className="inline-flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-medium">
            <Plus className="w-4 h-4" />
            {tab === 'truck' ? 'Shto Kamion' : 'Shto Rimorkio'}
          </button>
        </div>
      </div>

      {criticalCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-amber-600" />
          <div className="flex-1 text-sm text-amber-900">
            <span className="font-semibold">{criticalCount}</span> mjete kane afate qe skadojne ne 30 ditet e ardhshme.
          </div>
          <Link to="/company/compliance" className="text-sm font-semibold text-amber-800 hover:text-amber-950">
            Shiko te gjitha
          </Link>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-red-700 text-sm flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-500"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="flex border-b border-gray-100">
          <button onClick={() => setTab('truck')}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
              tab === 'truck' ? 'border-teal-600 text-teal-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            <Truck className="w-4 h-4" /> Kamionet (LKW)
            <span className="ml-1 px-2 py-0.5 bg-gray-100 rounded-full text-xs">{truckCount}</span>
          </button>
          <button onClick={() => setTab('trailer')}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
              tab === 'trailer' ? 'border-teal-600 text-teal-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            <Container className="w-4 h-4" /> Rimorkiot (Anhanger)
            <span className="ml-1 px-2 py-0.5 bg-gray-100 rounded-full text-xs">{trailerCount}</span>
          </button>
        </div>

        <div className="p-4 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder={t('company.vehicles.searchPlaceholder') || 'Kerko me targe, VIN, marke...'} value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Targa</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Marka / Modeli</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider hidden md:table-cell">VIN</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">HU/TUV</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider hidden lg:table-cell">Sigurimi</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider hidden lg:table-cell">Statusi</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-gray-400">
                    {tab === 'truck' ? <Truck className="w-10 h-10 mx-auto mb-3 text-gray-300" /> : <Container className="w-10 h-10 mx-auto mb-3 text-gray-300" />}
                    Nuk ka {tab === 'truck' ? 'kamione' : 'rimorkio'} te regjistruara.
                  </td>
                </tr>
              ) : (
                filtered.map((v) => {
                  const hu = latestExpiry[v.id]?.huTuv;
                  const hp = latestExpiry[v.id]?.haftpflicht;
                  return (
                    <tr key={v.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-4">
                        <Link to={`/company/vehicles/${v.id}`} className="inline-flex items-center gap-2.5">
                          <span className="inline-flex items-center justify-center px-2.5 py-1 bg-slate-900 text-white rounded font-mono text-xs tracking-wider">
                            {v.license_plate || '—'}
                          </span>
                        </Link>
                      </td>
                      <td className="px-5 py-4">
                        <div className="text-sm font-medium text-gray-900">{v.brand} {v.model}</div>
                        {v.euro_emission && <div className="text-xs text-gray-500">{v.euro_emission} • {(v.max_weight_kg / 1000).toFixed(1)}t</div>}
                      </td>
                      <td className="px-5 py-4 text-xs text-gray-600 font-mono hidden md:table-cell">{v.vin || '—'}</td>
                      <td className="px-5 py-4"><ExpiryBadge date={hu} size="sm" /></td>
                      <td className="px-5 py-4 hidden lg:table-cell"><ExpiryBadge date={hp} size="sm" /></td>
                      <td className="px-5 py-4 hidden lg:table-cell">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          v.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                          v.status === 'in_repair' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-700'
                        }`}>
                          {v.status === 'active' ? 'Aktiv' : v.status === 'in_repair' ? 'Ne riparim' : v.status === 'inactive' ? 'Jo aktiv' : 'Shitur'}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Link to={`/company/vehicles/${v.id}`} className="p-2 text-gray-400 hover:text-teal-600 inline-block">
                          <ChevronRight className="w-4 h-4" />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">
                {form.vehicle_type === 'truck' ? 'Shto Kamion (LKW)' : 'Shto Rimorkio (Anhanger)'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 overflow-y-auto space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Te dhenat bazike</h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Targa (Kennzeichen) *" value={form.license_plate} onChange={(v) => setForm({ ...form, license_plate: v })} placeholder="B-XX 1234" />
                  <Field label="VIN (FIN)" value={form.vin} onChange={(v) => setForm({ ...form, vin: v })} placeholder="WDB9634031L123456" />
                  <Field label="Marka *" value={form.brand} onChange={(v) => setForm({ ...form, brand: v })} placeholder="Mercedes-Benz" />
                  <Field label="Modeli" value={form.model} onChange={(v) => setForm({ ...form, model: v })} placeholder="Actros 1845" />
                  <Field label="Data e pare e regjistrimit" type="date" value={form.first_registration} onChange={(v) => setForm({ ...form, first_registration: v })} />
                  <Field label="Klasa Euro" value={form.euro_emission} onChange={(v) => setForm({ ...form, euro_emission: v })} placeholder="Euro 6" />
                  <Field label="ZB I Nummer" value={form.zb1_number} onChange={(v) => setForm({ ...form, zb1_number: v })} />
                  <Field label="ZB II Nummer" value={form.zb2_number} onChange={(v) => setForm({ ...form, zb2_number: v })} />
                  <Field label="Pesha max (kg)" type="number" value={form.max_weight_kg} onChange={(v) => setForm({ ...form, max_weight_kg: v })} />
                  <Field label="Ngarkesa (kg)" type="number" value={form.payload_kg} onChange={(v) => setForm({ ...form, payload_kg: v })} />
                  <Field label="Numri i akseve" type="number" value={form.axles} onChange={(v) => setForm({ ...form, axles: v })} />
                  <Field label="Karburanti" value={form.fuel_type} onChange={(v) => setForm({ ...form, fuel_type: v })} placeholder="Diesel" />
                  {form.vehicle_type === 'truck' && (
                    <Field label="Fuqia (kW)" type="number" value={form.engine_power_kw} onChange={(v) => setForm({ ...form, engine_power_kw: v })} />
                  )}
                  <Field label="Ngjyra" value={form.color} onChange={(v) => setForm({ ...form, color: v })} />
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Depo</label>
                    <select value={form.depot_id} onChange={(e) => setForm({ ...form, depot_id: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                      <option value="">—</option>
                      {depots.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Dimensionet dhe ADR (per planifikim rrugesh HGV)</h3>
                <div className="grid sm:grid-cols-3 gap-4">
                  <Field label="Gjatesia (mm)" type="number" value={form.length_mm} onChange={(v) => setForm({ ...form, length_mm: v })} placeholder="13000" />
                  <Field label="Gjeresia (mm)" type="number" value={form.width_mm} onChange={(v) => setForm({ ...form, width_mm: v })} placeholder="2550" />
                  <Field label="Lartesia (mm)" type="number" value={form.height_mm} onChange={(v) => setForm({ ...form, height_mm: v })} placeholder="4000" />
                  {form.vehicle_type === 'truck' && (
                    <Field label="Ngarkesa max ne nje akse (kg)" type="number" value={form.axle_load_kg} onChange={(v) => setForm({ ...form, axle_load_kg: v })} placeholder="11500" />
                  )}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Klasa ADR</label>
                    <select value={form.adr_class} onChange={(e) => setForm({ ...form, adr_class: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                      <option value="none">Pa ADR</option>
                      <option value="1">1 - Eksplozive</option>
                      <option value="2">2 - Gazra</option>
                      <option value="3">3 - Lengje te ndezshme</option>
                      <option value="4.1">4.1 - Lendet e ngurta te ndezshme</option>
                      <option value="4.2">4.2 - Substancat vetdjegese</option>
                      <option value="4.3">4.3 - Lendet qe leshojne gaz me uje</option>
                      <option value="5.1">5.1 - Oksidues</option>
                      <option value="5.2">5.2 - Peroksidet organike</option>
                      <option value="6.1">6.1 - Toksike</option>
                      <option value="6.2">6.2 - Infektive</option>
                      <option value="7">7 - Radioaktive</option>
                      <option value="8">8 - Korrozive</option>
                      <option value="9">9 - Te tjera</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Kategoria e tunelit</label>
                    <select value={form.tunnel_category} onChange={(e) => setForm({ ...form, tunnel_category: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                      <option value="">—</option>
                      <option value="A">A</option>
                      <option value="B">B</option>
                      <option value="C">C</option>
                      <option value="D">D</option>
                      <option value="E">E</option>
                    </select>
                  </div>
                  {form.vehicle_type === 'truck' && (
                    <>
                      <div className="flex items-center gap-2 pt-6">
                        <input id="has_tacho" type="checkbox" checked={form.has_tachograph} onChange={(e) => setForm({ ...form, has_tachograph: e.target.checked })} className="rounded" />
                        <label htmlFor="has_tacho" className="text-sm text-gray-700">Ka tachograph</label>
                      </div>
                      {form.has_tachograph && (
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1.5">Lloji i tachograph-it</label>
                          <select value={form.tachograph_type} onChange={(e) => setForm({ ...form, tachograph_type: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                            <option value="">—</option>
                            <option value="analog">Analog</option>
                            <option value="digital">Digital</option>
                            <option value="smart_v1">Smart v1</option>
                            <option value="smart_v2">Smart v2</option>
                          </select>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Inspektimet (HU/TUV, AU, SP, Tacho)</h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="HU/TUV skadon me" type="date" value={form.hu_tuv_expiry} onChange={(v) => setForm({ ...form, hu_tuv_expiry: v })} />
                  <Field label="AU (emisionet) skadon" type="date" value={form.au_expiry} onChange={(v) => setForm({ ...form, au_expiry: v })} />
                  {form.vehicle_type === 'trailer' && (
                    <Field label="SP (Sicherheitsprufung)" type="date" value={form.sp_expiry} onChange={(v) => setForm({ ...form, sp_expiry: v })} />
                  )}
                  {form.vehicle_type === 'truck' && (
                    <Field label="Tachograph kalibrim" type="date" value={form.tacho_expiry} onChange={(v) => setForm({ ...form, tacho_expiry: v })} />
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Sigurimi (Haftpflicht, Vollkasko)</h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Haftpflicht ofruesi" value={form.haftpflicht_provider} onChange={(v) => setForm({ ...form, haftpflicht_provider: v })} placeholder="HUK-Coburg, Allianz..." />
                  <Field label="Haftpflicht skadon" type="date" value={form.haftpflicht_expiry} onChange={(v) => setForm({ ...form, haftpflicht_expiry: v })} />
                  <Field label="Vollkasko skadon" type="date" value={form.vollkasko_expiry} onChange={(v) => setForm({ ...form, vollkasko_expiry: v })} />
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Kfz-Steuer (Taksa e mjetit)</h3>
                <Field label="Data e skadimit" type="date" value={form.kfz_steuer_due} onChange={(v) => setForm({ ...form, kfz_steuer_due: v })} />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-100">
              <button onClick={() => setShowModal(false)} className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">Anulo</button>
              <button onClick={handleSave} disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Ruaj
              </button>
            </div>
          </div>
        </div>
      )}

      {showScanner && (
        <FleetDocScanner
          mode="vehicle"
          defaultCategory="zulassung"
          onClose={() => setShowScanner(false)}
          onSaved={() => { setShowScanner(false); fetchData(); }}
        />
      )}
    </div>
  );
}

function Field({
  label, value, onChange, type = 'text', placeholder,
}: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1.5">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm" />
    </div>
  );
}
