import type { ReactNode } from 'react';
import { useSubscription } from '../../contexts/SubscriptionContext';
import type { Feature } from '../../types';
import UpgradePrompt from './UpgradePrompt';

interface FeatureGateProps {
  feature: Feature;
  children: ReactNode;
  fallback?: ReactNode;
  inline?: boolean;
}

export default function FeatureGate({ feature, children, fallback, inline }: FeatureGateProps) {
  const { canAccess } = useSubscription();

  if (canAccess(feature)) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  if (inline) {
    return <UpgradePrompt feature={feature} compact />;
  }

  return <UpgradePrompt feature={feature} />;
}
