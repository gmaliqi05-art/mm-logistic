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
  isPendingPayment: boolean;
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
      // Fetch ALL active/trial subscriptions for the company, not just the
      // newest one. A tenant who buys the accounting addon ends up with two
      // rows (primary logistics + addon accounting); the addon is newer, so
      // the previous `.limit(1).order(created_at desc)` made `plan` point at
      // the addon and effectively downgraded the user's feature set in the
      // UI (max_drivers, max_depots, feature_keys all wrong). Picking the
      // non-addon plan keeps the primary plan as the source of truth for
      // limits + features; accounting access stays gated separately via
      // companies.accounting_enabled.
      const { data, error } = await supabase
        .from('company_subscriptions')
        .select('*, plan:subscription_plans(*)')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('Failed to fetch subscription', { error });
        setSubscription(null);
        setPlan(null);
        return;
      }

      const rows = (data ?? []) as Array<CompanySubscription & { plan: (PlanRow & { is_addon?: boolean; product_type?: string }) | null }>;
      // Prefer an active/trial row whose plan is the primary (not an addon
      // and not the accounting product), falling back to any active/trial,
      // then to the newest row regardless of status (so we still surface
      // expired/cancelled state to the gating UI).
      const isPrimaryPlan = (p: (PlanRow & { is_addon?: boolean; product_type?: string }) | null) =>
        !!p && !p.is_addon && p.product_type !== 'accounting';
      const liveStatuses = new Set(['active', 'trial', 'past_due', 'pending_payment']);
      const primary = rows.find((r) => liveStatuses.has(r.status) && isPrimaryPlan(r.plan));
      const anyLive = primary ?? rows.find((r) => liveStatuses.has(r.status));
      const chosen = anyLive ?? rows[0] ?? null;

      if (chosen) {
        setSubscription(chosen);
        setPlan((chosen.plan ?? null) as PlanRow | null);
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
      // Also watch the companies row itself — stripe-webhook flips
      // accounting_enabled there directly (PR #149), and without this
      // listener the UI stayed stale until the next mount or login. See
      // audit finding 1.4.
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'companies', filter: `id=eq.${companyId}` },
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

  const isPendingPayment = subscription?.status === 'pending_payment';

  const isExpired = (() => {
    if (!subscription) return false;
    if (subscription.status === 'expired' || subscription.status === 'cancelled') return true;
    if (isPendingPayment) return true;
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
    // Audit entries are written unconditionally so the history exists for
    // compliance (and so it is visible to a company if they later upgrade to
    // a plan that includes the audit log feature). Viewing the log is still
    // gated by canAccess('audit_log') at the route / menu level.
    if (!profile?.company_id) return;
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
        isPendingPayment,
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
