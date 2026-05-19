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

  if (isTrial && daysRemaining <= 7 && daysRemaining > 0) {
    return (
      <div className="bg-amber-500 text-white px-4 py-2.5">
        <div className="flex items-center justify-center gap-3">
          <Clock className="w-4 h-4 flex-shrink-0" />
          <div className="text-sm font-medium">
            {t('subscription.trialExpiring').replace('{days}', String(daysRemaining))}
          </div>
          <button
            onClick={handleUpgradeClick}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1 bg-white text-amber-600 text-xs font-semibold rounded-lg hover:bg-amber-50 transition-colors disabled:opacity-60"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Crown className="w-3.5 h-3.5" />}
            {t('subscription.upgrade')}
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="p-1 hover:bg-amber-600 rounded-lg transition-colors ml-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return null;
}
