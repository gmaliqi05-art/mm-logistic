import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Truck, Search, Plus, CreditCard as Edit2, ToggleLeft, ToggleRight, AlertTriangle, X, Users, Loader2, ChevronRight, ShieldCheck, ScanLine, BarChart3 } from 'lucide-react';
import FleetDocScanner from '../../components/fleet/FleetDocScanner';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { useTranslation } from '../../i18n';
import ExpiryBadge from '../../components/fleet/ExpiryBadge';
import { daysUntil } from '../../lib/fleetCompliance';
import type { Profile, Depot } from '../../types';

interface DriverForm {
  email: string;
  password: string;
  full_name: string;
  phone: string;
  depot_id: string;
}

const emptyForm: DriverForm = { email: '', password: '', full_name: '', phone: '', depot_id: '' };

interface LicenseRow { driver_id: string; expiry_date: string; }
interface QualRow { driver_id: string; qualification_type: string; expiry_date: string; }
interface MedRow { driver_id: string; expiry_date: string; }

export default function CompanyDrivers() {
  const { profile, session } = useAuth();
  const { isWithinLimit, getLimit, logAudit } = useSubscription();
  const { t } = useTranslation();
  const [drivers, setDrivers] = useState<Profile[]>([]);
  const [depots, setDepots] = useState<Depot[]>([]);
  const [licenses, setLicenses] = useState<LicenseRow[]>([]);
  const [quals, setQuals] = useState<QualRow[]>([]);
  const [medicals, setMedicals] = useState<MedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Profile | null>(null);
  const [form, setForm] = useState<DriverForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile?.company_id) fetchData();
  }, [profile?.company_id]);

  async function fetchData() {
    try {
      setLoading(true);
      setError(null);
      const companyId = profile!.company_id!;
      const [driversRes, depotsRes, lRes, qRes, mRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('company_id', companyId).eq('role', 'driver').order('created_at', { ascending: false }),
        supabase.from('depots').select('*').eq('company_id', companyId).eq('is_active', true).order('name'),
        supabase.from('driver_licenses').select('driver_id, expiry_date').eq('company_id', companyId),
        supabase.from('driver_qualifications').select('driver_id, qualification_type, expiry_date').eq('company_id', companyId),
        supabase.from('driver_medical').select('driver_id, expiry_date').eq('company_id', companyId),
      ]);
      if (driversRes.error) throw driversRes.error;
      setDrivers(driversRes.data ?? []);
      setDepots(depotsRes.data ?? []);
      setLicenses((lRes.data || []) as LicenseRow[]);
      setQuals((qRes.data || []) as QualRow[]);
      setMedicals((mRes.data || []) as MedRow[]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.errorLoading'));
    } finally {
      setLoading(false);
    }
  }

  const dataByDriver = useMemo(() => {
    const out: Record<string, { license?: string; kod95?: string; medical?: string }> = {};
    for (const l of licenses) {
      const cur = out[l.driver_id] || {};
      if (!cur.license || new Date(l.expiry_date) > new Date(cur.license)) cur.license = l.expiry_date;
      out[l.driver_id] = cur;
    }
    for (const q of quals) {
      if (q.qualification_type !== 'kod95') continue;
      const cur = out[q.driver_id] || {};
      if (!cur.kod95 || new Date(q.expiry_date) > new Date(cur.kod95)) cur.kod95 = q.expiry_date;
      out[q.driver_id] = cur;
    }
    for (const m of medicals) {
      const cur = out[m.driver_id] || {};
      if (!cur.medical || new Date(m.expiry_date) > new Date(cur.medical)) cur.medical = m.expiry_date;
      out[m.driver_id] = cur;
    }
    return out;
  }, [licenses, quals, medicals]);

  const criticalCount = drivers.filter(d => {
    const x = dataByDriver[d.id];
    if (!x) return false;
    const dl = daysUntil(x.license); const dk = daysUntil(x.kod95); const dm = daysUntil(x.medical);
    return (dl !== null && dl <= 30) || (dk !== null && dk <= 30) || (dm !== null && dm <= 30);
  }).length;

  async function handleSave() {
    if (!form.full_name.trim()) return;
    try {
      setSaving(true);
      setError(null);
      if (editingDriver) {
        const { error: err } = await supabase.from('profiles').update({
          full_name: form.full_name,
          phone: form.phone,
          depot_id: form.depot_id || null,
        }).eq('id', editingDriver.id);
        if (err) throw err;
        await logAudit('update', 'driver', editingDriver.id, { name: form.full_name });
      } else {
        if (!form.email.trim() || !form.password.trim()) return;
        const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users`;
        const res = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            email: form.email,
            password: form.password,
            full_name: form.full_name,
            role: 'driver',
            company_id: profile!.company_id,
            depot_id: form.depot_id || null,
            phone: form.phone,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || t('common.errorSaving'));
        await logAudit('create', 'driver', data.user?.id, { name: form.full_name, email: form.email });
      }

      setShowModal(false);
      setEditingDriver(null);
      setForm(emptyForm);
      await fetchData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.errorSaving'));
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(driver: Profile) {
    try {
      const { error: err } = await supabase.from('profiles').update({ is_active: !driver.is_active }).eq('id', driver.id);
      if (err) throw err;
      await fetchData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function openAdd() {
    const activeDrivers = drivers.filter(d => d.is_active).length;
    if (!isWithinLimit('drivers', activeDrivers)) {
      const limit = getLimit('drivers');
      setError(t('companyAdmin.drivers.errDriverLimit').replace('{limit}', String(limit)));
      return;
    }
    setEditingDriver(null);
    setForm(emptyForm);
    setShowModal(true);
  }

  function openEdit(driver: Profile) {
    setEditingDriver(driver);
    setForm({ email: driver.email, password: '', full_name: driver.full_name, phone: driver.phone || '', depot_id: driver.depot_id || '' });
    setShowModal(true);
  }

  const filtered = drivers.filter(
    (d) => d.full_name.toLowerCase().includes(search.toLowerCase()) || d.email.toLowerCase().includes(search.toLowerCase()) || (d.phone || '').toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('company.drivers.title')}</h1>
          <p className="text-gray-500 mt-1 text-sm">
            Menaxhimi i shoferve, patentes (FeV), kualifikimit BKrFQG (Kod 95), ekzaminimit mjeksor G25.
            {getLimit('drivers') !== -1 && (
              <span className="ml-2 text-xs font-medium text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full">
                {drivers.filter(d => d.is_active).length} / {getLimit('drivers')}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowScanner(true)} className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-teal-600 text-teal-700 rounded-lg hover:bg-teal-50 font-medium">
            <ScanLine className="w-4 h-4" /> Skano dokument
          </button>
          <button onClick={openAdd} className="inline-flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-medium">
            <Plus className="w-4 h-4" />
            {t('company.drivers.addDriver')}
          </button>
        </div>
      </div>

      {criticalCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-amber-600" />
          <div className="flex-1 text-sm text-amber-900">
            <span className="font-semibold">{criticalCount}</span> shofere kane dokumente qe skadojne brenda 30 ditesh. Sipas FeV § 24, aplikimi per rinovim mund te behet 6 muaj perpara skadimit.
          </div>
          <Link to="/company/compliance" className="text-sm font-semibold text-amber-800 hover:text-amber-950">Shiko detajet</Link>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500" />
          <p className="text-red-700 text-sm flex-1">{error}</p>
          <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-4 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder={t('company.drivers.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-600 uppercase">{t('common.name')}</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-600 uppercase hidden md:table-cell">Kontakt</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-600 uppercase">Patenta</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-600 uppercase hidden lg:table-cell">Kod 95</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-600 uppercase hidden lg:table-cell">G25</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-600 uppercase">Statusi</th>
                <th className="w-28" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-gray-400">
                  <Users className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                  {t('company.drivers.noDrivers')}
                </td></tr>
              ) : filtered.map((driver) => {
                const data = dataByDriver[driver.id] || {};
                return (
                  <tr key={driver.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-4">
                      <Link to={`/company/drivers/${driver.id}`} className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-teal-100 flex items-center justify-center">
                          <Truck className="w-4 h-4 text-teal-600" />
                        </div>
                        <span className="text-sm font-medium text-gray-900">{driver.full_name}</span>
                      </Link>
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-600 hidden md:table-cell">
                      <div>{driver.email}</div>
                      {driver.phone && <div className="text-xs text-gray-500">{driver.phone}</div>}
                    </td>
                    <td className="px-5 py-4"><ExpiryBadge date={data.license} size="sm" /></td>
                    <td className="px-5 py-4 hidden lg:table-cell"><ExpiryBadge date={data.kod95} size="sm" /></td>
                    <td className="px-5 py-4 hidden lg:table-cell"><ExpiryBadge date={data.medical} size="sm" /></td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${driver.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {driver.is_active ? t('common.active') : t('common.inactive')}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(driver)} className="p-2 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => toggleStatus(driver)} className={`p-2 rounded-lg ${driver.is_active ? 'text-green-500 hover:text-red-500 hover:bg-red-50' : 'text-red-400 hover:text-green-500 hover:bg-green-50'}`}>
                          {driver.is_active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                        </button>
                        <Link
                          to={`/company/drivers/${driver.id}/reports`}
                          title="Raportet"
                          className="p-2 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg"
                        >
                          <BarChart3 className="w-4 h-4" />
                        </Link>
                        <Link to={`/company/drivers/${driver.id}`} className="p-2 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg">
                          <ChevronRight className="w-4 h-4" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">{editingDriver ? t('company.drivers.editDriver') : t('company.drivers.addDriver')}</h2>
              <button onClick={() => setShowModal(false)} className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              {!editingDriver && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.email')}</label>
                    <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.password')}</label>
                    <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm" />
                  </div>
                </>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.fullName')}</label>
                <input type="text" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.phone')}</label>
                <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm" />
              </div>
              {depots.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('company.deliveryNotes.depot')}</label>
                  <select value={form.depot_id} onChange={(e) => setForm({ ...form, depot_id: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm bg-white">
                    <option value="">-</option>
                    {depots.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              )}
              <p className="text-xs text-gray-500 bg-gray-50 p-3 rounded-lg">
                Patenta, kualifikimet (Kod 95, ADR) dhe te dhenat mjeksore mund te shtohen pasi te krijohet shoferi duke klikuar ne emrin e tij.
              </p>
            </div>
            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-100">
              <button onClick={() => setShowModal(false)} className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg">{t('common.cancel')}</button>
              <button onClick={handleSave} disabled={saving || !form.full_name.trim() || (!editingDriver && (!form.email.trim() || !form.password.trim()))}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingDriver ? t('common.saveChanges') : t('company.drivers.addDriver')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showScanner && (
        <FleetDocScanner
          mode="driver"
          onClose={() => setShowScanner(false)}
          onSaved={() => { setShowScanner(false); fetchData(); }}
        />
      )}
    </div>
  );
}
