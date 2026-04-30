import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import type { CompanySubscription, SubscriptionPlan, Feature, PlanTier, CompanyFeature } from '../types';

const PLAN_FEATURES: Record<PlanTier, Set<Feature>> = {
  free_trial: new Set([
    'basic_reports',
  ]),
  standard: new Set([
    'documents_signing',
    'basic_reports',
    'categories',
    'export_pdf',
  ]),
  premium: new Set([
    'documents_signing',
    'basic_reports',
    'categories',
    'advanced_reports',
    'export_pdf',
    'export_excel',
    'audit_log',
    'bulk_operations',
    'stock_alerts',
    'data_export',
  ]),
};

interface SubscriptionContextType {
  subscription: CompanySubscription | null;
  plan: SubscriptionPlan | null;
  planTier: PlanTier;
  loading: boolean;
  isExpired: boolean;
  isTrial: boolean;
  daysRemaining: number;
  companyFeatures: CompanyFeature[];
  accountingEnabled: boolean;
  canAccess: (feature: Feature) => boolean;
  isWithinLimit: (type: 'drivers' | 'depots', currentCount: number) => boolean;
  getLimit: (type: 'drivers' | 'depots') => number;
  logAudit: (action: string, entityType: string, entityId?: string, details?: Record<string, unknown>) => Promise<void>;
  refreshSubscription: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [subscription, setSubscription] = useState<CompanySubscription | null>(null);
  const [plan, setPlan] = useState<SubscriptionPlan | null>(null);
  const [companyFeatures, setCompanyFeatures] = useState<CompanyFeature[]>([]);
  const [accountingEnabled, setAccountingEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchSubscription = async (companyId: string) => {
    try {
      const { data, error } = await supabase
        .from('company_subscriptions')
        .select('*, plan:subscription_plans(*)')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Failed to fetch subscription:', error);
        setSubscription(null);
        setPlan(null);
        return;
      }

      if (data) {
        setSubscription(data);
        setPlan(data.plan as SubscriptionPlan);
      } else {
        setSubscription(null);
        setPlan(null);
      }

      const { data: featuresData, error: featuresError } = await supabase
        .from('company_features')
        .select('*')
        .eq('company_id', companyId)
        .eq('is_enabled', true);

      if (featuresError) {
        console.error('Failed to fetch company features:', featuresError);
        setCompanyFeatures([]);
      } else {
        setCompanyFeatures(featuresData ?? []);
      }

      const { data: companyRow } = await supabase
        .from('companies')
        .select('accounting_enabled')
        .eq('id', companyId)
        .maybeSingle();
      setAccountingEnabled(Boolean((companyRow as { accounting_enabled?: boolean } | null)?.accounting_enabled));
    } catch (err) {
      console.error('Unexpected error fetching subscription:', err);
      setSubscription(null);
      setPlan(null);
      setCompanyFeatures([]);
      setAccountingEnabled(false);
    }
  };

  useEffect(() => {
    if (profile?.company_id) {
      fetchSubscription(profile.company_id).finally(() => setLoading(false));
    } else if (profile?.role === 'super_admin') {
      setLoading(false);
    } else {
      setLoading(false);
    }
  }, [profile?.company_id, profile?.role]);

  const planTier: PlanTier = (plan?.name as PlanTier) || 'free_trial';

  const isTrial = subscription?.status === 'trial';

  const isExpired = (() => {
    if (!subscription) return false;
    if (subscription.status === 'expired' || subscription.status === 'cancelled') return true;
    if (isTrial && subscription.trial_end) {
      return new Date(subscription.trial_end) < new Date();
    }
    if (subscription.current_period_end) {
      return new Date(subscription.current_period_end) < new Date();
    }
    return false;
  })();

  const daysRemaining = (() => {
    if (!subscription) return 0;
    const endDate = isTrial ? subscription.trial_end : subscription.current_period_end;
    if (!endDate) return 0;
    const diff = new Date(endDate).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  })();

  const canAccess = (feature: Feature): boolean => {
    if (profile?.role === 'super_admin') return true;

    const manualFeature = companyFeatures.find((f) => f.feature === feature);
    if (manualFeature) {
      return manualFeature.is_enabled;
    }

    if (isExpired) return false;
    return PLAN_FEATURES[planTier]?.has(feature) ?? false;
  };

  const isWithinLimit = (type: 'drivers' | 'depots', currentCount: number): boolean => {
    if (profile?.role === 'super_admin') return true;
    if (!plan) return true;
    const limit = type === 'drivers' ? plan.max_drivers : plan.max_depots;
    if (limit === -1) return true;
    return currentCount < limit;
  };

  const getLimit = (type: 'drivers' | 'depots'): number => {
    if (!plan) return 0;
    return type === 'drivers' ? plan.max_drivers : plan.max_depots;
  };

  const logAudit = async (
    action: string,
    entityType: string,
    entityId?: string,
    details?: Record<string, unknown>
  ) => {
    if (!profile?.company_id || !canAccess('audit_log')) return;
    await supabase.from('audit_logs').insert({
      company_id: profile.company_id,
      user_id: profile.id,
      action,
      entity_type: entityType,
      entity_id: entityId || null,
      details: details || {},
    });
  };

  const refreshSubscription = async () => {
    if (profile?.company_id) {
      await fetchSubscription(profile.company_id);
    }
  };

  return (
    <SubscriptionContext.Provider
      value={{
        subscription,
        plan,
        planTier,
        loading,
        isExpired,
        isTrial,
        daysRemaining,
        companyFeatures,
        accountingEnabled,
        canAccess,
        isWithinLimit,
        getLimit,
        logAudit,
        refreshSubscription,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (!context) throw new Error('useSubscription must be used within SubscriptionProvider');
  return context;
}
