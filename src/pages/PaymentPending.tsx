import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard, Clock, AlertTriangle, ArrowRight, Loader2, LogOut } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import { useTranslation } from '../i18n';

export default function PaymentPending() {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const { subscription, plan, isPendingPayment, refreshSubscription } = useSubscription();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);

  if (!isPendingPayment) {
    navigate('/company', { replace: true });
    return null;
  }

  async function handleRetryPayment() {
    if (!profile || !subscription?.plan_id) return;
    setLoading(true);
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
            planId: subscription.plan_id,
            successUrl: `${window.location.origin}/payment-success`,
            cancelUrl: `${window.location.origin}/payment-pending`,
            isUpgrade: false,
          }),
        }
      );

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      // Stay on page
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckStatus() {
    setChecking(true);
    await refreshSubscription();
    setTimeout(() => setChecking(false), 1000);
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-lg w-full">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-amber-50 border-b border-amber-200 p-6 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 mb-4">
              <Clock className="w-8 h-8 text-amber-600" />
            </div>
            <h1 className="text-2xl font-bold text-slate-800">{t('payment.pendingTitle')}</h1>
            <p className="mt-2 text-amber-700 text-sm font-medium">
              {t('payment.pendingSubtitle')}
            </p>
          </div>

          <div className="p-6 space-y-6">
            <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-slate-600 leading-relaxed">
                {t('payment.pendingExplanation')}
              </div>
            </div>

            {plan && (
              <div className="p-4 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">{t('auth.plan')}</span>
                  <span className="font-semibold text-slate-800">{plan.display_name}</span>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-sm text-slate-500">{t('auth.monthlyPrice')}</span>
                  <span className="font-bold text-teal-700">{plan.price_monthly}&euro;/{t('common.month')}</span>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <button
                onClick={handleRetryPayment}
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-teal-600 text-white font-semibold rounded-xl hover:bg-teal-700 transition-all shadow-lg shadow-teal-600/25 disabled:opacity-60"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CreditCard className="w-5 h-5" />}
                {t('payment.completePayment')}
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                onClick={handleCheckStatus}
                disabled={checking}
                className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 border border-slate-200 text-slate-600 font-medium rounded-xl hover:bg-slate-50 transition-all disabled:opacity-60"
              >
                {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {t('payment.checkStatus')}
              </button>

              <button
                onClick={() => signOut()}
                className="w-full inline-flex items-center justify-center gap-2 px-6 py-2.5 text-slate-400 text-sm hover:text-slate-600 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                {t('common.logout')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
