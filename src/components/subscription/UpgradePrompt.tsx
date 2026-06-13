import { useState } from 'react';
import { Crown, Lock, ArrowRight, Sparkles, Loader2 } from 'lucide-react';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { useTranslation } from '../../i18n';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Feature } from '../../types';

interface UpgradePromptProps {
  feature: Feature;
  compact?: boolean;
}

export default function UpgradePrompt({ feature, compact }: UpgradePromptProps) {
  const { planTier } = useSubscription();
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [upgrading, setUpgrading] = useState(false);

  const featureLabels: Record<Feature, { title: string; description: string; requiredPlan: string }> = {
    documents_signing: {
      title: t('subscription.features.documents_signing'),
      description: t('subscription.features.documents_signing_desc'),
      requiredPlan: t('subscription.standardPlan'),
    },
    basic_reports: {
      title: t('subscription.features.basic_reports'),
      description: t('subscription.features.basic_reports_desc'),
      requiredPlan: t('subscription.standardPlan'),
    },
    categories: {
      title: t('subscription.features.categories'),
      description: t('subscription.features.categories_desc'),
      requiredPlan: t('subscription.standardPlan'),
    },
    advanced_reports: {
      title: t('subscription.features.advanced_reports'),
      description: t('subscription.features.advanced_reports_desc'),
      requiredPlan: t('subscription.premiumPlan'),
    },
    export_pdf: {
      title: t('subscription.features.export_pdf'),
      description: t('subscription.features.export_pdf_desc'),
      requiredPlan: t('subscription.premiumPlan'),
    },
    export_excel: {
      title: t('subscription.features.export_excel'),
      description: t('subscription.features.export_excel_desc'),
      requiredPlan: t('subscription.premiumPlan'),
    },
    audit_log: {
      title: t('subscription.features.audit_log'),
      description: t('subscription.features.audit_log_desc'),
      requiredPlan: t('subscription.premiumPlan'),
    },
    bulk_operations: {
      title: t('subscription.features.bulk_operations'),
      description: t('subscription.features.bulk_operations_desc'),
      requiredPlan: t('subscription.premiumPlan'),
    },
    stock_alerts: {
      title: t('subscription.features.stock_alerts'),
      description: t('subscription.features.stock_alerts_desc'),
      requiredPlan: t('subscription.premiumPlan'),
    },
    data_export: {
      title: t('subscription.features.data_export'),
      description: t('subscription.features.data_export_desc'),
      requiredPlan: t('subscription.premiumPlan'),
    },
    fleet_reports: {
      title: t('subscription.features.fleet_reports'),
      description: t('subscription.features.fleet_reports_desc'),
      requiredPlan: t('subscription.premiumPlan'),
    },
    hr: {
      title: t('subscription.features.hr'),
      description: t('subscription.features.hr_desc'),
      requiredPlan: t('subscription.premiumPlan'),
    },
    email_automation: {
      title: t('subscription.features.email_automation'),
      description: t('subscription.features.email_automation_desc'),
      requiredPlan: t('subscription.premiumPlan'),
    },
    api_webhooks: {
      title: t('subscription.features.api_webhooks'),
      description: t('subscription.features.api_webhooks_desc'),
      requiredPlan: t('subscription.premiumPlan'),
    },
    sorting: {
      title: t('subscription.features.sorting'),
      description: t('subscription.features.sorting_desc'),
      requiredPlan: t('subscription.premiumPlan'),
    },
    repairs: {
      title: t('subscription.features.repairs'),
      description: t('subscription.features.repairs_desc'),
      requiredPlan: t('subscription.premiumPlan'),
    },
    driver_tracking: {
      title: t('subscription.features.driver_tracking'),
      description: t('subscription.features.driver_tracking_desc'),
      requiredPlan: t('subscription.premiumPlan'),
    },
  };

  const info = featureLabels[feature];

  const currentPlanLabel = planTier === 'free_trial' ? t('subscription.freePlan') : planTier === 'standard' ? t('subscription.standardPlan') : t('subscription.premiumPlan');

  async function handleUpgrade() {
    if (!profile) return;
    setUpgrading(true);
    try {
      const targetPlanName = info.requiredPlan === t('subscription.premiumPlan') ? 'premium' : 'standard';
      const { data: plans } = await supabase
        .from('subscription_plans')
        .select('id, stripe_price_id')
        .eq('name', targetPlanName)
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
      // Silently fail - user stays on page
    } finally {
      setUpgrading(false);
    }
  }

  if (compact) {
    return (
      <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl">
        <div className="p-2 bg-amber-100 rounded-lg">
          <Lock className="w-4 h-4 text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-amber-900">{info.title}</p>
          <p className="text-xs text-amber-600">
            {t('subscription.requiredPlan')} {info.requiredPlan}
          </p>
        </div>
        <button
          onClick={handleUpgrade}
          disabled={upgrading}
          className="flex items-center gap-1 px-3 py-1.5 bg-amber-600 text-white text-xs font-medium rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-60"
        >
          {upgrading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Crown className="w-3.5 h-3.5" />}
          {t('subscription.upgrade')}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 px-6">
      <div className="max-w-md text-center">
        <div className="mx-auto w-20 h-20 bg-gradient-to-br from-amber-100 to-orange-100 rounded-2xl flex items-center justify-center mb-6 shadow-sm">
          <Sparkles className="w-10 h-10 text-amber-600" />
        </div>

        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          {info.title}
        </h2>

        <p className="text-gray-500 mb-6 leading-relaxed">
          {info.description}
        </p>

        <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-full text-sm text-gray-600 mb-6">
          <span>{t('subscription.currentPlan')}:</span>
          <span className="font-semibold text-gray-900">{currentPlanLabel}</span>
          <ArrowRight className="w-4 h-4 text-gray-400" />
          <span className="font-semibold text-amber-600">{info.requiredPlan}</span>
        </div>

        <div className="space-y-3">
          <button
            onClick={handleUpgrade}
            disabled={upgrading}
            className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold rounded-xl hover:from-amber-600 hover:to-orange-600 transition-all shadow-lg shadow-amber-500/25 disabled:opacity-60"
          >
            {upgrading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Crown className="w-5 h-5" />}
            {t('subscription.upgradeToAccess')} {info.requiredPlan}
          </button>
          <p className="text-xs text-gray-400">
            {t('subscription.cancelAnytime')}
          </p>
        </div>
      </div>
    </div>
  );
}
