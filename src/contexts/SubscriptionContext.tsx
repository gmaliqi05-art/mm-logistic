import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { logger } from '../utils/logger';
import { useAuth } from './AuthContext';
import type { CompanySubscription, SubscriptionPlan, Feature, PlanTier, CompanyFeature } from '../types';

interface SubscriptionContextType {
  subscription: CompanySubscription | null;
  plan: SubscriptionPlan | null;
  planTier: PlanTier;
  loading: boolean;
  isExpired: boolean;
  isInvalid: boolean;
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

type PlanRow = SubscriptionPlan & { feature_keys?: string[] | null };

function extractPlanFeatures(plan: PlanRow | null): Set<Feature> {
  if (!plan) return new Set();
  const keys = Array.isArray(plan.feature_keys) ? plan.feature_keys : [];
  return new Set(keys as Feature[]);
}

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [subscription, setSubscription] = useState<CompanySubscription | null>(null);
  const [plan, setPlan] = useState<PlanRow | null>(null);
  const [companyFeatures, setCompanyFeatures] = useState<CompanyFeature[]>([]);
  const [accountingEnabled, setAccountingEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const companyIdRef = useRef<string | null>(null);

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
        logger.error('Failed to fetch subscription', { error });
        setSubscription(null);
        setPlan(null);
        return;
      }

      if (data) {
        setSubscription(data);
        setPlan((data.plan ?? null) as PlanRow | null);
      } else {
        setSubscription(null);
        setPlan(null);
      }

      const { data: featuresData, error: featuresError } = await supabase
        .from('company_features')
        .select('*')
        .eq('company_id', companyId);

      if (featuresError) {
        logger.error('Failed to fetch company features', { error: featuresError });
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
      logger.error('Unexpected error fetching subscription', { error: err });
      setSubscription(null);
      setPlan(null);
      setCompanyFeatures([]);
      setAccountingEnabled(false);
    }
  };

  useEffect(() => {
    companyIdRef.current = profile?.company_id ?? null;
    if (profile?.company_id) {
      fetchSubscription(profile.company_id).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [profile?.company_id, profile?.role]);

  // Realtime updates for plan definitions, company subscription, and feature overrides
  useEffect(() => {
    const companyId = profile?.company_id;
    if (!companyId) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (companyIdRef.current) fetchSubscription(companyIdRef.current);
      }, 300);
    };

    const channel = supabase
      .channel(`subscription-${companyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subscription_plans' }, debouncedRefresh)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'company_subscriptions', filter: `company_id=eq.${companyId}` },
        debouncedRefresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'company_features', filter: `company_id=eq.${companyId}` },
        debouncedRefresh,
      )
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [profile?.company_id]);

  const planTier: PlanTier = (plan?.name as PlanTier) || 'free_trial';
  const isTrial = subscription?.status === 'trial';

  const isInvalid = Boolean(
    subscription && subscription.status === 'active' && !subscription.current_period_end,
  );

  const isExpired = (() => {
    if (!subscription) return false;
    if (subscription.status === 'expired' || subscription.status === 'cancelled') return true;
    if (isInvalid) return true;
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
    return extractPlanFeatures(plan).has(feature);
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
    details?: Record<string, unknown>,
  ) => {
    if (!profile?.company_id || !canAccess('audit_log')) return;
    const { error } = await supabase.from('audit_logs').insert({
      company_id: profile.company_id,
      user_id: profile.id,
      action,
      entity_type: entityType,
      entity_id: entityId || null,
      details: details || {},
    });
    if (error) {
      logger.warn('audit_logs insert failed', { error: error.message, action, entityType });
    }
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
        isInvalid,
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
