import { Crown, Zap, Gift } from 'lucide-react';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { useTranslation } from '../../i18n';

export default function PlanBadge() {
  const { planTier, isTrial, daysRemaining } = useSubscription();
  const { t } = useTranslation();

  const config = {
    free_trial: {
      label: t('subscription.freePlan'),
      icon: Gift,
      className: 'bg-gray-100 text-gray-700 border-gray-200',
    },
    standard: {
      label: t('subscription.standardPlan'),
      icon: Zap,
      className: 'bg-blue-50 text-blue-700 border-blue-200',
    },
    premium: {
      label: t('subscription.premiumPlan'),
      icon: Crown,
      className: 'bg-amber-50 text-amber-700 border-amber-200',
    },
  };

  const c = config[planTier];
  const Icon = c.icon;

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${c.className}`}>
      <Icon className="w-3.5 h-3.5" />
      {c.label}
      {isTrial && daysRemaining > 0 && (
        <span className="text-[10px] opacity-75">({daysRemaining}d)</span>
      )}
    </div>
  );
}
