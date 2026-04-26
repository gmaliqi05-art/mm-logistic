import { AlertTriangle, Clock, Crown, X } from 'lucide-react';
import { useState } from 'react';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { useTranslation } from '../../i18n';

export default function SubscriptionBanner() {
  const { isExpired, isTrial, daysRemaining } = useSubscription();
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  if (isExpired) {
    return (
      <div className="bg-red-600 text-white px-4 py-3">
        <div className="flex items-center justify-center gap-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <div className="text-sm font-medium">
            {t('subscription.expired')}
          </div>
          <button className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-white text-red-600 text-sm font-semibold rounded-lg hover:bg-red-50 transition-colors ml-2">
            <Crown className="w-4 h-4" />
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
          <button className="inline-flex items-center gap-1.5 px-3 py-1 bg-white text-amber-600 text-xs font-semibold rounded-lg hover:bg-amber-50 transition-colors">
            <Crown className="w-3.5 h-3.5" />
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
