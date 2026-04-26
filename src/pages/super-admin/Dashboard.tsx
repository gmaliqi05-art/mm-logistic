import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  TrendingUp,
  AlertTriangle,
  ArrowRight,
  DollarSign,
  Users,
  Clock,
  Zap,
  Star,
  Shield,
  Loader2,
  Warehouse,
  MessageSquare,
  ArrowUpRight,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTranslation } from '../../i18n';

interface DashboardStats {
  totalCompanies: number;
  activeCompanies: number;
  activeSubscriptions: number;
  trialSubscriptions: number;
  expiredSubscriptions: number;
  totalRevenue: number;
  monthlyRevenue: number;
  expiringTrials: number;
  totalUsers: number;
  totalDrivers: number;
  totalDepots: number;
  openTickets: number;
  inProgressTickets: number;
}

interface RoleCount {
  role: string;
  count: number;
}

interface RecentCompanySub {
  id: string;
  name: string;
  email: string;
  is_active: boolean;
  created_at: string;
  subscription_status: string;
  plan_name: string;
  plan_display_name: string;
}

interface PlanDist {
  name: string;
  display_name: string;
  count: number;
}

const planIconMap: Record<string, typeof Zap> = {
  free_trial: Zap,
  standard: Star,
  premium: Shield,
};

const planColorMap: Record<string, string> = {
  free_trial: 'bg-amber-500',
  standard: 'bg-teal-500',
  premium: 'bg-cyan-600',
};

export default function SuperAdminDashboard() {
  const { t } = useTranslation();

  const statusConfig: Record<string, { label: string; className: string }> = {
    trial: { label: t('superAdmin.dashboard.expiringTrials'), className: 'bg-amber-100 text-amber-700' },
    active: { label: t('common.active'), className: 'bg-green-100 text-green-700' },
    expired: { label: t('superAdmin.companies.allPlans'), className: 'bg-red-100 text-red-700' },
    cancelled: { label: t('common.cancel'), className: 'bg-gray-100 text-gray-700' },
  };

  const [stats, setStats] = useState<DashboardStats>({
    totalCompanies: 0,
    activeCompanies: 0,
    activeSubscriptions: 0,
    trialSubscriptions: 0,
    expiredSubscriptions: 0,
    totalRevenue: 0,
    monthlyRevenue: 0,
    expiringTrials: 0,
    totalUsers: 0,
    totalDrivers: 0,
    totalDepots: 0,
    openTickets: 0,
    inProgressTickets: 0,
  });
  const [roleCounts, setRoleCounts] = useState<RoleCount[]>([]);
  const [recentCompanies, setRecentCompanies] = useState<RecentCompanySub[]>([]);
  const [planDistribution, setPlanDistribution] = useState<PlanDist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      setLoading(true);
      setError(null);

      const [companiesRes, subsRes, paymentsRes, plansRes, profilesRes, depotsRes, ticketsRes] = await Promise.all([
        supabase.from('companies').select('id, name, email, is_active, created_at').order('created_at', { ascending: false }),
        supabase.from('company_subscriptions').select('id, company_id, status, trial_end, plan_id, plan:subscription_plans(name, display_name)'),
        supabase.from('payment_transactions').select('amount, status, created_at').eq('status', 'completed'),
        supabase.from('subscription_plans').select('id, name, display_name'),
        supabase.from('profiles').select('id, role'),
        supabase.from('depots').select('id'),
        supabase.from('support_tickets').select('id, status'),
      ]);

      const companies = companiesRes.data ?? [];
      const subs = subsRes.data ?? [];
      const payments = paymentsRes.data ?? [];
      const plans = plansRes.data ?? [];
      const profiles = profilesRes.data ?? [];
      const depots = depotsRes.data ?? [];
      const tickets = ticketsRes.data ?? [];

      const now = new Date();
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const activeSubs = subs.filter((s) => s.status === 'active').length;
      const trialSubs = subs.filter((s) => s.status === 'trial').length;
      const expiredSubs = subs.filter((s) => s.status === 'expired').length;
      const expiringTrials = subs.filter(
        (s) => s.status === 'trial' && s.trial_end && new Date(s.trial_end) <= sevenDaysFromNow
      ).length;

      const totalRevenue = payments.reduce((sum, p) => sum + Number(p.amount), 0);
      const monthlyRevenue = payments
        .filter((p) => new Date(p.created_at) >= startOfMonth)
        .reduce((sum, p) => sum + Number(p.amount), 0);

      const activeCompanies = companies.filter((c) => c.is_active).length;
      const totalDrivers = profiles.filter((p) => p.role === 'driver').length;
      const openTickets = tickets.filter((t) => t.status === 'open').length;
      const inProgressTickets = tickets.filter((t) => t.status === 'in_progress').length;

      const roleCountMap = new Map<string, number>();
      profiles.forEach((p) => {
        roleCountMap.set(p.role, (roleCountMap.get(p.role) ?? 0) + 1);
      });
      const roleCountsArr: RoleCount[] = [];
      ['company_admin', 'depot_worker', 'driver', 'super_admin'].forEach((role) => {
        if (roleCountMap.has(role)) {
          roleCountsArr.push({ role, count: roleCountMap.get(role)! });
        }
      });

      setStats({
        totalCompanies: companies.length,
        activeCompanies,
        activeSubscriptions: activeSubs,
        trialSubscriptions: trialSubs,
        expiredSubscriptions: expiredSubs,
        totalRevenue,
        monthlyRevenue,
        expiringTrials,
        totalUsers: profiles.length,
        totalDrivers,
        totalDepots: depots.length,
        openTickets,
        inProgressTickets,
      });

      setRoleCounts(roleCountsArr);

      const subMap = new Map<string, { status: string; plan_name: string; plan_display_name: string }>();
      subs.forEach((s) => {
        const plan = s.plan as unknown as { name: string; display_name: string } | null;
        subMap.set(s.company_id, {
          status: s.status,
          plan_name: plan?.name ?? '',
          plan_display_name: plan?.display_name ?? '-',
        });
      });

      const recentWithSub: RecentCompanySub[] = companies.slice(0, 8).map((c) => {
        const sub = subMap.get(c.id);
        return {
          ...c,
          subscription_status: sub?.status ?? 'none',
          plan_name: sub?.plan_name ?? '',
          plan_display_name: sub?.plan_display_name ?? t('superAdmin.dashboard.noPlan'),
        };
      });
      setRecentCompanies(recentWithSub);

      const planCountMap = new Map<string, number>();
      subs.forEach((s) => {
        const plan = s.plan as unknown as { name: string } | null;
        const name = plan?.name ?? 'unknown';
        planCountMap.set(name, (planCountMap.get(name) ?? 0) + 1);
      });

      const dist = plans.map((p) => ({
        name: p.name,
        display_name: p.display_name,
        count: planCountMap.get(p.name) ?? 0,
      }));
      setPlanDistribution(dist);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.errorLoading'));
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-12 h-12 animate-spin text-teal-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-3" />
        <p className="text-red-700 font-medium">{error}</p>
        <button onClick={fetchData} className="mt-4 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors">
          {t('common.tryAgain')}
        </button>
      </div>
    );
  }

  const totalSubs = planDistribution.reduce((s, p) => s + p.count, 0) || 1;
  const totalRoleUsers = roleCounts.reduce((s, r) => s + r.count, 0) || 1;

  const roleColorMap: Record<string, string> = {
    company_admin: 'bg-teal-500',
    depot_worker: 'bg-emerald-500',
    driver: 'bg-cyan-500',
    super_admin: 'bg-slate-600',
  };

  const statCards = [
    {
      label: t('superAdmin.dashboard.totalCompanies'),
      value: stats.totalCompanies,
      icon: Building2,
      color: 'bg-teal-500',
      sub: `${stats.activeCompanies} ${t('superAdmin.dashboard.companiesActive')}`,
      link: '/super-admin/companies',
    },
    {
      label: t('superAdmin.dashboard.monthlyRevenue'),
      value: `${stats.monthlyRevenue.toFixed(0)}\u20AC`,
      icon: DollarSign,
      color: 'bg-emerald-500',
      sub: `${stats.totalRevenue.toFixed(0)}\u20AC ${t('superAdmin.dashboard.revenueTotal').toLowerCase()}`,
      link: '/super-admin/reports',
    },
    {
      label: t('superAdmin.dashboard.totalUsers'),
      value: stats.totalUsers,
      icon: Users,
      color: 'bg-cyan-500',
      sub: `${stats.totalDrivers} ${t('superAdmin.dashboard.totalDrivers').toLowerCase()}`,
      link: '/super-admin/users',
    },
    {
      label: t('superAdmin.dashboard.activeSubscriptions'),
      value: stats.activeSubscriptions + stats.trialSubscriptions,
      icon: Star,
      color: 'bg-teal-600',
      sub: `${stats.trialSubscriptions} ${t('superAdmin.dashboard.expiringTrials').toLowerCase()}`,
      link: '/super-admin/plans',
    },
    {
      label: t('superAdmin.dashboard.totalDepots'),
      value: stats.totalDepots,
      icon: Warehouse,
      color: 'bg-slate-500',
      sub: `${stats.totalDrivers} ${t('superAdmin.dashboard.totalDrivers').toLowerCase()}`,
      link: '/super-admin/users',
    },
    {
      label: t('superAdmin.dashboard.openTickets'),
      value: stats.openTickets,
      icon: MessageSquare,
      color: stats.openTickets > 0 ? 'bg-amber-500' : 'bg-slate-400',
      sub: `${stats.inProgressTickets} ${t('superAdmin.support.inProgress').toLowerCase()}`,
      link: '/super-admin/chat',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('superAdmin.dashboard.title')}</h1>
        <p className="text-gray-500 mt-1">{t('superAdmin.dashboard.subtitle')}</p>
      </div>

      {stats.expiringTrials > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <Clock className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <p className="text-amber-800 text-sm flex-1">
            <span className="font-semibold">{stats.expiringTrials}</span>{' '}
            {stats.expiringTrials === 1 ? 'trial' : 'trials'} {t('superAdmin.dashboard.trialExpiring7d')}
          </p>
          <Link to="/super-admin/companies" className="text-amber-700 hover:text-amber-900 text-sm font-medium flex items-center gap-1">
            {t('common.view')} <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {statCards.map((card) => (
          <Link key={card.label} to={card.link} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-all group">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-sm text-gray-500 truncate">{card.label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{card.value}</p>
                <div className="flex items-center gap-1.5 mt-2">
                  <TrendingUp className="w-3.5 h-3.5 text-teal-500 flex-shrink-0" />
                  <span className="text-xs text-gray-500 truncate">{card.sub}</span>
                </div>
              </div>
              <div className={`${card.color} p-3 rounded-xl group-hover:scale-110 transition-transform flex-shrink-0`}>
                <card.icon className="w-5 h-5 text-white" />
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-5 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-teal-600" />
              <h2 className="text-lg font-semibold text-gray-900">{t('superAdmin.dashboard.recentCompanies')}</h2>
            </div>
            <Link to="/super-admin/companies" className="text-sm text-teal-600 hover:text-teal-700 flex items-center gap-1">
              {t('common.all')} <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="divide-y divide-gray-50">
            {recentCompanies.length === 0 ? (
              <div className="p-12 text-center text-gray-400">
                <Building2 className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                {t('superAdmin.companies.noCompanies')}
              </div>
            ) : (
              recentCompanies.map((company) => {
                const PlanIcon = planIconMap[company.plan_name] || Building2;
                const statusCfg = statusConfig[company.subscription_status];
                return (
                  <div key={company.id} className="p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-teal-100 flex items-center justify-center flex-shrink-0">
                          <PlanIcon className="w-4 h-4 text-teal-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{company.name}</p>
                          <p className="text-xs text-gray-500 truncate">{company.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                        <span className="text-xs text-gray-400 hidden sm:inline">{company.plan_display_name}</span>
                        {statusCfg && (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusCfg.className}`}>
                            {statusCfg.label}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="p-5 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Star className="w-5 h-5 text-teal-600" />
                <h2 className="text-base font-semibold text-gray-900">{t('superAdmin.dashboard.planDistribution')}</h2>
              </div>
            </div>
            <div className="p-5 space-y-4">
              {planDistribution.map((plan) => {
                const PlanIcon = planIconMap[plan.name] || Star;
                const barColor = planColorMap[plan.name] || 'bg-gray-400';
                const pct = Math.round((plan.count / totalSubs) * 100);
                return (
                  <div key={plan.name}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <PlanIcon className="w-4 h-4 text-teal-600" />
                        <span className="text-sm text-gray-700">{plan.display_name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">{pct}%</span>
                        <span className="text-sm font-semibold text-gray-900">{plan.count}</span>
                      </div>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className={`${barColor} h-2 rounded-full transition-all duration-500`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {planDistribution.length === 0 && (
                <p className="text-center text-gray-400 text-sm py-4">{t('common.noData')}</p>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="p-5 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-teal-600" />
                <h2 className="text-base font-semibold text-gray-900">{t('superAdmin.dashboard.usersByRole')}</h2>
              </div>
            </div>
            <div className="p-5 space-y-3">
              {roleCounts.map((rc) => {
                const pct = Math.round((rc.count / totalRoleUsers) * 100);
                const barColor = roleColorMap[rc.role] || 'bg-gray-400';
                return (
                  <div key={rc.role}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-gray-700">{t(`roles.${rc.role}`)}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">{pct}%</span>
                        <span className="text-sm font-semibold text-gray-900">{rc.count}</span>
                      </div>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div
                        className={`${barColor} h-1.5 rounded-full transition-all duration-500`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {roleCounts.length === 0 && (
                <p className="text-center text-gray-400 text-sm py-4">{t('common.noData')}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">{t('superAdmin.dashboard.quickActions')}</h2>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Link
            to="/super-admin/companies"
            className="flex items-center gap-3 p-4 bg-teal-50 rounded-xl hover:bg-teal-100 transition-colors group"
          >
            <div className="p-2 bg-teal-500 rounded-lg">
              <Building2 className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-medium text-teal-900 flex-1">{t('superAdmin.dashboard.manageCompanies')}</span>
            <ArrowUpRight className="w-4 h-4 text-teal-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </Link>
          <Link
            to="/super-admin/reports"
            className="flex items-center gap-3 p-4 bg-emerald-50 rounded-xl hover:bg-emerald-100 transition-colors group"
          >
            <div className="p-2 bg-emerald-500 rounded-lg">
              <DollarSign className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-medium text-emerald-900 flex-1">{t('superAdmin.dashboard.viewRevenue')}</span>
            <ArrowUpRight className="w-4 h-4 text-emerald-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </Link>
          <Link
            to="/super-admin/users"
            className="flex items-center gap-3 p-4 bg-cyan-50 rounded-xl hover:bg-cyan-100 transition-colors group"
          >
            <div className="p-2 bg-cyan-500 rounded-lg">
              <Users className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-medium text-cyan-900 flex-1">{t('superAdmin.dashboard.manageUsers')}</span>
            <ArrowUpRight className="w-4 h-4 text-cyan-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </Link>
          <Link
            to="/super-admin/chat"
            className="flex items-center gap-3 p-4 bg-amber-50 rounded-xl hover:bg-amber-100 transition-colors group"
          >
            <div className="p-2 bg-amber-500 rounded-lg">
              <MessageSquare className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-medium text-amber-900 flex-1">{t('superAdmin.dashboard.viewSupport')}</span>
            <ArrowUpRight className="w-4 h-4 text-amber-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </Link>
        </div>
      </div>
    </div>
  );
}
