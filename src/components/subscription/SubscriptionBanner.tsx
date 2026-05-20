import { AlertTriangle, Clock, Crown, X, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { useTranslation } from '../../i18n';
import { supabase } from '../../lib/supabase';

export default function SubscriptionBanner() {
  const { isExpired, isInvalid, isTrial, daysRemaining } = useSubscription();
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleUpgradeClick() {
    setLoading(true);
    try {
      const { data: plans } = await supabase
        .from('subscription_plans')
        .select('id, stripe_price_id')
        .eq('name', 'standard')
        .eq('is_active', true)
        .maybeSingle();

      if (!plans?.stripe_price_id) {
        window.location.href = '/company/settings';
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        window.location.href = '/login';
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
            planId: plans.id,
            successUrl: `${window.location.origin}/payment-success`,
            cancelUrl: window.location.href,
            isUpgrade: true,
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

  if (dismissed) return null;

  if (isInvalid) {
    return (
      <div className="bg-red-700 text-white px-4 py-3">
        <div className="flex items-center justify-center gap-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <div className="text-sm font-medium">
            Subscription configuration is invalid. Please contact support.
          </div>
        </div>
      </div>
    );
  }

  if (isExpired) {
    return (
      <div className="bg-red-600 text-white px-4 py-3">
        <div className="flex items-center justify-center gap-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <div className="text-sm font-medium">
            {t('subscription.expired')}
          </div>
          <button
            onClick={handleUpgradeClick}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-white text-red-600 text-sm font-semibold rounded-lg hover:bg-red-50 transition-colors ml-2 disabled:opacity-60"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crown className="w-4 h-4" />}
            {t('subscription.renewNow')}
          </button>
        </div>
      </div>
    );
  }

  if (isTrial) {
    // Three urgency tiers across the whole trial window, not just the
    // last seven days. The audit flagged that customers in days 8-30
    // got no countdown at all and so had nothing telling them the trial
    // would end soon.
    let bg = 'bg-slate-700';
    let buttonText = 'text-slate-700';
    let bgHover = 'hover:bg-slate-800';
    let message: string;

    if (daysRemaining <= 0) {
      // Last day of trial — strong red urgency
      bg = 'bg-red-600';
      buttonText = 'text-red-600';
      bgHover = 'hover:bg-red-700';
      message = t('subscription.trialEndingToday');
    } else if (daysRemaining <= 7) {
      // Critical window
      bg = 'bg-amber-500';
      buttonText = 'text-amber-600';
      bgHover = 'hover:bg-amber-600';
      message = t('subscription.trialExpiring').replace('{days}', String(daysRemaining));
    } else if (daysRemaining <= 14) {
      // Warning
      bg = 'bg-amber-400';
      buttonText = 'text-amber-700';
      bgHover = 'hover:bg-amber-500';
      message = t('subscription.trialActive').replace('{days}', String(daysRemaining));
    } else {
      // Informational
      message = t('subscription.trialActive').replace('{days}', String(daysRemaining));
    }

    return (
      <div className={`${bg} text-white px-4 py-2.5`}>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <Clock className="w-4 h-4 flex-shrink-0" />
          <div className="text-sm font-medium">
            {message}
          </div>
          <button
            onClick={handleUpgradeClick}
            disabled={loading}
            className={`inline-flex items-center gap-1.5 px-3 py-1 bg-white ${buttonText} text-xs font-semibold rounded-lg hover:bg-white/90 transition-colors disabled:opacity-60`}
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Crown className="w-3.5 h-3.5" />}
            {t('subscription.upgrade')}
          </button>
          <button
            onClick={() => setDismissed(true)}
            className={`p-1 ${bgHover} rounded-lg transition-colors ml-1`}
            aria-label="dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return null;
}
