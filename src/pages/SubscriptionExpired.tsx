import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Check,
  Loader2,
  LogOut,
  CreditCard,
  Crown,
  RefreshCw,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import { useTranslation } from '../i18n';
import { usePlatformSettings } from '../hooks/usePlatformSettings';
import { fetchActivePlans, getPlanIcon, pickPopularPlan } from '../lib/subscriptionPlans';
import type { SubscriptionPlan } from '../types';
import PlatformLogo from '../components/PlatformLogo';

export default function SubscriptionExpired() {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const { subscription, plan: currentPlan, isExpired, isTrial, refreshSubscription, loading: subLoading } = useSubscription();
  const { t } = useTranslation();
  const { settings: platformSettings } = usePlatformSettings();

  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'yearly'>('monthly');
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!subLoading && !isExpired && profile) {
      const dest = profile.role === 'company_admin' ? '/company'
        : profile.role === 'depot_worker' ? '/depot'
        : profile.role === 'driver' ? '/driver'
        : profile.role === 'logistics_admin' ? '/logistics'
        : '/company';
      navigate(dest, { replace: true });
    }
  }, [isExpired, subLoading, profile, navigate]);

  useEffect(() => {
    async function load() {
      setPlansLoading(true);
      try {
        const productType = currentPlan?.product_type || 'logistics';
        const data = await fetchActivePlans(productType);
        const paidPlans = data.filter((p) => Number(p.price_monthly) > 0);
        setPlans(paidPlans.length > 0 ? paidPlans : data);
        if (paidPlans.length > 0) {
          setSelectedPlanId(paidPlans[0].id);
        } else if (data.length > 0) {
          setSelectedPlanId(data[0].id);
        }
      } catch {
        setPlans([]);
      } finally {
        setPlansLoading(false);
      }
    }
    load();
  }, [currentPlan?.product_type]);

  async function handleCheckout() {
    if (!selectedPlanId) return;
    setCheckoutLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/login');
        return;
      }

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-checkout`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            planId: selectedPlanId,
            billingInterval,
            successUrl: `${window.location.origin}/payment-success`,
            cancelUrl: `${window.location.origin}/subscription-expired`,
            isUpgrade: true,
          }),
        },
      );

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setError(data.error || t('subscription.checkoutError'));
    } catch {
      setError(t('subscription.checkoutError'));
    } finally {
      setCheckoutLoading(false);
    }
  }

  async function handleRefresh() {
    setChecking(true);
    await refreshSubscription();
    setTimeout(() => setChecking(false), 1200);
  }

  const popularPlanId = pickPopularPlan(plans);
  const hasYearlyOption = plans.some((p) => p.price_yearly != null && Number(p.price_monthly) > 0);
  const trialExpiredLabel = isTrial ? t('subscription.trialExpiredTitle') : t('subscription.expiredTitle');
  const trialExpiredDesc = isTrial ? t('subscription.trialExpiredDesc') : t('subscription.expiredDesc');

  function getPlanPrice(plan: SubscriptionPlan): string {
    if (Number(plan.price_monthly) === 0) return t('common.free');
    if (billingInterval === 'yearly' && plan.price_yearly != null) {
      return `${plan.price_yearly}\u20AC`;
    }
    return `${plan.price_monthly}\u20AC`;
  }

  function getPlanPeriodLabel(plan: SubscriptionPlan): string {
    if (Number(plan.price_monthly) === 0) return '';
    return billingInterval === 'yearly' ? '/vit' : `/${t('common.month')}`;
  }

  function getYearlySavings(plan: SubscriptionPlan): number | null {
    if (billingInterval !== 'yearly' || plan.price_yearly == null || Number(plan.price_monthly) === 0) return null;
    const fullYear = Number(plan.price_monthly) * 12;
    const savings = Math.round(((fullYear - Number(plan.price_yearly)) / fullYear) * 100);
    return savings > 0 ? savings : null;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <PlatformLogo size="sm" />
            <span className="text-lg font-bold text-slate-800">{platformSettings.name}</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleRefresh}
              disabled={checking}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-slate-500 hover:text-teal-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
              {t('subscription.checkStatus')}
            </button>
            <button
              onClick={() => signOut()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-slate-400 hover:text-slate-600 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              {t('common.logout')}
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-10">
        {/* Expired notice */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-5">
            <AlertTriangle className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">{trialExpiredLabel}</h1>
          <p className="mt-3 text-slate-500 max-w-xl mx-auto leading-relaxed">{trialExpiredDesc}</p>
          {currentPlan && (
            <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-100 text-sm text-slate-600">
              <Crown className="w-4 h-4" />
              {t('subscription.previousPlan')}: <span className="font-semibold">{currentPlan.display_name}</span>
            </div>
          )}
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 max-w-2xl mx-auto">
            <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Billing toggle */}
        {hasYearlyOption && (
          <div className="flex items-center justify-center mb-8">
            <div className="bg-white border border-slate-200 rounded-xl p-1 inline-flex shadow-sm">
              <button
                type="button"
                onClick={() => setBillingInterval('monthly')}
                className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
                  billingInterval === 'monthly'
                    ? 'bg-teal-600 text-white shadow-md'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {t('subscription.monthly')}
              </button>
              <button
                type="button"
                onClick={() => setBillingInterval('yearly')}
                className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center gap-2 ${
                  billingInterval === 'yearly'
                    ? 'bg-teal-600 text-white shadow-md'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {t('subscription.yearly')}
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                  billingInterval === 'yearly'
                    ? 'bg-teal-500 text-white'
                    : 'bg-emerald-100 text-emerald-700'
                }`}>
                  -17%
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Plans */}
        {plansLoading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
          </div>
        ) : plans.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-500">{t('subscription.noPlansAvailable')}</p>
          </div>
        ) : (
          <div className={`grid gap-6 ${plans.length === 1 ? 'max-w-sm mx-auto' : plans.length === 2 ? 'md:grid-cols-2 max-w-2xl mx-auto' : 'md:grid-cols-3 max-w-4xl mx-auto'}`}>
            {plans.map((plan) => {
              const IconComp = getPlanIcon(plan);
              const isSelected = selectedPlanId === plan.id;
              const isPopular = plan.id === popularPlanId;

              return (
                <button
                  key={plan.id}
                  onClick={() => setSelectedPlanId(plan.id)}
                  className={`relative text-left rounded-2xl p-6 transition-all duration-300 ${
                    isSelected
                      ? 'ring-2 ring-teal-500 bg-teal-50/50 shadow-lg'
                      : 'bg-white border border-slate-200 hover:border-teal-300 hover:shadow-md'
                  }`}
                >
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="bg-teal-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                        {t('common.recommended')}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between mb-4">
                    <div className={`p-2.5 rounded-xl ${isSelected ? 'bg-teal-100' : 'bg-slate-100'}`}>
                      <IconComp className={`h-5 w-5 ${isSelected ? 'text-teal-600' : 'text-slate-500'}`} />
                    </div>
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                        isSelected ? 'border-teal-500 bg-teal-500' : 'border-slate-300'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 text-white" />}
                    </div>
                  </div>

                  <h3 className="text-lg font-bold text-slate-800">{plan.display_name}</h3>
                  <p className="text-sm text-slate-500 mt-1">{plan.description}</p>

                  <div className="mt-4 mb-5">
                    <span className="text-3xl font-extrabold text-slate-900">
                      {getPlanPrice(plan)}
                    </span>
                    {Number(plan.price_monthly) > 0 && (
                      <span className="text-sm text-slate-500">{getPlanPeriodLabel(plan)}</span>
                    )}
                    {(() => {
                      const savings = getYearlySavings(plan);
                      if (!savings) return null;
                      return (
                        <span className="ml-2 inline-block text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                          {t('subscription.save')} {savings}%
                        </span>
                      );
                    })()}
                    {billingInterval === 'yearly' && plan.price_yearly != null && Number(plan.price_monthly) > 0 && (
                      <div className="text-xs text-slate-400 mt-1 line-through">
                        {(Number(plan.price_monthly) * 12).toFixed(2)}{'\u20AC'}/{t('subscription.yearShort')}
                      </div>
                    )}
                  </div>

                  <ul className="space-y-2">
                    {(plan.features as string[]).map((feature) => (
                      <li key={feature} className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-teal-500 mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-slate-600">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </button>
              );
            })}
          </div>
        )}

        {/* Checkout button */}
        {plans.length > 0 && !plansLoading && (
          <div className="mt-10 text-center">
            <button
              onClick={handleCheckout}
              disabled={checkoutLoading || !selectedPlanId}
              className="inline-flex items-center gap-2.5 px-10 py-4 bg-teal-600 text-white font-bold text-lg rounded-2xl hover:bg-teal-700 transition-all duration-200 shadow-lg shadow-teal-600/25 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {checkoutLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <CreditCard className="w-5 h-5" />
              )}
              {t('subscription.subscribeNow')}
            </button>
            <p className="mt-3 text-sm text-slate-400">{t('subscription.cancelAnytime')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
