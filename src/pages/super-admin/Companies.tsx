import { useState, useEffect, useRef } from 'react';
import { Building2, Search, CreditCard as Edit2, ToggleLeft, ToggleRight, X, AlertTriangle, Loader2, Filter, Zap, Star, Shield, Clock, Settings, Upload, Image as ImageIcon } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PageSkeleton } from '../../components/ui/Skeleton';
import { useTranslation } from '../../i18n';
import CompanyFeaturesManager from '../../components/subscription/CompanyFeaturesManager';

interface CompanyWithSub {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  logo_url?: string;
  is_active: boolean;
  created_at: string;
  subscription?: {
    status: string;
    trial_end: string | null;
    current_period_end: string | null;
    payment_method: string;
    plan?: { name: string; display_name: string; price_monthly: number };
  };
}

const planIcons: Record<string, typeof Zap> = {
  free_trial: Zap,
  standard: Star,
  premium: Shield,
};

export default function SuperAdminCompanies() {
  const { t } = useTranslation();

  const statusLabels: Record<string, { label: string; className: string }> = {
    trial: { label: t('superAdmin.dashboard.expiringTrials'), className: 'bg-amber-100 text-amber-700' },
    active: { label: t('common.active'), className: 'bg-green-100 text-green-700' },
    expired: { label: t('superAdmin.companies.allPlans'), className: 'bg-red-100 text-red-700' },
    cancelled: { label: t('common.cancel'), className: 'bg-gray-100 text-gray-700' },
    pending_payment: { label: 'Pending Payment', className: 'bg-orange-100 text-orange-700' },
    past_due: { label: 'Past Due', className: 'bg-red-100 text-red-700' },
  };

  const paymentMethodLabels: Record<string, { label: string; className: string }> = {
    free: { label: 'Free', className: 'bg-gray-100 text-gray-600' },
    pending: { label: 'Not Paid', className: 'bg-orange-100 text-orange-700' },
    stripe: { label: 'Stripe', className: 'bg-green-100 text-green-700' },
    manual: { label: 'Manual', className: 'bg-blue-100 text-blue-700' },
  };

  const [companies, setCompanies] = useState<CompanyWithSub[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [editingCompany, setEditingCompany] = useState<CompanyWithSub | null>(null);
  const [featureManagingCompany, setFeatureManagingCompany] = useState<CompanyWithSub | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  // Per-row toggle lock — set to the company.id while its is_active
  // UPDATE is in flight so the row's button can't fire a second toggle
  // before the first settles. Audit finding K9.
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchCompanies();
  }, []);

  async function fetchCompanies() {
    try {
      setLoading(true);
      setError(null);

      const { data: companiesData, error: compErr } = await supabase
        .from('companies')
        .select('*')
        .order('created_at', { ascending: false });

      if (compErr) throw compErr;

      const { data: subsData } = await supabase
        .from('company_subscriptions')
        .select('company_id, status, trial_end, current_period_end, payment_method, plan:subscription_plans(name, display_name, price_monthly)');

      const subMap = new Map<string, CompanyWithSub['subscription']>();
      (subsData ?? []).forEach((s: Record<string, unknown>) => {
        subMap.set(s.company_id as string, {
          status: s.status as string,
          trial_end: s.trial_end as string | null,
          current_period_end: s.current_period_end as string | null,
          payment_method: (s.payment_method as string) || 'free',
          plan: s.plan as CompanyWithSub['subscription'] extends undefined ? never : NonNullable<CompanyWithSub['subscription']>['plan'],
        });
      });

      const merged: CompanyWithSub[] = (companiesData ?? []).map((c) => ({
        ...c,
        subscription: subMap.get(c.id),
      }));

      setCompanies(merged);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.errorLoading'));
    } finally {
      setLoading(false);
    }
  }

  async function toggleStatus(company: CompanyWithSub) {
    // Defensive: ignore re-entrant clicks on the same row while the
    // previous UPDATE is still in flight. The button is also disabled
    // in the JSX below, but the keyboard activation path (Enter while
    // focused) can still bypass that on some browsers.
    if (togglingId === company.id) return;
    setTogglingId(company.id);
    try {
      const { error: err } = await supabase
        .from('companies')
        .update({ is_active: !company.is_active })
        .eq('id', company.id);
      if (err) throw err;
      await fetchCompanies();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setTogglingId(null);
    }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !editingCompany) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setError(t('superAdmin.companies.uploadImage') || 'Ju lutem ngarkoni një imazh (JPEG, PNG, GIF, WEBP)');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setError(t('superAdmin.companies.imageMax2MB') || 'Imazhi duhet të jetë më i vogël se 2MB');
      return;
    }

    try {
      setUploading(true);
      setError(null);

      const fileExt = file.name.split('.').pop();
      const fileName = `${editingCompany.id}-${Date.now()}.${fileExt}`;
      const filePath = `company-logos/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('attachments')
        .getPublicUrl(filePath);

      setEditingCompany({ ...editingCompany, logo_url: urlData.publicUrl });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.logoUploadFailed'));
    } finally {
      setUploading(false);
    }
  }

  async function handleSaveEdit() {
    if (!editingCompany) return;
    try {
      setSaving(true);
      const { error: err } = await supabase
        .from('companies')
        .update({
          name: editingCompany.name,
          email: editingCompany.email,
          phone: editingCompany.phone,
          address: editingCompany.address,
          logo_url: editingCompany.logo_url || '',
        })
        .eq('id', editingCompany.id);
      if (err) throw err;
      setEditingCompany(null);
      await fetchCompanies();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.errorSaving'));
    } finally {
      setSaving(false);
    }
  }

  const filtered = companies.filter((c) => {
    const matchSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase());
    const matchStatus =
      statusFilter === 'all' || c.subscription?.status === statusFilter;
    return matchSearch && matchStatus;
  });

  function daysRemaining(dateStr: string | null | undefined) {
    if (!dateStr) return null;
    const diff = new Date(dateStr).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  if (loading) {
    return <PageSkeleton rows={10} cols={6} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('superAdmin.companies.title')}</h1>
        <p className="text-gray-500 mt-1">{t('superAdmin.companies.subtitle')}</p>
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
        <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder={t('superAdmin.companies.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="pl-10 pr-8 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm appearance-none bg-white"
            >
              <option value="all">{t('common.allStatuses')}</option>
              <option value="trial">{t('superAdmin.dashboard.expiringTrials')}</option>
              <option value="active">{t('common.active')}</option>
              <option value="expired">{t('superAdmin.companies.allPlans')}</option>
              <option value="cancelled">{t('common.cancel')}</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('common.company')}</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('superAdmin.companies.allPlans')}</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">{t('common.status')}</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Payment</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">{t('superAdmin.dashboard.expiringTrials')}</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">{t('superAdmin.plans.monthlyPrice')}</th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('common.edit')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                    <Building2 className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                    {t('superAdmin.companies.noCompanies')}
                  </td>
                </tr>
              ) : (
                filtered.map((company) => {
                  const planName = company.subscription?.plan?.name ?? '';
                  const PlanIcon = planIcons[planName] || Building2;
                  const statusCfg = statusLabels[company.subscription?.status ?? ''];
                  const endDate = company.subscription?.status === 'trial'
                    ? company.subscription?.trial_end
                    : company.subscription?.current_period_end;
                  const days = daysRemaining(endDate);

                  return (
                    <tr key={company.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-teal-100 flex items-center justify-center">
                            <PlanIcon className="w-4 h-4 text-teal-600" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{company.name}</p>
                            <p className="text-xs text-gray-500">{company.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-700 font-medium">
                          {company.subscription?.plan?.display_name ?? t('superAdmin.plans.noPlans')}
                        </span>
                      </td>
                      <td className="px-6 py-4 hidden md:table-cell">
                        {statusCfg ? (
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusCfg.className}`}>
                            {statusCfg.label}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 hidden md:table-cell">
                        {(() => {
                          const pm = company.subscription?.payment_method ?? 'free';
                          const pmCfg = paymentMethodLabels[pm] || paymentMethodLabels.free;
                          return (
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${pmCfg.className}`}>
                              {pmCfg.label}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-6 py-4 hidden lg:table-cell">
                        {days !== null ? (
                          <div className="flex items-center gap-1.5">
                            <Clock className={`w-3.5 h-3.5 ${days <= 7 ? 'text-amber-500' : 'text-gray-400'}`} />
                            <span className={`text-sm ${days <= 7 ? 'text-amber-600 font-medium' : 'text-gray-600'}`}>
                              {days} {t('superAdmin.plans.trialDays').toLowerCase()}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 hidden lg:table-cell">
                        <span className="text-sm font-medium text-gray-700">
                          {company.subscription?.plan?.price_monthly
                            ? `${company.subscription.plan.price_monthly}\u20AC/${t('common.month')}`
                            : t('common.free')}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setFeatureManagingCompany(company)}
                            className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                            title="Manage Premium Features"
                          >
                            <Settings className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setEditingCompany({ ...company })}
                            className="p-2 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                            title={t('common.edit')}
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => toggleStatus(company)}
                            disabled={togglingId === company.id}
                            className={`p-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                              company.is_active
                                ? 'text-green-500 hover:text-red-500 hover:bg-red-50'
                                : 'text-red-400 hover:text-green-500 hover:bg-green-50'
                            }`}
                            title={company.is_active ? t('common.inactive') : t('common.active')}
                          >
                            {togglingId === company.id
                              ? <Loader2 className="w-5 h-5 animate-spin" />
                              : company.is_active
                                ? <ToggleRight className="w-5 h-5" />
                                : <ToggleLeft className="w-5 h-5" />}
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
          <p className="text-sm text-gray-500">
            {filtered.length} / {companies.length} {t('superAdmin.companies.title').toLowerCase()}
          </p>
        </div>
      </div>

      {featureManagingCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="fixed inset-0 bg-black/50" onClick={() => setFeatureManagingCompany(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-3xl my-8 p-6">
            <CompanyFeaturesManager
              companyId={featureManagingCompany.id}
              companyName={featureManagingCompany.name}
              onClose={() => setFeatureManagingCompany(null)}
            />
          </div>
        </div>
      )}

      {editingCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setEditingCompany(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">{t('superAdmin.companies.editCompany')}</h2>
              <button onClick={() => setEditingCompany(null)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('common.logoEKompanise')}</label>
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    {editingCompany.logo_url ? (
                      <img
                        src={editingCompany.logo_url}
                        alt="Company Logo"
                        className="w-24 h-24 rounded-lg object-cover border-2 border-gray-200"
                      />
                    ) : (
                      <div className="w-24 h-24 rounded-lg bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center">
                        <ImageIcon className="w-8 h-8 text-gray-400" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 text-sm"
                    >
                      {uploading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Upload className="w-4 h-4" />
                      )}
                      {uploading ? 'Duke ngarkuar...' : t('common.uploadLogo')}
                    </button>
                    <p className="text-xs text-gray-500 mt-2">{t('common.pngJpgGifDeriNeMb')}</p>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.name')}</label>
                <input
                  type="text"
                  value={editingCompany.name}
                  onChange={(e) => setEditingCompany({ ...editingCompany, name: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.email')}</label>
                <input
                  type="email"
                  value={editingCompany.email}
                  onChange={(e) => setEditingCompany({ ...editingCompany, email: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.phone')}</label>
                <input
                  type="text"
                  value={editingCompany.phone}
                  onChange={(e) => setEditingCompany({ ...editingCompany, phone: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.address')}</label>
                <input
                  type="text"
                  value={editingCompany.address}
                  onChange={(e) => setEditingCompany({ ...editingCompany, address: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-100">
              <button onClick={() => setEditingCompany(null)} className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('common.saveChanges')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
