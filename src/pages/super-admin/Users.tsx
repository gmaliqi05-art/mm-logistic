import { useState, useEffect } from 'react';
import {
  Users as UsersIcon,
  Search,
  Filter,
  Plus,
  Edit2,
  ToggleLeft,
  ToggleRight,
  X,
  AlertTriangle,
  Loader2,
  Trash2,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import type { Profile, Company, Depot, UserRole } from '../../types';

const roleColors: Record<string, string> = {
  super_admin: 'bg-red-100 text-red-700',
  company_admin: 'bg-teal-100 text-teal-700',
  depot_worker: 'bg-amber-100 text-amber-700',
  driver: 'bg-blue-100 text-blue-700',
};

interface UserForm {
  email: string;
  password: string;
  full_name: string;
  role: UserRole;
  company_id: string;
  depot_id: string;
  phone: string;
}

const emptyForm: UserForm = {
  email: '', password: '', full_name: '', role: 'driver',
  company_id: '', depot_id: '', phone: '',
};

export default function SuperAdminUsers() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [depots, setDepots] = useState<Depot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    try {
      setLoading(true);
      setError(null);
      const [usersRes, companiesRes, depotsRes] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('companies').select('*').eq('is_active', true).order('name'),
        supabase.from('depots').select('*').eq('is_active', true).order('name'),
      ]);
      if (usersRes.error) throw usersRes.error;
      setUsers(usersRes.data ?? []);
      setCompanies(companiesRes.data ?? []);
      setDepots(depotsRes.data ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.errorLoading'));
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!form.full_name.trim() || !form.role) return;
    try {
      setSaving(true);
      setError(null);

      if (editingUser) {
        const { error: err } = await supabase.from('profiles').update({
          full_name: form.full_name,
          role: form.role,
          company_id: form.company_id || null,
          depot_id: form.depot_id || null,
          phone: form.phone,
        }).eq('id', editingUser.id);
        if (err) throw err;
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
            email: form.email, password: form.password, full_name: form.full_name,
            role: form.role, company_id: form.company_id || null,
            depot_id: form.depot_id || null, phone: form.phone,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || t('common.errorSaving'));
      }

      setShowModal(false);
      setEditingUser(null);
      setForm(emptyForm);
      await fetchData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.errorSaving'));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(user: Profile) {
    try {
      const { error: err } = await supabase.from('profiles').update({ is_active: !user.is_active }).eq('id', user.id);
      if (err) throw err;
      await fetchData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function handleDelete(user: Profile) {
    if (!confirm(`${t('superAdmin.users.confirmDelete')}`)) return;
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users`;
      const res = await fetch(apiUrl, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json', 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY },
        body: JSON.stringify({ user_id: user.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('common.error'));
      await fetchData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function openAdd() {
    setEditingUser(null);
    setForm(emptyForm);
    setShowModal(true);
  }

  function openEdit(user: Profile) {
    setEditingUser(user);
    setForm({
      email: user.email, password: '', full_name: user.full_name, role: user.role,
      company_id: user.company_id || '', depot_id: user.depot_id || '', phone: user.phone || '',
    });
    setShowModal(true);
  }

  const filtered = users.filter((u) => {
    const matchesSearch = u.full_name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const companyName = (id: string | null) => companies.find((c) => c.id === id)?.name || '-';
  const filteredDepots = form.company_id ? depots.filter((d) => d.company_id === form.company_id) : depots;

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
          <h1 className="text-2xl font-bold text-gray-900">{t('superAdmin.users.title')}</h1>
          <p className="text-gray-500 mt-1">{t('superAdmin.users.subtitle')}</p>
        </div>
        <button onClick={openAdd} className="inline-flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium">
          <Plus className="w-4 h-4" />
          {t('superAdmin.users.addUser')}
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
        <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder={t('superAdmin.users.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm" />
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}
              className="pl-10 pr-8 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm appearance-none bg-white">
              <option value="all">{t('common.allRoles')}</option>
              <option value="super_admin">{t('roles.super_admin')}</option>
              <option value="company_admin">{t('roles.company_admin')}</option>
              <option value="depot_worker">{t('roles.depot_worker')}</option>
              <option value="driver">{t('roles.driver')}</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('superAdmin.users.title')}</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('common.role')}</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">{t('common.company')}</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">{t('common.phone')}</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('common.status')}</th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('common.edit')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                    <UsersIcon className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                    {t('superAdmin.users.noUsers')}
                  </td>
                </tr>
              ) : (
                filtered.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-semibold text-sm">
                          {user.full_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{user.full_name}</p>
                          <p className="text-xs text-gray-500">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${roleColors[user.role] ?? 'bg-gray-100 text-gray-700'}`}>
                        {t(`roles.${user.role}`)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 hidden md:table-cell">{companyName(user.company_id)}</td>
                    <td className="px-6 py-4 text-sm text-gray-600 hidden lg:table-cell">{user.phone || '-'}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${user.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {user.is_active ? t('common.active') : t('common.inactive')}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(user)} className="p-2 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors" title={t('common.edit')}>
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => toggleActive(user)} className={`p-2 rounded-lg transition-colors ${user.is_active ? 'text-green-500 hover:text-red-500 hover:bg-red-50' : 'text-red-400 hover:text-green-500 hover:bg-green-50'}`} title={user.is_active ? t('common.inactive') : t('common.active')}>
                          {user.is_active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                        </button>
                        <button onClick={() => handleDelete(user)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title={t('common.delete')}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-4 border-t border-gray-100">
          <p className="text-sm text-gray-500">{filtered.length} / {users.length} {t('superAdmin.users.title').toLowerCase()}</p>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
              <h2 className="text-lg font-semibold text-gray-900">{editingUser ? t('superAdmin.users.editUser') : t('superAdmin.users.addUser')}</h2>
              <button onClick={() => setShowModal(false)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-6 space-y-4">
              {!editingUser && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.email')}</label>
                    <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm" placeholder="email@shembull.com" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.password')}</label>
                    <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm" placeholder="Minimum 6 karaktere" />
                  </div>
                </>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.fullName')}</label>
                <input type="text" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm" placeholder={t('common.fullName')} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.role')}</label>
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole, depot_id: '' })}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm bg-white">
                  <option value="super_admin">{t('roles.super_admin')}</option>
                  <option value="company_admin">{t('roles.company_admin')}</option>
                  <option value="depot_worker">{t('roles.depot_worker')}</option>
                  <option value="driver">{t('roles.driver')}</option>
                </select>
              </div>
              {form.role !== 'super_admin' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.company')}</label>
                  <select value={form.company_id} onChange={(e) => setForm({ ...form, company_id: e.target.value, depot_id: '' })}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm bg-white">
                    <option value="">{t('superAdmin.users.selectCompany')}</option>
                    {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
              {form.role === 'depot_worker' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('superAdmin.users.selectDepot')}</label>
                  <select value={form.depot_id} onChange={(e) => setForm({ ...form, depot_id: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm bg-white">
                    <option value="">{t('superAdmin.users.selectDepot')}</option>
                    {filteredDepots.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.phone')}</label>
                <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm" placeholder="+383 4x xxx xxx" />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-4 sm:p-6 border-t border-gray-100 sticky bottom-0 bg-white rounded-b-2xl pb-[max(1rem,env(safe-area-inset-bottom))]">
              <button onClick={() => setShowModal(false)} className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">{t('common.cancel')}</button>
              <button onClick={handleSave} disabled={saving || !form.full_name.trim() || (!editingUser && (!form.email.trim() || !form.password.trim()))}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingUser ? t('common.saveChanges') : t('superAdmin.users.addUser')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
