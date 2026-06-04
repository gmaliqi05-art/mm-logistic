import { useState, useEffect } from 'react';
import {
  Building2, Search, Filter, Clock, CheckCircle2, XCircle, AlertTriangle,
  CreditCard, X, Loader2, ChevronDown, ChevronUp, RefreshCw, CalendarPlus,
  Ban, Zap, Star, Shield, Receipt,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PageSkeleton } from '../../components/ui/Skeleton';
import { useTranslation } from '../../i18n';
import { useAuth } from '../../contexts/AuthContext';

interface Subscription {
  id: string;
  status: string;
  trial_end: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  payment_method: string;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  created_at: string;
  plan: { id: string; name: string; display_name: string; price_monthly: number } | null;
}

interface PaymentTransaction {
  id: string;
  amount: number;
  currency: string;
  status: string;
  payment_method: string;
  stripe_payment_id: string;
  description: string;
  created_at: string;
}

interface CompanyRecord {
  id: string;
  name: string;
  email: string;
  is_active: boolean;
  created_at: string;
  subscription: Subscription | null;
  payments: PaymentTransaction[];
}

const planIcons: Record<string, typeof Zap> = {
  free_trial: Zap,
  standard: Star,
  premium: Shield,
};

const STATUS_COLORS: Record<string, string> = {
  trial: 'bg-amber-100 text-amber-700',
  active: 'bg-emerald-100 text-emerald-700',
  pending_payment: 'bg-orange-100 text-orange-700',
  past_due: 'bg-red-100 text-red-700',
  expired: 'bg-gray-200 text-gray-600',
  cancelled: 'bg-gray-100 text-gray-500',
};

const PAYMENT_STATUS_COLORS: Record<string, string> = {
  completed: 'bg-emerald-100 text-emerald-700',
  pending: 'bg-amber-100 text-amber-700',
  failed: 'bg-red-100 text-red-700',
  refunded: 'bg-blue-100 text-blue-700',
};

export default function CompanyPayments() {
  const { t } = useTranslation();
  const { profile } = useAuth();

  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionModal, setActionModal] = useState<{ company: CompanyRecord; action: string } | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [extendDays, setExtendDays] = useState(30);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    try {
      setLoading(true);
      setError(null);

      const { data: companiesData, error: compErr } = await supabase
        .from('companies')
        .select('id, name, email, is_active, created_at')
        .order('created_at', { ascending: false });
      if (compErr) throw compErr;

      const { data: subsData } = await supabase
        .from('company_subscriptions')
        .select('id, company_id, status, trial_end, current_period_start, current_period_end, payment_method, stripe_subscription_id, stripe_customer_id, created_at, plan:subscription_plans(id, name, display_name, price_monthly)')
        .order('created_at', { ascending: false });

      const { data: paymentsData } = await supabase
        .from('payment_transactions')
        .select('id, company_id, amount, currency, status, payment_method, stripe_payment_id, description, created_at')
        .order('created_at', { ascending: false });

      const subMap = new Map<string, Subscription>();
      (subsData ?? []).forEach((s: Record<string, unknown>) => {
        const cid = s.company_id as string;
        if (!subMap.has(cid)) {
          subMap.set(cid, {
            id: s.id as string,
            status: s.status as string,
            trial_end: s.trial_end as string | null,
            current_period_start: s.current_period_start as string | null,
            current_period_end: s.current_period_end as string | null,
            payment_method: (s.payment_method as string) || 'free',
            stripe_subscription_id: s.stripe_subscription_id as string | null,
            stripe_customer_id: s.stripe_customer_id as string | null,
            created_at: s.created_at as string,
            plan: s.plan as Subscription['plan'],
          });
        }
      });

      const payMap = new Map<string, PaymentTransaction[]>();
      (paymentsData ?? []).forEach((p: Record<string, unknown>) => {
        const cid = p.company_id as string;
        if (!payMap.has(cid)) payMap.set(cid, []);
        payMap.get(cid)!.push({
          id: p.id as string,
          amount: p.amount as number,
          currency: (p.currency as string) || 'EUR',
          status: p.status as string,
          payment_method: p.payment_method as string,
          stripe_payment_id: p.stripe_payment_id as string,
          description: p.description as string,
          created_at: p.created_at as string,
        });
      });

      const merged: CompanyRecord[] = (companiesData ?? []).map((c) => ({
        ...c,
        subscription: subMap.get(c.id) ?? null,
        payments: payMap.get(c.id) ?? [],
      }));

      setCompanies(merged);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.errorLoading'));
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  }

  async function handleAction() {
    if (!actionModal || !profile) return;
    const { company, action } = actionModal;
    const sub = company.subscription;
    if (!sub) return;

    try {
      setSaving(true);
      setError(null);

      // Every state change goes through a SECURITY DEFINER RPC that runs the
      // subscription update, companies update, audit row, and (for activate)
      // manual payment_transactions insert in a single transaction. Before
      // this, three separate PostgREST calls left the system half-updated if
      // the browser tab closed mid-sequence and produced no audit trail.
      let rpcError: { message: string } | null = null;
      if (action === 'activate') {
        const { error } = await supabase.rpc('admin_activate_subscription', {
          p_subscription_id: sub.id,
          p_reason: actionReason,
        });
        rpcError = error;
      } else if (action === 'cancel') {
        const { error } = await supabase.rpc('admin_cancel_subscription', {
          p_subscription_id: sub.id,
          p_reason: actionReason,
        });
        rpcError = error;
      } else if (action === 'extend') {
        const { error } = await supabase.rpc('admin_extend_subscription', {
          p_subscription_id: sub.id,
          p_days: extendDays,
          p_reason: actionReason,
        });
        rpcError = error;
      }

      if (rpcError) throw new Error(rpcError.message);

      setActionModal(null);
      setActionReason('');
      setExtendDays(30);
      await fetchAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  function daysRemaining(dateStr: string | null | undefined) {
    if (!dateStr) return null;
    const diff = new Date(dateStr).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('sq-AL', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  }

  function formatDateTime(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('sq-AL', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  const filtered = companies.filter((c) => {
    const matchSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase());
    const matchStatus =
      statusFilter === 'all' || c.subscription?.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const stats = {
    total: companies.length,
    active: companies.filter((c) => c.subscription?.status === 'active').length,
    pending: companies.filter((c) => c.subscription?.status === 'pending_payment').length,
    trial: companies.filter((c) => c.subscription?.status === 'trial').length,
    expired: companies.filter((c) => c.subscription?.status === 'expired' || c.subscription?.status === 'cancelled').length,
    totalRevenue: companies.reduce((sum, c) =>
      sum + c.payments.filter((p) => p.status === 'completed').reduce((s, p) => s + Number(p.amount), 0), 0),
  };

  if (loading) return <PageSkeleton rows={10} cols={6} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('superAdmin.companyPayments.title')}</h1>
          <p className="text-gray-500 mt-1">{t('superAdmin.companyPayments.subtitle')}</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          {t('superAdmin.companyPayments.refresh')}
        </button>
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

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard label={t('superAdmin.companyPayments.totalCompanies')} value={stats.total} icon={Building2} color="bg-slate-100 text-slate-700" />
        <StatCard label={t('superAdmin.companyPayments.activeNow')} value={stats.active} icon={CheckCircle2} color="bg-emerald-100 text-emerald-700" />
        <StatCard label={t('superAdmin.companyPayments.pendingPayment')} value={stats.pending} icon={Clock} color="bg-orange-100 text-orange-700" highlight={stats.pending > 0} />
        <StatCard label={t('superAdmin.companyPayments.onTrial')} value={stats.trial} icon={Zap} color="bg-amber-100 text-amber-700" />
        <StatCard label={t('superAdmin.companyPayments.expiredCancelled')} value={stats.expired} icon={XCircle} color="bg-gray-100 text-gray-600" />
        <StatCard label={t('superAdmin.companyPayments.totalRevenue')} value={`${stats.totalRevenue.toFixed(2)}\u20AC`} icon={CreditCard} color="bg-teal-100 text-teal-700" />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder={t('superAdmin.companyPayments.searchPlaceholder')}
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
              <option value="active">{t('common.active')}</option>
              <option value="pending_payment">{t('superAdmin.companyPayments.pendingPayment')}</option>
              <option value="trial">{t('superAdmin.companyPayments.onTrial')}</option>
              <option value="past_due">{t('superAdmin.companyPayments.pastDue')}</option>
              <option value="expired">{t('superAdmin.companyPayments.expired')}</option>
              <option value="cancelled">{t('common.cancel')}</option>
            </select>
          </div>
        </div>

        {/* Company List */}
        <div className="divide-y divide-gray-50">
          {filtered.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-400">
              <Building2 className="w-10 h-10 mx-auto mb-3 text-gray-300" />
              {t('superAdmin.companies.noCompanies')}
            </div>
          ) : (
            filtered.map((company) => {
              const sub = company.subscription;
              const planName = sub?.plan?.name ?? '';
              const PlanIcon = planIcons[planName] || Building2;
              const endDate = sub?.status === 'trial' ? sub.trial_end : sub?.current_period_end;
              const days = daysRemaining(endDate);
              const isExpanded = expandedId === company.id;
              const statusClass = STATUS_COLORS[sub?.status ?? ''] || 'bg-gray-100 text-gray-500';

              return (
                <div key={company.id} className={`transition-colors ${isExpanded ? 'bg-gray-50/50' : 'hover:bg-gray-50/50'}`}>
                  {/* Main Row */}
                  <div
                    className="flex items-center gap-4 px-6 py-4 cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : company.id)}
                  >
                    <div className="w-10 h-10 rounded-lg bg-teal-100 flex items-center justify-center flex-shrink-0">
                      <PlanIcon className="w-5 h-5 text-teal-600" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-gray-900 truncate">{company.name}</p>
                        {!company.is_active && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-600">
                            {t('common.inactive')}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 truncate">{company.email}</p>
                    </div>

                    <div className="hidden sm:flex items-center gap-3">
                      <span className="text-xs font-medium text-gray-600">
                        {sub?.plan?.display_name ?? '-'}
                      </span>

                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusClass}`}>
                        {t(`superAdmin.companyPayments.status.${sub?.status ?? 'none'}`)}
                      </span>

                      {days !== null && (
                        <span className={`text-xs ${days <= 7 ? 'text-amber-600 font-semibold' : days <= 0 ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                          {days > 0 ? `${days}d` : days === 0 ? t('superAdmin.companyPayments.expirestoday') : `${Math.abs(days)}d ${t('superAdmin.companyPayments.overdue')}`}
                        </span>
                      )}

                      {sub?.payment_method === 'stripe' && (
                        <CreditCard className="w-4 h-4 text-gray-400" />
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {sub?.status === 'pending_payment' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setActionModal({ company, action: 'activate' }); }}
                          className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors"
                        >
                          {t('superAdmin.companyPayments.activate')}
                        </button>
                      )}
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </div>
                  </div>

                  {/* Expanded Detail */}
                  {isExpanded && (
                    <div className="px-6 pb-5 space-y-4">
                      {/* Subscription Info + Actions */}
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        <div className="lg:col-span-2 bg-white rounded-lg border border-gray-200 p-4">
                          <h4 className="text-sm font-semibold text-gray-700 mb-3">{t('superAdmin.companyPayments.subscriptionDetails')}</h4>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                            <Detail label={t('superAdmin.companyPayments.plan')} value={sub?.plan?.display_name ?? '-'} />
                            <Detail label={t('common.status')} value={
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusClass}`}>
                                {t(`superAdmin.companyPayments.status.${sub?.status ?? 'none'}`)}
                              </span>
                            } />
                            <Detail label={t('superAdmin.companyPayments.paymentMethod')} value={sub?.payment_method || '-'} />
                            <Detail label={t('superAdmin.companyPayments.periodStart')} value={sub?.current_period_start ? formatDate(sub.current_period_start) : '-'} />
                            <Detail label={t('superAdmin.companyPayments.periodEnd')} value={sub?.current_period_end ? formatDate(sub.current_period_end) : '-'} />
                            <Detail label={t('superAdmin.companyPayments.registered')} value={formatDate(company.created_at)} />
                            <Detail label={t('superAdmin.companyPayments.price')} value={sub?.plan?.price_monthly ? `${sub.plan.price_monthly}\u20AC/${t('common.month')}` : t('common.free')} />
                            {sub?.stripe_subscription_id && (
                              <Detail label="Stripe ID" value={
                                <span className="text-xs font-mono text-gray-500 truncate block max-w-[160px]" title={sub.stripe_subscription_id}>
                                  {sub.stripe_subscription_id}
                                </span>
                              } />
                            )}
                            <Detail label={t('superAdmin.companyPayments.daysLeft')} value={
                              days !== null
                                ? <span className={days <= 0 ? 'text-red-600 font-semibold' : days <= 7 ? 'text-amber-600 font-semibold' : ''}>
                                    {days > 0 ? `${days} ${t('superAdmin.companyPayments.days')}` : days === 0 ? t('superAdmin.companyPayments.expirestoday') : `${t('superAdmin.companyPayments.expiredSince')} ${Math.abs(days)} ${t('superAdmin.companyPayments.days')}`}
                                  </span>
                                : '-'
                            } />
                          </div>
                        </div>

                        {/* Actions Panel */}
                        <div className="bg-white rounded-lg border border-gray-200 p-4">
                          <h4 className="text-sm font-semibold text-gray-700 mb-3">{t('superAdmin.companyPayments.actions')}</h4>
                          <div className="space-y-2">
                            {(sub?.status === 'pending_payment' || sub?.status === 'expired' || sub?.status === 'past_due') && (
                              <button
                                onClick={() => setActionModal({ company, action: 'activate' })}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                                {t('superAdmin.companyPayments.activateSubscription')}
                              </button>
                            )}
                            {(sub?.status === 'active' || sub?.status === 'trial') && (
                              <button
                                onClick={() => setActionModal({ company, action: 'extend' })}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-teal-700 bg-teal-50 rounded-lg hover:bg-teal-100 transition-colors"
                              >
                                <CalendarPlus className="w-4 h-4" />
                                {t('superAdmin.companyPayments.extendPeriod')}
                              </button>
                            )}
                            {sub?.status === 'active' && (
                              <button
                                onClick={() => setActionModal({ company, action: 'cancel' })}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                              >
                                <Ban className="w-4 h-4" />
                                {t('superAdmin.companyPayments.cancelSubscription')}
                              </button>
                            )}
                            {!sub && (
                              <p className="text-sm text-gray-400 text-center py-4">{t('superAdmin.companyPayments.noSubscription')}</p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Payment History */}
                      <div className="bg-white rounded-lg border border-gray-200 p-4">
                        <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                          <Receipt className="w-4 h-4" />
                          {t('superAdmin.companyPayments.paymentHistory')}
                          <span className="text-xs text-gray-400 font-normal">({company.payments.length})</span>
                        </h4>
                        {company.payments.length === 0 ? (
                          <p className="text-sm text-gray-400 text-center py-6">{t('superAdmin.companyPayments.noPayments')}</p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-gray-100">
                                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-500">{t('superAdmin.companyPayments.date')}</th>
                                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-500">{t('superAdmin.companyPayments.amount')}</th>
                                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-500">{t('common.status')}</th>
                                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 hidden sm:table-cell">{t('superAdmin.companyPayments.method')}</th>
                                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 hidden md:table-cell">{t('superAdmin.companyPayments.description')}</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-50">
                                {company.payments.map((pay) => (
                                  <tr key={pay.id} className="hover:bg-gray-50/50">
                                    <td className="py-2 px-3 text-gray-600">{formatDateTime(pay.created_at)}</td>
                                    <td className="py-2 px-3 font-medium text-gray-900">{Number(pay.amount).toFixed(2)} {pay.currency.toUpperCase()}</td>
                                    <td className="py-2 px-3">
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${PAYMENT_STATUS_COLORS[pay.status] || 'bg-gray-100 text-gray-600'}`}>
                                        {pay.status}
                                      </span>
                                    </td>
                                    <td className="py-2 px-3 text-gray-500 hidden sm:table-cell">{pay.payment_method || '-'}</td>
                                    <td className="py-2 px-3 text-gray-500 hidden md:table-cell truncate max-w-[200px]">{pay.description || '-'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100">
          <p className="text-sm text-gray-500">
            {filtered.length} / {companies.length} {t('superAdmin.companyPayments.title').toLowerCase()}
          </p>
        </div>
      </div>

      {/* Action Modal */}
      {actionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setActionModal(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">
                {actionModal.action === 'activate' && t('superAdmin.companyPayments.activateSubscription')}
                {actionModal.action === 'cancel' && t('superAdmin.companyPayments.cancelSubscription')}
                {actionModal.action === 'extend' && t('superAdmin.companyPayments.extendPeriod')}
              </h2>
              <button onClick={() => setActionModal(null)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm font-medium text-gray-900">{actionModal.company.name}</p>
                <p className="text-xs text-gray-500">{actionModal.company.email}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {t('superAdmin.companyPayments.currentStatus')}: <span className="font-medium">{actionModal.company.subscription?.status}</span>
                </p>
              </div>

              {actionModal.action === 'activate' && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                  <p className="text-sm text-emerald-700">{t('superAdmin.companyPayments.activateConfirmText')}</p>
                </div>
              )}

              {actionModal.action === 'cancel' && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm text-red-700">{t('superAdmin.companyPayments.cancelConfirmText')}</p>
                </div>
              )}

              {actionModal.action === 'extend' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('superAdmin.companyPayments.extendByDays')}</label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={extendDays}
                    onChange={(e) => setExtendDays(Number(e.target.value))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('superAdmin.companyPayments.reason')}</label>
                <textarea
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  placeholder={t('superAdmin.companyPayments.reasonPlaceholder')}
                  rows={3}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-100">
              <button onClick={() => setActionModal(null)} className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
                {t('common.cancel')}
              </button>
              <button
                onClick={handleAction}
                disabled={saving}
                className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 ${
                  actionModal.action === 'cancel'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-teal-600 hover:bg-teal-700'
                }`}
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('common.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color, highlight }: {
  label: string;
  value: string | number;
  icon: typeof Building2;
  color: string;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-4 ${highlight ? 'border-orange-300 bg-orange-50/50 ring-1 ring-orange-200' : 'border-gray-100 bg-white'}`}>
      <div className={`w-8 h-8 rounded-lg ${color} flex items-center justify-center mb-2`}>
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <div className="text-sm text-gray-700">{value}</div>
    </div>
  );
}
