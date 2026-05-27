import { useState, useEffect, useMemo } from 'react';
import {
  Warehouse,
  Plus,
  Search,
  CreditCard as Edit2,
  ToggleLeft,
  ToggleRight,
  X,
  AlertTriangle,
  Loader2,
  Wrench,
  User,
  ClipboardList,
  Trash2,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { useTranslation } from '../../i18n';
import type { Profile, Depot, ProductCategory } from '../../types';

type TabKey = 'depots' | 'managers' | 'repair' | 'repairLog';
type WorkerCategory = 'depoist' | 'reparature';

interface DepotForm {
  id?: string;
  name: string;
  address: string;
  phone: string;
  manager_id: string;
}

interface WorkerForm {
  id?: string;
  email: string;
  username: string;
  password: string;
  full_name: string;
  phone: string;
  depot_id: string;
  worker_category: WorkerCategory;
  create_login: boolean;
}

interface RepairLog {
  id: string;
  depot_id: string | null;
  worker_id: string | null;
  category_id: string | null;
  quantity_in: number;
  quantity_repaired: number;
  quantity_scrapped: number;
  notes: string;
  logged_at: string;
  depot?: { name: string } | null;
  worker?: { full_name: string } | null;
  category?: { name: string } | null;
}

interface RepairForm {
  id?: string;
  depot_id: string;
  worker_id: string;
  category_id: string;
  quantity_in: number;
  quantity_repaired: number;
  quantity_scrapped: number;
  notes: string;
  logged_at: string;
}

const emptyDepotForm: DepotForm = { name: '', address: '', phone: '', manager_id: '' };
const emptyWorkerForm: WorkerForm = {
  email: '',
  username: '',
  password: '',
  full_name: '',
  phone: '',
  depot_id: '',
  worker_category: 'depoist',
  create_login: true,
};
const emptyRepairForm: RepairForm = {
  depot_id: '',
  worker_id: '',
  category_id: '',
  quantity_in: 0,
  quantity_repaired: 0,
  quantity_scrapped: 0,
  notes: '',
  logged_at: new Date().toISOString().slice(0, 16),
};

export default function CompanyDepots() {
  const { profile, session } = useAuth();
  const { isWithinLimit, getLimit, logAudit } = useSubscription();
  const { t } = useTranslation();

  const [tab, setTab] = useState<TabKey>('depots');
  const [depots, setDepots] = useState<Depot[]>([]);
  const [workers, setWorkers] = useState<Profile[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [repairs, setRepairs] = useState<RepairLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [depotModal, setDepotModal] = useState(false);
  const [depotForm, setDepotForm] = useState<DepotForm>(emptyDepotForm);

  const [workerModal, setWorkerModal] = useState(false);
  const [workerEditing, setWorkerEditing] = useState<Profile | null>(null);
  const [workerForm, setWorkerForm] = useState<WorkerForm>(emptyWorkerForm);

  const [repairModal, setRepairModal] = useState(false);
  const [repairEditing, setRepairEditing] = useState<RepairLog | null>(null);
  const [repairForm, setRepairForm] = useState<RepairForm>(emptyRepairForm);

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile?.company_id) fetchAll();
  }, [profile?.company_id]);

  useEffect(() => {
    setSearch('');
  }, [tab]);

  async function fetchAll() {
    try {
      setLoading(true);
      setError(null);
      const companyId = profile!.company_id!;
      const [depotsRes, workersRes, catsRes, repairsRes] = await Promise.all([
        supabase.from('depots').select('*').eq('company_id', companyId).order('name'),
        supabase.from('profiles').select('*').eq('company_id', companyId).eq('role', 'depot_worker').order('full_name'),
        supabase.from('product_categories').select('*').eq('company_id', companyId).order('name'),
        supabase
          .from('depot_repairs')
          .select('*, depot:depots(name), worker:profiles(full_name), category:product_categories(name)')
          .eq('company_id', companyId)
          .order('logged_at', { ascending: false }),
      ]);
      if (depotsRes.error) throw depotsRes.error;
      if (workersRes.error) throw workersRes.error;
      setDepots((depotsRes.data ?? []) as Depot[]);
      setWorkers((workersRes.data ?? []) as Profile[]);
      setCategories((catsRes.data ?? []) as ProductCategory[]);
      setRepairs((repairsRes.data ?? []) as RepairLog[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const managers = useMemo(
    () => workers.filter((w) => (w.worker_category ?? 'depoist') === 'depoist'),
    [workers],
  );
  const repairWorkers = useMemo(
    () => workers.filter((w) => w.worker_category === 'reparature'),
    [workers],
  );

  function depotName(id: string | null | undefined) {
    if (!id) return '-';
    return depots.find((d) => d.id === id)?.name ?? '-';
  }

  async function saveDepot() {
    if (!depotForm.name.trim()) return;
    try {
      setSaving(true);
      setError(null);
      const companyId = profile!.company_id!;
      if (depotForm.id) {
        const { error: err } = await supabase
          .from('depots')
          .update({
            name: depotForm.name.trim(),
            address: depotForm.address.trim(),
            phone: depotForm.phone.trim(),
            manager_id: depotForm.manager_id || null,
          })
          .eq('id', depotForm.id);
        if (err) throw err;
        await logAudit('update', 'depot', depotForm.id, { name: depotForm.name });
      } else {
        const { data, error: err } = await supabase
          .from('depots')
          .insert({
            company_id: companyId,
            name: depotForm.name.trim(),
            address: depotForm.address.trim(),
            phone: depotForm.phone.trim(),
            manager_id: depotForm.manager_id || null,
            is_active: true,
          })
          .select()
          .maybeSingle();
        if (err) throw err;
        await logAudit('create', 'depot', data?.id, { name: depotForm.name });
      }
      setDepotModal(false);
      setDepotForm(emptyDepotForm);
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function deleteDepot(d: Depot) {
    const msg = t('company.depots.confirmDeleteDepot').replace('{name}', d.name);
    if (!window.confirm(msg)) return;
    try {
      setError(null);
      const { error: err } = await supabase.from('depots').delete().eq('id', d.id);
      if (err) throw err;
      await logAudit('delete', 'depot', d.id, { name: d.name });
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function toggleDepot(d: Depot) {
    try {
      const { error: err } = await supabase
        .from('depots')
        .update({ is_active: !d.is_active })
        .eq('id', d.id);
      if (err) throw err;
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function saveWorker() {
    if (!workerForm.full_name.trim()) return;
    try {
      setSaving(true);
      setError(null);

      if (workerEditing) {
        const { error: err } = await supabase
          .from('profiles')
          .update({
            full_name: workerForm.full_name.trim(),
            phone: workerForm.phone.trim(),
            depot_id: workerForm.depot_id || null,
            worker_category: workerForm.worker_category,
          })
          .eq('id', workerEditing.id);
        if (err) throw err;
        await logAudit('update', 'depot_worker', workerEditing.id, { name: workerForm.full_name });
      } else {
        const isRepair = workerForm.worker_category === 'reparature';
        // Depoist always needs an email login. Reparature can be either:
        //   create_login=true  + username + password  (worker can log in)
        //   create_login=false                         (profile-only, no login)
        if (!isRepair && (!workerForm.email.trim() || !workerForm.password.trim())) return;
        if (isRepair && workerForm.create_login) {
          if (!workerForm.username.trim() || !workerForm.password.trim()) return;
        }
        const activeWorkers = workers.filter((w) => w.is_active).length;
        if (!isWithinLimit('depots', activeWorkers)) {
          const limit = getLimit('depots');
          setError(t('companyAdmin.depots.errEmployeeLimit').replace('{limit}', String(limit)));
          setSaving(false);
          return;
        }
        const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users`;
        const payload: Record<string, unknown> = {
          full_name: workerForm.full_name,
          role: 'depot_worker',
          company_id: profile!.company_id,
          depot_id: workerForm.depot_id || null,
          phone: workerForm.phone,
          worker_category: workerForm.worker_category,
          create_login: isRepair ? workerForm.create_login : true,
        };
        if (!isRepair) {
          payload.email = workerForm.email;
          payload.password = workerForm.password;
        } else if (workerForm.create_login) {
          payload.username = workerForm.username.trim().toLowerCase();
          payload.password = workerForm.password;
        }
        const res = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || t('common.errorSaving'));
        await logAudit('create', 'depot_worker', data.user?.id, {
          name: workerForm.full_name,
          category: workerForm.worker_category,
        });
      }

      setWorkerModal(false);
      setWorkerEditing(null);
      setWorkerForm(emptyWorkerForm);
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function toggleWorker(w: Profile) {
    try {
      const { error: err } = await supabase
        .from('profiles')
        .update({ is_active: !w.is_active })
        .eq('id', w.id);
      if (err) throw err;
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function saveRepair() {
    if (!repairForm.category_id) return;
    try {
      setSaving(true);
      setError(null);
      const companyId = profile!.company_id!;
      const payload = {
        company_id: companyId,
        depot_id: repairForm.depot_id || null,
        worker_id: repairForm.worker_id || null,
        category_id: repairForm.category_id,
        quantity_in: repairForm.quantity_in,
        quantity_repaired: repairForm.quantity_repaired,
        quantity_scrapped: repairForm.quantity_scrapped,
        notes: repairForm.notes,
        logged_at: new Date(repairForm.logged_at).toISOString(),
      };
      if (repairEditing) {
        const { error: err } = await supabase
          .from('depot_repairs')
          .update(payload)
          .eq('id', repairEditing.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from('depot_repairs').insert(payload);
        if (err) throw err;
      }
      setRepairModal(false);
      setRepairEditing(null);
      setRepairForm(emptyRepairForm);
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function deleteRepair(id: string) {
    try {
      const { error: err } = await supabase.from('depot_repairs').delete().eq('id', id);
      if (err) throw err;
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function openWorkerAdd(category: WorkerCategory) {
    setWorkerEditing(null);
    setWorkerForm({ ...emptyWorkerForm, worker_category: category });
    setWorkerModal(true);
  }

  function openWorkerEdit(w: Profile) {
    setWorkerEditing(w);
    setWorkerForm({
      email: w.email,
      username: w.username || '',
      password: '',
      full_name: w.full_name,
      phone: w.phone || '',
      depot_id: w.depot_id || '',
      worker_category: (w.worker_category ?? 'depoist') as WorkerCategory,
      create_login: true,
    });
    setWorkerModal(true);
  }

  function openDepotAdd() {
    setDepotForm(emptyDepotForm);
    setDepotModal(true);
  }
  function openDepotEdit(d: Depot) {
    setDepotForm({
      id: d.id,
      name: d.name,
      address: d.address || '',
      phone: (d as any).phone || '',
      manager_id: d.manager_id || '',
    });
    setDepotModal(true);
  }

  function openRepairAdd() {
    setRepairEditing(null);
    setRepairForm({
      ...emptyRepairForm,
      logged_at: new Date().toISOString().slice(0, 16),
    });
    setRepairModal(true);
  }
  function openRepairEdit(r: RepairLog) {
    setRepairEditing(r);
    setRepairForm({
      id: r.id,
      depot_id: r.depot_id || '',
      worker_id: r.worker_id || '',
      category_id: r.category_id || '',
      quantity_in: r.quantity_in,
      quantity_repaired: r.quantity_repaired,
      quantity_scrapped: r.quantity_scrapped,
      notes: r.notes,
      logged_at: r.logged_at.slice(0, 16),
    });
    setRepairModal(true);
  }

  const filteredDepots = depots.filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase()),
  );
  const filteredManagers = managers.filter(
    (w) =>
      w.full_name.toLowerCase().includes(search.toLowerCase()) ||
      w.email.toLowerCase().includes(search.toLowerCase()),
  );
  const filteredRepair = repairWorkers.filter(
    (w) =>
      w.full_name.toLowerCase().includes(search.toLowerCase()) ||
      w.email.toLowerCase().includes(search.toLowerCase()),
  );
  const filteredRepairs = repairs.filter((r) => {
    const q = search.toLowerCase();
    return (
      !q ||
      r.category?.name?.toLowerCase().includes(q) ||
      r.worker?.full_name?.toLowerCase().includes(q) ||
      r.depot?.name?.toLowerCase().includes(q) ||
      r.notes?.toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600" />
      </div>
    );
  }

  const actionBtn = (() => {
    switch (tab) {
      case 'depots':
        return { label: t('company.depots.addDepotBtn'), onClick: openDepotAdd };
      case 'managers':
        return { label: t('company.depots.addManager'), onClick: () => openWorkerAdd('depoist') };
      case 'repair':
        return { label: t('company.depots.addRepair'), onClick: () => openWorkerAdd('reparature') };
      case 'repairLog':
        return { label: t('company.depots.logRepair'), onClick: openRepairAdd };
    }
  })();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('company.depots.title')}</h1>
          <p className="text-gray-500 mt-1">{t('company.depots.subtitle')}</p>
        </div>
        <button
          onClick={actionBtn.onClick}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium"
        >
          <Plus className="w-4 h-4" />
          {actionBtn.label}
        </button>
      </div>

      <div className="inline-flex flex-wrap bg-gray-100 rounded-lg p-1 gap-1">
        {(
          [
            { key: 'depots', label: t('company.depots.tabDepots'), icon: Warehouse },
            { key: 'managers', label: t('company.depots.tabManagers'), icon: User },
            { key: 'repair', label: t('company.depots.tabRepair'), icon: Wrench },
            { key: 'repairLog', label: t('company.depots.tabRepairLog'), icon: ClipboardList },
          ] as const
        ).map((x) => (
          <button
            key={x.key}
            onClick={() => setTab(x.key as TabKey)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === x.key
                ? 'bg-white text-teal-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <x.icon className="w-4 h-4" />
            {x.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-red-700 text-sm">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-4 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder={t('common.search') + '...'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
            />
          </div>
        </div>

        {tab === 'depots' && (
          <DepotTable
            items={filteredDepots}
            onEdit={openDepotEdit}
            onToggle={toggleDepot}
            onDelete={deleteDepot}
            managerName={(id) => workers.find((w) => w.id === id)?.full_name ?? '-'}
            t={t}
          />
        )}
        {tab === 'managers' && (
          <WorkerTable
            items={filteredManagers}
            onEdit={openWorkerEdit}
            onToggle={toggleWorker}
            depotName={depotName}
            t={t}
          />
        )}
        {tab === 'repair' && (
          <WorkerTable
            items={filteredRepair}
            onEdit={openWorkerEdit}
            onToggle={toggleWorker}
            depotName={depotName}
            t={t}
            showEmail={false}
          />
        )}
        {tab === 'repairLog' && (
          <RepairLogTable
            items={filteredRepairs}
            onEdit={openRepairEdit}
            onDelete={deleteRepair}
            t={t}
          />
        )}
      </div>

      {depotModal && (
        <Modal
          title={depotForm.id ? t('company.depots.editDepot') : t('company.depots.addDepot')}
          onClose={() => setDepotModal(false)}
          onSave={saveDepot}
          saving={saving}
          disabled={!depotForm.name.trim()}
          t={t}
        >
          <Field label={t('company.depots.depotName')}>
            <input
              type="text"
              value={depotForm.name}
              onChange={(e) => setDepotForm({ ...depotForm, name: e.target.value })}
              className="input"
              placeholder={t('company.depots.depotNamePlaceholder')}
            />
          </Field>
          <Field label={t('common.address')}>
            <input
              type="text"
              value={depotForm.address}
              onChange={(e) => setDepotForm({ ...depotForm, address: e.target.value })}
              className="input"
            />
          </Field>
          <Field label={t('common.phone')}>
            <input
              type="text"
              value={depotForm.phone}
              onChange={(e) => setDepotForm({ ...depotForm, phone: e.target.value })}
              className="input"
            />
          </Field>
          <Field label={t('company.depots.manager')}>
            <select
              value={depotForm.manager_id}
              onChange={(e) => setDepotForm({ ...depotForm, manager_id: e.target.value })}
              className="input"
            >
              <option value="">-</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name}
                </option>
              ))}
            </select>
          </Field>
        </Modal>
      )}

      {workerModal && (
        <Modal
          title={
            workerEditing
              ? t('common.edit')
              : workerForm.worker_category === 'reparature'
                ? t('company.depots.addRepair')
                : t('company.depots.addManager')
          }
          onClose={() => setWorkerModal(false)}
          onSave={saveWorker}
          saving={saving}
          disabled={
            !workerForm.full_name.trim() ||
            (!workerEditing && workerForm.worker_category !== 'reparature' &&
              (!workerForm.email.trim() || !workerForm.password.trim())) ||
            (!workerEditing && workerForm.worker_category === 'reparature' && workerForm.create_login &&
              (!workerForm.username.trim() || !workerForm.password.trim()))
          }
          t={t}
        >
          {!workerEditing && workerForm.worker_category !== 'reparature' && (
            <>
              <Field label={t('common.email')}>
                <input
                  type="email"
                  value={workerForm.email}
                  onChange={(e) => setWorkerForm({ ...workerForm, email: e.target.value })}
                  className="input"
                />
              </Field>
              <Field label={t('common.password')}>
                <input
                  type="password"
                  value={workerForm.password}
                  onChange={(e) => setWorkerForm({ ...workerForm, password: e.target.value })}
                  className="input"
                />
              </Field>
            </>
          )}
          {!workerEditing && workerForm.worker_category === 'reparature' && (
            <>
              <Field label="A deshironi te krijoni llogari?">
                <label className="flex items-center gap-2 text-sm text-slate-700 mt-1">
                  <input
                    type="checkbox"
                    checked={workerForm.create_login}
                    onChange={(e) => setWorkerForm({ ...workerForm, create_login: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                  />
                  Po, krijo username dhe fjalekalim per kete reparator
                </label>
                <p className="text-xs text-slate-500 mt-1">
                  Nese e leni te zbrazet, punetori ekziston vetem per gjurmim ne raporte (pa qasje ne llogari).
                </p>
              </Field>
              {workerForm.create_login && (
                <>
                  <Field label="Username">
                    <input
                      type="text"
                      autoComplete="off"
                      value={workerForm.username}
                      onChange={(e) => setWorkerForm({ ...workerForm, username: e.target.value.replace(/[^a-zA-Z0-9._-]/g, '').toLowerCase() })}
                      placeholder="p.sh. agimi"
                      className="input"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">3-32 karaktere · vetem shkronja, numra, . _ -</p>
                  </Field>
                  <Field label={t('common.password')}>
                    <input
                      type="password"
                      value={workerForm.password}
                      onChange={(e) => setWorkerForm({ ...workerForm, password: e.target.value })}
                      className="input"
                    />
                  </Field>
                </>
              )}
            </>
          )}
          <Field label={t('common.fullName')}>
            <input
              type="text"
              value={workerForm.full_name}
              onChange={(e) => setWorkerForm({ ...workerForm, full_name: e.target.value })}
              className="input"
            />
          </Field>
          <Field label={t('common.phone')}>
            <input
              type="text"
              value={workerForm.phone}
              onChange={(e) => setWorkerForm({ ...workerForm, phone: e.target.value })}
              className="input"
            />
          </Field>
          <Field label={t('company.depots.workerCategory')}>
            <select
              value={workerForm.worker_category}
              onChange={(e) =>
                setWorkerForm({ ...workerForm, worker_category: e.target.value as WorkerCategory })
              }
              className="input"
            >
              <option value="depoist">{t('company.depots.tabManagers')}</option>
              <option value="reparature">{t('company.depots.tabRepair')}</option>
            </select>
          </Field>
          <Field label={t('company.depots.assignDepot')}>
            <select
              value={workerForm.depot_id}
              onChange={(e) => setWorkerForm({ ...workerForm, depot_id: e.target.value })}
              className="input"
            >
              <option value="">-</option>
              {depots
                .filter((d) => d.is_active)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
            </select>
          </Field>
        </Modal>
      )}

      {repairModal && (
        <Modal
          title={repairEditing ? t('common.edit') : t('company.depots.logRepair')}
          onClose={() => setRepairModal(false)}
          onSave={saveRepair}
          saving={saving}
          disabled={!repairForm.category_id}
          t={t}
        >
          <Field label={t('company.depots.logDate')}>
            <input
              type="datetime-local"
              value={repairForm.logged_at}
              onChange={(e) => setRepairForm({ ...repairForm, logged_at: e.target.value })}
              className="input"
            />
          </Field>
          <Field label={t('company.depots.tabDepots')}>
            <select
              value={repairForm.depot_id}
              onChange={(e) => setRepairForm({ ...repairForm, depot_id: e.target.value })}
              className="input"
            >
              <option value="">-</option>
              {depots.filter((d) => d.is_active).map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </Field>
          <Field label={t('company.depots.tabRepair')}>
            <select
              value={repairForm.worker_id}
              onChange={(e) => setRepairForm({ ...repairForm, worker_id: e.target.value })}
              className="input"
            >
              <option value="">-</option>
              {repairWorkers.filter((w) => w.is_active).map((w) => (
                <option key={w.id} value={w.id}>{w.full_name}</option>
              ))}
            </select>
          </Field>
          <Field label={t('company.stock.category')}>
            <select
              value={repairForm.category_id}
              onChange={(e) => setRepairForm({ ...repairForm, category_id: e.target.value })}
              className="input"
            >
              <option value="">-</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label={t('company.depots.quantityIn')}>
              <input
                type="number"
                min={0}
                value={repairForm.quantity_in}
                onChange={(e) =>
                  setRepairForm({ ...repairForm, quantity_in: parseInt(e.target.value) || 0 })
                }
                className="input"
              />
            </Field>
            <Field label={t('company.depots.quantityRepaired')}>
              <input
                type="number"
                min={0}
                value={repairForm.quantity_repaired}
                onChange={(e) =>
                  setRepairForm({ ...repairForm, quantity_repaired: parseInt(e.target.value) || 0 })
                }
                className="input"
              />
            </Field>
            <Field label={t('company.depots.quantityScrapped')}>
              <input
                type="number"
                min={0}
                value={repairForm.quantity_scrapped}
                onChange={(e) =>
                  setRepairForm({ ...repairForm, quantity_scrapped: parseInt(e.target.value) || 0 })
                }
                className="input"
              />
            </Field>
          </div>
          <Field label={t('company.deliveryNotes.notes')}>
            <textarea
              value={repairForm.notes}
              onChange={(e) => setRepairForm({ ...repairForm, notes: e.target.value })}
              rows={2}
              className="input resize-none"
            />
          </Field>
        </Modal>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

interface ModalProps {
  title: string;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  t: (k: string) => string;
}

function Modal({ title, onClose, onSave, saving, disabled, children, t }: ModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <style>{`.input{width:100%;padding:.625rem .75rem;border:1px solid #e5e7eb;border-radius:.5rem;font-size:.875rem;outline:none;background:#fff}.input:focus{box-shadow:0 0 0 2px #14b8a6;border-color:transparent}`}</style>
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">{children}</div>
        <div className="flex items-center justify-end gap-3 p-4 sm:p-6 border-t border-gray-100 sticky bottom-0 bg-white pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={onSave}
            disabled={saving || disabled}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {t('common.saveChanges')}
          </button>
        </div>
      </div>
    </div>
  );
}

function DepotTable({
  items,
  onEdit,
  onToggle,
  onDelete,
  managerName,
  t,
}: {
  items: Depot[];
  onEdit: (d: Depot) => void;
  onToggle: (d: Depot) => void;
  onDelete: (d: Depot) => void;
  managerName: (id: string | null | undefined) => string;
  t: (k: string) => string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-100">
            <Th>{t('company.depots.depotName')}</Th>
            <Th className="hidden md:table-cell">{t('common.address')}</Th>
            <Th>{t('company.depots.manager')}</Th>
            <Th>{t('common.status')}</Th>
            <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {t('common.edit')}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {items.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                <Warehouse className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                {t('common.noResults')}
              </td>
            </tr>
          ) : (
            items.map((d) => (
              <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-teal-100 flex items-center justify-center">
                      <Warehouse className="w-4 h-4 text-teal-600" />
                    </div>
                    <span className="text-sm font-medium text-gray-900">{d.name}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600 hidden md:table-cell">
                  {d.address || '-'}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">{managerName(d.manager_id)}</td>
                <td className="px-6 py-4">
                  <StatusBadge active={d.is_active} t={t} />
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center justify-end gap-1">
                    <IconBtn onClick={() => onEdit(d)} title={t('common.edit')} color="teal">
                      <Edit2 className="w-4 h-4" />
                    </IconBtn>
                    <ToggleBtn active={d.is_active} onClick={() => onToggle(d)} />
                    <IconBtn onClick={() => onDelete(d)} title={t('common.delete')} color="red">
                      <Trash2 className="w-4 h-4" />
                    </IconBtn>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function WorkerTable({
  items,
  onEdit,
  onToggle,
  depotName,
  t,
  showEmail = true,
}: {
  items: Profile[];
  onEdit: (w: Profile) => void;
  onToggle: (w: Profile) => void;
  depotName: (id: string | null | undefined) => string;
  t: (k: string) => string;
  showEmail?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-100">
            <Th>{t('common.name')}</Th>
            {showEmail && <Th className="hidden md:table-cell">{t('common.email')}</Th>}
            <Th>{t('company.depots.tabDepots')}</Th>
            <Th>{t('common.status')}</Th>
            <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {t('common.edit')}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {items.length === 0 ? (
            <tr>
              <td colSpan={showEmail ? 5 : 4} className="px-6 py-12 text-center text-gray-400">
                <User className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                {t('common.noResults')}
              </td>
            </tr>
          ) : (
            items.map((w) => (
              <tr key={w.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-teal-100 flex items-center justify-center">
                      {w.worker_category === 'reparature' ? (
                        <Wrench className="w-4 h-4 text-teal-600" />
                      ) : (
                        <User className="w-4 h-4 text-teal-600" />
                      )}
                    </div>
                    <span className="text-sm font-medium text-gray-900">{w.full_name}</span>
                  </div>
                </td>
                {showEmail && (
                  <td className="px-6 py-4 text-sm text-gray-600 hidden md:table-cell">{w.email}</td>
                )}
                <td className="px-6 py-4 text-sm text-gray-600">{depotName(w.depot_id)}</td>
                <td className="px-6 py-4">
                  <StatusBadge active={w.is_active} t={t} />
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center justify-end gap-1">
                    <IconBtn onClick={() => onEdit(w)} title={t('common.edit')} color="teal">
                      <Edit2 className="w-4 h-4" />
                    </IconBtn>
                    <ToggleBtn active={w.is_active} onClick={() => onToggle(w)} />
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function RepairLogTable({
  items,
  onEdit,
  onDelete,
  t,
}: {
  items: RepairLog[];
  onEdit: (r: RepairLog) => void;
  onDelete: (id: string) => void;
  t: (k: string) => string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-100">
            <Th>{t('company.depots.logDate')}</Th>
            <Th>{t('company.depots.tabRepair')}</Th>
            <Th className="hidden md:table-cell">{t('company.depots.tabDepots')}</Th>
            <Th>{t('company.stock.category')}</Th>
            <Th className="text-right">{t('company.depots.quantityIn')}</Th>
            <Th className="text-right">{t('company.depots.quantityRepaired')}</Th>
            <Th className="text-right">{t('company.depots.quantityScrapped')}</Th>
            <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {t('common.actions')}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {items.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-6 py-12 text-center text-gray-400">
                <Wrench className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                {t('common.noResults')}
              </td>
            </tr>
          ) : (
            items.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 text-sm text-gray-600">
                  {new Date(r.logged_at).toLocaleString()}
                </td>
                <td className="px-6 py-4 text-sm font-medium text-gray-900">
                  {r.worker?.full_name ?? '-'}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600 hidden md:table-cell">
                  {r.depot?.name ?? '-'}
                </td>
                <td className="px-6 py-4 text-sm text-gray-900">{r.category?.name ?? '-'}</td>
                <td className="px-6 py-4 text-sm text-right text-gray-900">{r.quantity_in}</td>
                <td className="px-6 py-4 text-sm text-right text-green-700 font-semibold">
                  {r.quantity_repaired}
                </td>
                <td className="px-6 py-4 text-sm text-right text-red-700 font-semibold">
                  {r.quantity_scrapped}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center justify-end gap-1">
                    <IconBtn onClick={() => onEdit(r)} title={t('common.edit')} color="teal">
                      <Edit2 className="w-4 h-4" />
                    </IconBtn>
                    <IconBtn onClick={() => onDelete(r.id)} title={t('common.delete')} color="red">
                      <Trash2 className="w-4 h-4" />
                    </IconBtn>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider ${className}`}>
      {children}
    </th>
  );
}

function StatusBadge({ active, t }: { active: boolean; t: (k: string) => string }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
        active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
      }`}
    >
      {active ? t('common.active') : t('common.inactive')}
    </span>
  );
}

function IconBtn({
  onClick,
  title,
  color,
  children,
}: {
  onClick: () => void;
  title: string;
  color: 'teal' | 'red';
  children: React.ReactNode;
}) {
  const cls =
    color === 'teal'
      ? 'text-gray-400 hover:text-teal-600 hover:bg-teal-50'
      : 'text-gray-400 hover:text-red-600 hover:bg-red-50';
  return (
    <button onClick={onClick} title={title} className={`p-2 rounded-lg transition-colors ${cls}`}>
      {children}
    </button>
  );
}

function ToggleBtn({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`p-2 rounded-lg transition-colors ${
        active
          ? 'text-green-500 hover:text-red-500 hover:bg-red-50'
          : 'text-red-400 hover:text-green-500 hover:bg-green-50'
      }`}
    >
      {active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
    </button>
  );
}
