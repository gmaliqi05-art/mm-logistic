import { useState, useEffect, useCallback } from 'react';
import { Users as UsersIcon, Search, Filter, Plus, CreditCard as Edit2, ToggleLeft, ToggleRight, X, AlertTriangle, Loader2, Trash2, Shield, Calendar, Building2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import type { Profile, Company, Depot, UserRole } from '../../types';

const roleColors: Record<string, string> = {
  super_admin: 'bg-red-100 text-red-700',
  company_admin: 'bg-teal-100 text-teal-700',
  depot_worker: 'bg-amber-100 text-amber-700',
  driver: 'bg-blue-100 text-blue-700',
  accountant: 'bg-cyan-100 text-cyan-700',
  logistics_admin: 'bg-slate-100 text-slate-700',
};

const subStatusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  trial: 'bg-teal-100 text-teal-700',
  pending_payment: 'bg-amber-100 text-amber-700',
  expired: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-100 text-slate-600',
  past_due: 'bg-orange-100 text-orange-700',
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

interface CompanySub {
  company_id: string;
  status: string;
}

interface DeleteTarget {
  user: Profile;
  companyName: string;
  subStatus: string;
  stats: { deliveryNotes: number; invoices: number; stockMovements: number };
}

export default function SuperAdminUsers() {
  const { session } = useAuth();
  const { t } = useTranslation();
  const [users, setUsers] = useState<Profile[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [depots, setDepots] = useState<Depot[]>([]);
  const [companySubs, setCompanySubs] = useState<CompanySub[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteCompanyToo, setDeleteCompanyToo] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [usersRes, companiesRes, depotsRes, subsRes] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('companies').select('*').order('name'),
      supabase.from('depots').select('*').eq('is_active', true).order('name'),
      supabase.from('company_subscriptions').select('company_id, status').order('created_at', { ascending: false }),
    ]);
    if (usersRes.data) setUsers(usersRes.data);
    if (companiesRes.data) setCompanies(companiesRes.data);
    if (depotsRes.data) setDepots(depotsRes.data);
    if (subsRes.data) setCompanySubs(subsRes.data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      if (editingUser) {
        const { error: updateError } = await supabase.from('profiles').update({
          full_name: form.full_name, role: form.role,
          company_id: form.company_id || null, depot_id: form.depot_id || null,
          phone: form.phone,
        }).eq('id', editingUser.id);
        if (updateError) throw new Error(updateError.message);
      } else {
        const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users`;
        const res = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json', 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY },
          body: JSON.stringify({ email: form.email, password: form.password, full_name: form.full_name, role: form.role, company_id: form.company_id || undefined, depot_id: form.depot_id || undefined, phone: form.phone || undefined }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || t('common.error'));
      }
      setShowModal(false);
      await fetchData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(user: Profile) {
    try {
      const { error: updateError } = await supabase.from('profiles').update({ is_active: !user.is_active }).eq('id', user.id);
      if (updateError) throw new Error(updateError.message);
      await fetchData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function openDeleteModal(user: Profile) {
    const cName = companies.find((c) => c.id === user.company_id)?.name || '';
    const sub = companySubs.find((s) => s.company_id === user.company_id);

    let stats = { deliveryNotes: 0, invoices: 0, stockMovements: 0 };
    if (user.company_id) {
      const [dn, inv, sm] = await Promise.all([
        supabase.from('delivery_notes').select('id', { count: 'exact', head: true }).eq('company_id', user.company_id),
        supabase.from('acc_invoices').select('id', { count: 'exact', head: true }).eq('company_id', user.company_id),
        supabase.from('stock_movements').select('id', { count: 'exact', head: true }).eq('company_id', user.company_id),
      ]);
      stats = {
        deliveryNotes: dn.count ?? 0,
        invoices: inv.count ?? 0,
        stockMovements: sm.count ?? 0,
      };
    }

    setDeleteTarget({ user, companyName: cName, subStatus: sub?.status || '', stats });
    setDeleteCompanyToo(false);
    setDeleteConfirmText('');
  }

  async function executeDelete() {
    if (!deleteTarget || deleteConfirmText !== 'FSHI') return;
    setDeleting(true);
    setError(null);
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users`;
      const res = await fetch(apiUrl, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json', 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY },
        body: JSON.stringify({
          user_id: deleteTarget.user.id,
          hard_delete: true,
          delete_company: deleteCompanyToo,
        }),
      });
      const data = await res.json();
      if (!res.ok && res.status !== 207) throw new Error(data.error || t('common.error'));
      setDeleteTarget(null);
      await fetchData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setDeleting(false);
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

  const getCompanySub = (companyId: string | null) => {
    if (!companyId) return null;
    return companySubs.find((s) => s.company_id === companyId) || null;
  };

  const filtered = users.filter((u) => {
    const matchesSearch = u.full_name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    const matchesCompany = companyFilter === 'all' || u.company_id === companyFilter;
    return matchesSearch && matchesRole && matchesCompany;
  });

  const companyName = (id: string | null) => companies.find((c) => c.id === id)?.name || '-';
  const filteredDepots = form.company_id ? depots.filter((d) => d.company_id === form.company_id) : depots;

  const formatDate = (d: string | null) => {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('sq-AL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

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
              <option value="accountant">{t('roles.accountant')}</option>
            </select>
          </div>
          <div className="relative">
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}
              className="pl-10 pr-8 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm appearance-none bg-white max-w-[200px]">
              <option value="all">{t('superAdmin.users.allCompanies')}</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
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
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">{t('superAdmin.users.registered')}</th>
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
                filtered.map((user) => {
                  const sub = getCompanySub(user.company_id);
                  return (
                    <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-semibold text-sm flex-shrink-0">
                            {user.full_name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{user.full_name}</p>
                            <p className="text-xs text-gray-500 truncate">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${roleColors[user.role] ?? 'bg-gray-100 text-gray-700'}`}>
                          {t(`roles.${user.role}`)}
                        </span>
                      </td>
                      <td className="px-6 py-4 hidden md:table-cell">
                        <div>
                          <p className="text-sm text-gray-600 truncate max-w-[160px]">{companyName(user.company_id)}</p>
                          {sub && (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium mt-0.5 ${subStatusColors[sub.status] ?? 'bg-gray-100 text-gray-600'}`}>
                              {t(`superAdmin.users.sub_${sub.status}`)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 hidden lg:table-cell">
                        <div className="flex items-center gap-1.5 text-sm text-gray-500">
                          <Calendar className="w-3.5 h-3.5" />
                          {formatDate(user.created_at)}
                        </div>
                      </td>
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
                          <button onClick={() => openDeleteModal(user)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title={t('common.delete')}>
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-4 border-t border-gray-100">
          <p className="text-sm text-gray-500">{filtered.length} / {users.length} {t('superAdmin.users.title').toLowerCase()}</p>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => !deleting && setDeleteTarget(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3 p-6 border-b border-gray-100">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <Shield className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{t('superAdmin.users.deleteTitle')}</h2>
                <p className="text-sm text-gray-500">{t('superAdmin.users.deleteSubtitle')}</p>
              </div>
              <button onClick={() => !deleting && setDeleteTarget(null)} className="ml-auto p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* User info card */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-bold">
                    {deleteTarget.user.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{deleteTarget.user.full_name}</p>
                    <p className="text-sm text-gray-500">{deleteTarget.user.email}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-gray-500">{t('common.role')}:</span> <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${roleColors[deleteTarget.user.role] ?? 'bg-gray-100 text-gray-700'}`}>{t(`roles.${deleteTarget.user.role}`)}</span></div>
                  <div><span className="text-gray-500">{t('common.company')}:</span> <span className="font-medium text-gray-700">{deleteTarget.companyName || '-'}</span></div>
                  <div><span className="text-gray-500">{t('superAdmin.users.registered')}:</span> <span className="font-medium text-gray-700">{formatDate(deleteTarget.user.created_at)}</span></div>
                  {deleteTarget.subStatus && (
                    <div><span className="text-gray-500">{t('superAdmin.users.subscription')}:</span> <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${subStatusColors[deleteTarget.subStatus] ?? 'bg-gray-100 text-gray-600'}`}>{t(`superAdmin.users.sub_${deleteTarget.subStatus}`)}</span></div>
                  )}
                </div>
              </div>

              {/* Data warning */}
              {(deleteTarget.stats.deliveryNotes > 0 || deleteTarget.stats.invoices > 0 || deleteTarget.stats.stockMovements > 0) && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-800">{t('superAdmin.users.dataWarning')}</p>
                      <ul className="mt-2 text-sm text-amber-700 space-y-1">
                        {deleteTarget.stats.deliveryNotes > 0 && (
                          <li>{deleteTarget.stats.deliveryNotes} {t('superAdmin.users.deliveryNotes')}</li>
                        )}
                        {deleteTarget.stats.invoices > 0 && (
                          <li>{deleteTarget.stats.invoices} {t('superAdmin.users.invoices')}</li>
                        )}
                        {deleteTarget.stats.stockMovements > 0 && (
                          <li>{deleteTarget.stats.stockMovements} {t('superAdmin.users.stockMovements')}</li>
                        )}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Delete company option */}
              {deleteTarget.user.company_id && deleteTarget.user.role === 'company_admin' && (
                <label className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl cursor-pointer hover:bg-red-100/60 transition-colors">
                  <input
                    type="checkbox"
                    checked={deleteCompanyToo}
                    onChange={(e) => setDeleteCompanyToo(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-red-300 text-red-600 focus:ring-red-500"
                  />
                  <div>
                    <p className="text-sm font-medium text-red-800">{t('superAdmin.users.deleteCompanyToo')}</p>
                    <p className="text-xs text-red-600 mt-0.5">
                      {t('superAdmin.users.deleteCompanyWarning').replace('{name}', deleteTarget.companyName)}
                    </p>
                  </div>
                </label>
              )}

              {/* Confirmation input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t('superAdmin.users.typeToConfirm')}
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="FSHI"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm font-mono tracking-widest"
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-100">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={executeDelete}
                disabled={deleting || deleteConfirmText !== 'FSHI'}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t('superAdmin.users.deleting')}
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    {t('superAdmin.users.deletePermanently')}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
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
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm" placeholder={t('common.emailExampleAlias')} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.password')}</label>
                    <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm" placeholder="Minimum 8 karaktere" />
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
