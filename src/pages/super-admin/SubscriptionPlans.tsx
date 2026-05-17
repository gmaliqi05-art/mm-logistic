import { useState, useEffect } from 'react';
import { Star, Plus, CreditCard as Edit3, Trash2, Save, X, Loader2, AlertTriangle, Check, ToggleLeft, ToggleRight, GripVertical } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTranslation } from '../../i18n';
import type { ProductType, SubscriptionPlan } from '../../types';
import { getPlanIcon as getPlanIconShared, PRODUCT_TYPE_META } from '../../lib/subscriptionPlans';

const emptyPlan: Omit<SubscriptionPlan, 'id' | 'created_at' | 'updated_at'> = {
  name: '',
  display_name: '',
  description: '',
  price_monthly: 0,
  trial_days: 0,
  max_drivers: 0,
  max_depots: 0,
  features: [],
  is_active: true,
  sort_order: 0,
  product_type: 'logistics',
  is_addon: false,
  price_addon_monthly: null,
};

export default function SubscriptionPlans() {
  const { t } = useTranslation();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newFeature, setNewFeature] = useState('');
  const [formData, setFormData] = useState(emptyPlan);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'all' | ProductType>('all');

  useEffect(() => {
    fetchPlans();
  }, []);

  async function fetchPlans() {
    try {
      setLoading(true);
      setError(null);
      const { data, error: err } = await supabase
        .from('subscription_plans')
        .select('*')
        .order('product_type')
        .order('sort_order');
      if (err) throw err;
      setPlans((data ?? []) as SubscriptionPlan[]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.errorLoading'));
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditingPlan(null);
    setFormData({
      ...emptyPlan,
      sort_order: plans.length,
    });
    setIsCreating(true);
    setNewFeature('');
  }

  function openEdit(plan: SubscriptionPlan) {
    setIsCreating(false);
    setEditingPlan(plan);
    setFormData({
      name: plan.name,
      display_name: plan.display_name,
      description: plan.description ?? '',
      price_monthly: plan.price_monthly,
      trial_days: plan.trial_days ?? 0,
      max_drivers: plan.max_drivers ?? 0,
      max_depots: plan.max_depots ?? 0,
      features: Array.isArray(plan.features) ? [...(plan.features as string[])] : [],
      is_active: plan.is_active,
      sort_order: plan.sort_order ?? 0,
      product_type: plan.product_type ?? 'logistics',
      is_addon: plan.is_addon ?? false,
      price_addon_monthly: plan.price_addon_monthly ?? null,
    });
    setNewFeature('');
  }

  function closeModal() {
    setEditingPlan(null);
    setIsCreating(false);
    setFormData(emptyPlan);
    setNewFeature('');
  }

  function addFeature() {
    if (!newFeature.trim()) return;
    setFormData((prev) => ({
      ...prev,
      features: [...(prev.features as string[]), newFeature.trim()],
    }));
    setNewFeature('');
  }

  function removeFeature(idx: number) {
    setFormData((prev) => ({
      ...prev,
      features: (prev.features as string[]).filter((_, i) => i !== idx),
    }));
  }

  async function handleSave() {
    if (!formData.name.trim() || !formData.display_name.trim()) {
      setError(t('common.requiredFields') || 'Emri dhe emri i shfaqur jane te detyrueshem');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const isAccounting = formData.product_type === 'accounting';
      const payload = {
        name: formData.name.trim(),
        display_name: formData.display_name.trim(),
        description: formData.description.trim(),
        price_monthly: formData.price_monthly,
        trial_days: formData.trial_days,
        max_drivers: isAccounting ? 0 : formData.max_drivers,
        max_depots: isAccounting ? 0 : formData.max_depots,
        features: formData.features ?? [],
        is_active: formData.is_active,
        sort_order: formData.sort_order,
        product_type: formData.product_type,
        is_addon: formData.is_addon,
        price_addon_monthly: formData.price_addon_monthly ?? 0,
        feature_keys: [],
      };

      if (isCreating) {
        const duplicate = plans.some(
          (p) => p.name.toLowerCase() === payload.name.toLowerCase() && p.is_active
        );
        if (duplicate) {
          setError('Ekziston nje plan aktiv me te njejtin slug.');
          setSaving(false);
          return;
        }
        const { error: err } = await supabase.from('subscription_plans').insert(payload);
        if (err) throw err;
      } else if (editingPlan) {
        const { error: err } = await supabase
          .from('subscription_plans')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', editingPlan.id);
        if (err) throw err;
      }

      closeModal();
      await fetchPlans();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.errorSaving'));
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(plan: SubscriptionPlan) {
    try {
      const { error: err } = await supabase
        .from('subscription_plans')
        .update({ is_active: !plan.is_active, updated_at: new Date().toISOString() })
        .eq('id', plan.id);
      if (err) throw err;
      await fetchPlans();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function handleDelete(planId: string) {
    try {
      const { error: err } = await supabase
        .from('subscription_plans')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', planId);
      if (err) throw err;
      setDeleteConfirm(null);
      await fetchPlans();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600" />
      </div>
    );
  }

  const showModal = isCreating || editingPlan !== null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('superAdmin.plans.title')}</h1>
          <p className="text-gray-500 mt-1">{t('superAdmin.plans.subtitle')}</p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium"
        >
          <Plus className="w-4 h-4" />
          {t('superAdmin.plans.addPlan')}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-red-700 text-sm">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="inline-flex rounded-xl bg-slate-100 p-1 gap-1">
        {(['all', 'logistics', 'accounting'] as const).map((f) => {
          const label = f === 'all' ? 'Te gjitha' : PRODUCT_TYPE_META[f].label;
          const active = filterType === f;
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFilterType(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                active ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="grid gap-6">
        {plans.filter((p) => filterType === 'all' || p.product_type === filterType).map((plan) => {
          const PlanIcon = getPlanIconShared(plan);
          const productMeta = PRODUCT_TYPE_META[plan.product_type ?? 'logistics'];
          return (
            <div
              key={plan.id}
              className={`bg-white rounded-xl shadow-sm border transition-all ${
                plan.is_active ? 'border-gray-100' : 'border-red-100 opacity-60'
              }`}
            >
              <div className="p-6">
                <div className="flex flex-col md:flex-row md:items-start gap-6">
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div className="p-3 bg-teal-50 rounded-xl flex-shrink-0">
                      <PlanIcon className="w-6 h-6 text-teal-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="text-lg font-bold text-gray-900">{plan.display_name}</h3>
                        {!plan.is_active && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                            {t('common.inactive')}
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                          {plan.name}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold inline-flex items-center gap-1 ${
                          plan.product_type === 'accounting'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-teal-50 text-teal-700'
                        }`}>
                          <productMeta.icon className="w-3 h-3" />
                          {productMeta.label}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">{plan.description}</p>

                      <div className="mt-4 flex flex-wrap items-center gap-4">
                        <div className="bg-slate-50 rounded-lg px-4 py-2">
                          <span className="text-2xl font-extrabold text-gray-900">
                            {plan.price_monthly === 0 ? t('common.free') : `${plan.price_monthly}\u20AC`}
                          </span>
                          {plan.price_monthly > 0 && (
                            <span className="text-sm text-gray-500">/{t('common.month')}</span>
                          )}
                        </div>
                        {plan.trial_days > 0 && (
                          <div className="text-sm text-gray-600">
                            <span className="font-medium">{plan.trial_days}</span> {t('superAdmin.plans.trialDays').toLowerCase()}
                          </div>
                        )}
                        {plan.is_addon && plan.price_addon_monthly != null && (
                          <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5">
                            <span className="text-sm font-bold text-emerald-700">{plan.price_addon_monthly}&euro;</span>
                            <span className="text-xs text-emerald-600 ml-1">addon</span>
                          </div>
                        )}
                        {plan.product_type !== 'accounting' && (
                          <>
                            <div className="text-sm text-gray-600">
                              <span className="font-medium">
                                {plan.max_drivers === -1 ? 'Pa limit' : plan.max_drivers}
                              </span>{' '}
                              {t('superAdmin.plans.maxDrivers').toLowerCase()}
                            </div>
                            <div className="text-sm text-gray-600">
                              <span className="font-medium">
                                {plan.max_depots === -1 ? 'Pa limit' : plan.max_depots}
                              </span>{' '}
                              {t('superAdmin.plans.maxDepots').toLowerCase()}
                            </div>
                          </>
                        )}
                        <div className="text-sm text-gray-400">
                          <GripVertical className="w-4 h-4 inline" /> #{plan.sort_order}
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {(plan.features as string[]).map((feature) => (
                          <span
                            key={feature}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-teal-50 text-teal-700"
                          >
                            <Check className="w-3 h-3" />
                            {feature}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleToggleActive(plan)}
                      className={`p-2 rounded-lg transition-colors ${
                        plan.is_active
                          ? 'text-green-600 hover:bg-green-50'
                          : 'text-gray-400 hover:bg-gray-50'
                      }`}
                      title={plan.is_active ? t('common.inactive') : t('common.active')}
                    >
                      {plan.is_active ? (
                        <ToggleRight className="w-5 h-5" />
                      ) : (
                        <ToggleLeft className="w-5 h-5" />
                      )}
                    </button>
                    <button
                      onClick={() => openEdit(plan)}
                      className="p-2 rounded-lg text-gray-400 hover:bg-gray-50 hover:text-teal-600 transition-colors"
                      title={t('common.edit')}
                    >
                      <Edit3 className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(plan.id)}
                      className="p-2 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                      title={t('common.delete')}
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {plans.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
            <Star className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">{t('superAdmin.plans.noPlans')}</p>
          </div>
        )}
      </div>

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-xl">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">{t('superAdmin.plans.confirmDelete')}</h3>
            </div>
            <p className="text-sm text-gray-500 mb-6">
              {t('common.areYouSure')}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 transition-colors"
              >
                {t('common.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full my-8">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                {isCreating ? t('superAdmin.plans.addPlan') : t('superAdmin.plans.editPlan')}
              </h2>
              <button
                onClick={closeModal}
                className="p-2 rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Tipi i produktit *</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['logistics', 'accounting'] as ProductType[]).map((pt) => {
                    const active = formData.product_type === pt;
                    const meta = PRODUCT_TYPE_META[pt];
                    const Icon = meta.icon;
                    return (
                      <button
                        key={pt}
                        type="button"
                        onClick={() => setFormData((p) => ({ ...p, product_type: pt }))}
                        className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-semibold transition-all ${
                          active
                            ? pt === 'accounting'
                              ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                              : 'border-teal-500 bg-teal-50 text-teal-700'
                            : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        {meta.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {t('common.name')} (slug) *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                    placeholder="p.sh. standard"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {t('superAdmin.plans.displayName')} *
                  </label>
                  <input
                    type="text"
                    value={formData.display_name}
                    onChange={(e) => setFormData((p) => ({ ...p, display_name: e.target.value }))}
                    placeholder="p.sh. Standard"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t('common.description')}
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                  rows={2}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm resize-none"
                />
              </div>

              <div className={`grid grid-cols-2 ${formData.product_type === 'accounting' ? 'sm:grid-cols-2' : 'sm:grid-cols-4'} gap-4`}>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {t('superAdmin.plans.monthlyPrice')}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min={0}
                      value={formData.price_monthly}
                      onChange={(e) =>
                        setFormData((p) => ({ ...p, price_monthly: Number(e.target.value) }))
                      }
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {t('superAdmin.plans.trialDays')}
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={formData.trial_days}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, trial_days: Number(e.target.value) }))
                    }
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                  />
                </div>
                {formData.product_type !== 'accounting' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        {t('superAdmin.plans.maxDrivers')}
                      </label>
                      <input
                        type="number"
                        min={-1}
                        value={formData.max_drivers}
                        onChange={(e) =>
                          setFormData((p) => ({ ...p, max_drivers: Number(e.target.value) }))
                        }
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                      />
                      <p className="text-xs text-gray-400 mt-1">-1 = pa limit</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        {t('superAdmin.plans.maxDepots')}
                      </label>
                      <input
                        type="number"
                        min={-1}
                        value={formData.max_depots}
                        onChange={(e) =>
                          setFormData((p) => ({ ...p, max_depots: Number(e.target.value) }))
                        }
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                      />
                      <p className="text-xs text-gray-400 mt-1">-1 = pa limit</p>
                    </div>
                  </>
                )}
              </div>

              {formData.product_type === 'accounting' && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-4">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setFormData((p) => ({ ...p, is_addon: !p.is_addon }))}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                        formData.is_addon
                          ? 'border-emerald-500 bg-emerald-100 text-emerald-800'
                          : 'border-gray-200 bg-white text-gray-600'
                      }`}
                    >
                      {formData.is_addon ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                      Addon (per kompani logjistike)
                    </button>
                  </div>
                  {formData.is_addon && (
                    <div>
                      <label className="block text-sm font-medium text-emerald-800 mb-1.5">
                        Cmimi Addon (kur lidhet me logjistike)
                      </label>
                      <div className="relative w-48">
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          value={formData.price_addon_monthly ?? ''}
                          onChange={(e) =>
                            setFormData((p) => ({ ...p, price_addon_monthly: e.target.value ? Number(e.target.value) : null }))
                          }
                          placeholder="p.sh. 24.50"
                          className="w-full px-3 py-2.5 border border-emerald-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm bg-white"
                        />
                      </div>
                      <p className="text-xs text-emerald-700 mt-1.5">
                        Ky cmim aplikohet kur kompania ka tashme plan logjistike dhe shton kontabilitetin si addon
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {t('superAdmin.plans.sortOrder')}
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={formData.sort_order}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, sort_order: Number(e.target.value) }))
                    }
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => setFormData((p) => ({ ...p, is_active: !p.is_active }))}
                    className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border transition-colors w-full ${
                      formData.is_active
                        ? 'border-green-200 bg-green-50 text-green-700'
                        : 'border-gray-200 bg-gray-50 text-gray-500'
                    }`}
                  >
                    {formData.is_active ? (
                      <ToggleRight className="w-5 h-5" />
                    ) : (
                      <ToggleLeft className="w-5 h-5" />
                    )}
                    <span className="text-sm font-medium">
                      {formData.is_active ? t('common.active') : t('common.inactive')}
                    </span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t('superAdmin.plans.features')}
                </label>
                <div className="space-y-2 mb-3">
                  {(formData.features as string[]).map((feature, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg group"
                    >
                      <Check className="w-4 h-4 text-teal-500 flex-shrink-0" />
                      <input
                        type="text"
                        value={feature}
                        onChange={(e) => {
                          setFormData((prev) => ({
                            ...prev,
                            features: (prev.features as string[]).map((f, i) =>
                              i === idx ? e.target.value : f
                            ),
                          }));
                        }}
                        className="text-sm text-gray-700 flex-1 bg-transparent border-0 outline-none focus:ring-0 p-0"
                      />
                      <button
                        type="button"
                        onClick={() => removeFeature(idx)}
                        className="text-gray-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newFeature}
                    onChange={(e) => setNewFeature(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        e.stopPropagation();
                        addFeature();
                      }
                    }}
                    placeholder={`Shto vecorite...`}
                    className="flex-1 px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                  />
                  <button
                    type="button"
                    onClick={addFeature}
                    className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-100 flex gap-3 justify-end">
              <button
                type="button"
                onClick={closeModal}
                className="px-5 py-2.5 rounded-lg border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {saving ? t('common.processing') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
