import { useState, useEffect } from 'react';
import {
  DollarSign,
  Building2,
  TrendingUp,
  AlertTriangle,
  CreditCard,
  Zap,
  Star,
  Shield,
} from 'lucide-react';
import { useTranslation } from '../../i18n';
import { supabase } from '../../lib/supabase';

interface PlanRevenue {
  name: string;
  display_name: string;
  price: number;
  count: number;
  revenue: number;
}

interface PaymentRow {
  id: string;
  amount: number;
  currency: string;
  status: string;
  payment_method: string;
  description: string;
  created_at: string;
  company_name: string;
}

const planIcons: Record<string, typeof Zap> = {
  free_trial: Zap,
  standard: Star,
  premium: Shield,
};

export default function SuperAdminReports() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [monthlyRevenue, setMonthlyRevenue] = useState(0);
  const [totalCompanies, setTotalCompanies] = useState(0);
  const [planRevenue, setPlanRevenue] = useState<PlanRevenue[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [mrr, setMrr] = useState(0);

  useEffect(() => {
    fetchReportData();
  }, []);

  async function fetchReportData() {
    try {
      setLoading(true);
      setError(null);

      const [subsRes, plansRes, paymentsRes, companiesRes] = await Promise.all([
        supabase.from('company_subscriptions').select('company_id, status, plan_id, plan:subscription_plans(name, display_name, price_monthly)'),
        supabase.from('subscription_plans').select('*').order('sort_order'),
        supabase.from('payment_transactions').select('*, company:companies(name)').order('created_at', { ascending: false }).limit(20),
        supabase.from('companies').select('id', { count: 'exact', head: true }),
      ]);

      const subs = subsRes.data ?? [];
      const plans = plansRes.data ?? [];
      const paymentData = paymentsRes.data ?? [];

      setTotalCompanies(companiesRes.count ?? 0);

      const completedPayments = paymentData.filter((p: Record<string, unknown>) => p.status === 'completed');
      const total = completedPayments.reduce((s: number, p: Record<string, unknown>) => s + Number(p.amount ?? 0), 0);
      setTotalRevenue(total);

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthly = completedPayments
        .filter((p: Record<string, unknown>) => new Date(p.created_at as string) >= startOfMonth)
        .reduce((s: number, p: Record<string, unknown>) => s + Number(p.amount ?? 0), 0);
      setMonthlyRevenue(monthly);

      const planCountMap = new Map<string, number>();
      subs.forEach((s) => {
        if (s.status === 'active' || s.status === 'trial') {
          const plan = s.plan as unknown as { name: string } | null;
          const name = plan?.name ?? '';
          planCountMap.set(name, (planCountMap.get(name) ?? 0) + 1);
        }
      });

      let mrrCalc = 0;
      const planRev: PlanRevenue[] = plans.map((p) => {
        const count = planCountMap.get(p.name) ?? 0;
        const rev = count * Number(p.price_monthly);
        mrrCalc += rev;
        return {
          name: p.name,
          display_name: p.display_name,
          price: Number(p.price_monthly),
          count,
          revenue: rev,
        };
      });
      setPlanRevenue(planRev);
      setMrr(mrrCalc);

      const paymentRows: PaymentRow[] = paymentData.map((p: Record<string, unknown>) => ({
        id: p.id as string,
        amount: Number(p.amount ?? 0),
        currency: (p.currency as string) || 'EUR',
        status: p.status as string,
        payment_method: (p.payment_method as string) || '-',
        description: (p.description as string) || '',
        created_at: p.created_at as string,
        company_name: ((p.company as Record<string, unknown>)?.name as string) || '-',
      }));
      setPayments(paymentRows);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gabim gjate ngarkimit te raporteve');
    } finally {
      setLoading(false);
    }
  }

  const paymentStatusConfig: Record<string, { label: string; className: string }> = {
    completed: { label: 'Perfunduar', className: 'bg-green-100 text-green-700' },
    pending: { label: 'Ne pritje', className: 'bg-amber-100 text-amber-700' },
    failed: { label: 'Deshtuar', className: 'bg-red-100 text-red-700' },
    refunded: { label: 'Rimbursuar', className: 'bg-gray-100 text-gray-700' },
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-3" />
        <p className="text-red-700 font-medium">{error}</p>
        <button onClick={fetchReportData} className="mt-4 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors">
          Provo Perseri
        </button>
      </div>
    );
  }

  const maxPlanRevenue = Math.max(...planRevenue.map((p) => p.revenue), 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Te Ardhurat</h1>
        <p className="text-gray-500 mt-1">Raporte financiare dhe historiku i pagesave</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">MRR</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{mrr.toFixed(0)}{'\u20AC'}</p>
              <p className="text-xs text-gray-500 mt-1">Te ardhura mujore te perseritura</p>
            </div>
            <div className="bg-teal-500 p-3 rounded-xl">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Kete Muaj</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{monthlyRevenue.toFixed(0)}{'\u20AC'}</p>
              <p className="text-xs text-gray-500 mt-1">Pagesa te perfunduara</p>
            </div>
            <div className="bg-emerald-500 p-3 rounded-xl">
              <DollarSign className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">{t('common.totalRevenue')}</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{totalRevenue.toFixed(0)}{'\u20AC'}</p>
              <p className="text-xs text-gray-500 mt-1">Qe nga fillimi</p>
            </div>
            <div className="bg-cyan-500 p-3 rounded-xl">
              <CreditCard className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">{t('common.companies')}</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{totalCompanies}</p>
              <p className="text-xs text-gray-500 mt-1">Te regjistruara ne platforme</p>
            </div>
            <div className="bg-slate-500 p-3 rounded-xl">
              <Building2 className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Star className="w-5 h-5 text-teal-600" />
            <h2 className="text-lg font-semibold text-gray-900">{t('common.revenueByPlan')}</h2>
          </div>
        </div>
        <div className="p-6">
          <div className="grid md:grid-cols-3 gap-6">
            {planRevenue.map((plan) => {
              const PlanIcon = planIcons[plan.name] || Star;
              return (
                <div key={plan.name} className="bg-gray-50 rounded-xl p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2.5 bg-teal-100 rounded-xl">
                      <PlanIcon className="w-5 h-5 text-teal-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{plan.display_name}</p>
                      <p className="text-xs text-gray-500">{plan.price > 0 ? `${plan.price}\u20AC/muaj` : 'Falas'}</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">Abonente</span>
                      <span className="text-sm font-bold text-gray-900">{plan.count}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">Te ardhura/muaj</span>
                      <span className="text-sm font-bold text-teal-600">{plan.revenue.toFixed(0)}{'\u20AC'}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                      <div
                        className="bg-teal-500 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${(plan.revenue / maxPlanRevenue) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-teal-600" />
            <h2 className="text-lg font-semibold text-gray-900">Historiku i Pagesave</h2>
          </div>
        </div>
        {payments.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <CreditCard className="w-10 h-10 mx-auto mb-3 text-gray-300" />{t('common.nukKaPagesaTeRegjistruara')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('common.company')}</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Shuma</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Metoda</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('common.status')}</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {payments.map((payment) => {
                  const statusCfg = paymentStatusConfig[payment.status];
                  return (
                    <tr key={payment.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">{payment.company_name}</td>
                      <td className="px-6 py-4 text-sm font-bold text-gray-900">{payment.amount.toFixed(2)}{'\u20AC'}</td>
                      <td className="px-6 py-4 text-sm text-gray-600 hidden md:table-cell capitalize">{payment.payment_method || '-'}</td>
                      <td className="px-6 py-4">
                        {statusCfg ? (
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusCfg.className}`}>
                            {statusCfg.label}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">{payment.status}</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 hidden lg:table-cell">
                        {new Date(payment.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
