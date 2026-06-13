import { AlertTriangle, Clock, CheckCircle2 } from 'lucide-react';
import { useTranslation } from '../../i18n';
import { limitationStatus, daysUntilLimitation } from '../../utils/palletReconciliation';
import type { PalletAccountAgingStatus } from '../../types';

interface LimitationBadgeProps {
  ageDays: number | null | undefined;
  compact?: boolean;
}

const STYLES: Record<PalletAccountAgingStatus, { cls: string; Icon: typeof Clock }> = {
  ok: { cls: 'bg-emerald-100 text-emerald-800 border-emerald-200', Icon: CheckCircle2 },
  warning: { cls: 'bg-amber-100 text-amber-800 border-amber-200', Icon: Clock },
  critical: { cls: 'bg-orange-100 text-orange-800 border-orange-200', Icon: AlertTriangle },
  expired: { cls: 'bg-red-100 text-red-800 border-red-200', Icon: AlertTriangle },
};

/**
 * Renders the §439 HGB limitation status as a coloured badge. Reads
 * the raw ageDays (from v_pallet_account_aging.oldest_open_txn_age_days)
 * and runs it through src/utils/palletReconciliation.limitationStatus.
 *
 * Compact mode hides the day count and shows only the label — useful
 * inside dense list rows.
 */
export default function LimitationBadge({ ageDays, compact }: LimitationBadgeProps) {
  const { t } = useTranslation();
  const status = limitationStatus(ageDays);
  const { cls, Icon } = STYLES[status];

  const labelMap: Record<PalletAccountAgingStatus, string> = {
    ok: t('common.palletReconciliation.limitationOk'),
    warning: t('common.palletReconciliation.limitationWarning'),
    critical: t('common.palletReconciliation.limitationCritical'),
    expired: t('common.palletReconciliation.limitationExpired'),
  };

  const remaining = daysUntilLimitation(ageDays);
  const trailer = remaining == null
    ? ''
    : remaining < 0
      ? ` · ${Math.abs(remaining)} ${t('common.palletReconciliation.daysExpired')}`
      : ` · ${remaining} ${t('common.palletReconciliation.daysRemaining')}`;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${cls}`}>
      <Icon className="w-3 h-3" />
      <span>{labelMap[status]}{!compact && trailer}</span>
    </span>
  );
}
