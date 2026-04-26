import { useState, useEffect } from 'react';
import { Truck, Search, Plus, CreditCard as Edit2, ToggleLeft, ToggleRight, AlertTriangle, X, Users, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { useTranslation } from '../../i18n';
import type { Profile, Depot } from '../../types';

interface DriverForm {
  email: string;
  password: string;
  full_name: string;
  phone: string;
  depot_id: string;
}

const emptyForm: DriverForm = { email: '', password: '', full_name: '', phone: '', depot_id: '' };

export default function CompanyDrivers() {
  const { profile, session } = useAuth();
  const { isWithinLimit, getLimit, logAudit } = useSubscription();
  const { t } = useTranslation();
  const [drivers, setDrivers] = useState<Profile[]>([]);
  const [depots, setDepots] = useState<Depot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
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
      const [driversRes, depotsRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('company_id', companyId).eq('role', 'driver').order('created_at', { ascending: false }),
        supabase.from('depots').select('*').eq('company_id', companyId).eq('is_active', true).order('name'),
      ]);
      if (driversRes.error) throw driversRes.error;
      setDrivers(driversRes.data ?? []);
      setDepots(depotsRes.data ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.errorLoading'));
    } finally {
      setLoading(false);
    }
  }

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
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('company.drivers.title')}</h1>
          <p className="text-gray-500 mt-1">
            {t('company.drivers.subtitle')}
            {getLimit('drivers') !== -1 && (
              <span className="ml-2 text-xs font-medium text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full">
                {drivers.filter(d => d.is_active).length} / {getLimit('drivers')}
              </span>
            )}
          </p>
        </div>
        <button onClick={openAdd} className="inline-flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium">
          <Plus className="w-4 h-4" />
          {t('company.drivers.addDriver')}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-red-700 text-sm">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-4 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder={t('company.drivers.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('common.name')}</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('common.email')}</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">{t('common.phone')}</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('common.status')}</th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('common.edit')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                    <Users className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                    {t('company.drivers.noDrivers')}
                  </td>
                </tr>
              ) : (
                filtered.map((driver) => (
                  <tr key={driver.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-teal-100 flex items-center justify-center">
                          <Truck className="w-4 h-4 text-teal-600" />
                        </div>
                        <span className="text-sm font-medium text-gray-900">{driver.full_name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{driver.email}</td>
                    <td className="px-6 py-4 text-sm text-gray-600 hidden md:table-cell">{driver.phone || '-'}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${driver.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {driver.is_active ? t('common.active') : t('common.inactive')}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(driver)} className="p-2 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors" title={t('common.edit')}>
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => toggleStatus(driver)} className={`p-2 rounded-lg transition-colors ${driver.is_active ? 'text-green-500 hover:text-red-500 hover:bg-red-50' : 'text-red-400 hover:text-green-500 hover:bg-green-50'}`}>
                          {driver.is_active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
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
              <button onClick={() => setShowModal(false)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-6 space-y-4">
              {!editingDriver && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.email')}</label>
                    <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm" placeholder="email@shembull.com" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.password')}</label>
                    <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm" placeholder={t('auth.minChars')} />
                  </div>
                </>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.fullName')}</label>
                <input type="text" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm" placeholder={t('auth.adminNamePlaceholder')} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.phone')}</label>
                <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm" placeholder="+383 4x xxx xxx" />
              </div>
              {depots.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('company.deliveryNotes.depot')}</label>
                  <select value={form.depot_id} onChange={(e) => setForm({ ...form, depot_id: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm bg-white">
                    <option value="">-</option>
                    {depots.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-100">
              <button onClick={() => setShowModal(false)} className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">{t('common.cancel')}</button>
              <button onClick={handleSave} disabled={saving || !form.full_name.trim() || (!editingDriver && (!form.email.trim() || !form.password.trim()))}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingDriver ? t('common.saveChanges') : t('company.drivers.addDriver')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
