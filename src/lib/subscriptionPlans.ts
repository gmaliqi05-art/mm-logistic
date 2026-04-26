import { Zap, Star, Shield, Crown, Briefcase, Calculator, type LucideIcon } from 'lucide-react';
import { supabase } from './supabase';
import type { ProductType, SubscriptionPlan } from '../types';

export async function fetchActivePlans(productType?: ProductType): Promise<SubscriptionPlan[]> {
  let query = supabase
    .from('subscription_plans')
    .select('*')
    .eq('is_active', true)
    .order('sort_order')
    .order('price_monthly');
  if (productType) query = query.eq('product_type', productType);
  const { data, error } = await query;
  if (error) return [];
  return (data ?? []) as SubscriptionPlan[];
}

export function getPlanIcon(plan: Pick<SubscriptionPlan, 'price_monthly' | 'product_type' | 'trial_days'>): LucideIcon {
  if (plan.price_monthly === 0 || plan.trial_days > 0) return Zap;
  if (plan.product_type === 'accounting') {
    return plan.price_monthly >= 50 ? Crown : Calculator;
  }
  return plan.price_monthly >= 50 ? Shield : Star;
}

export function pickPopularPlan(plans: SubscriptionPlan[]): string | null {
  const paid = plans.filter((p) => Number(p.price_monthly) > 0).sort(
    (a, b) => Number(a.price_monthly) - Number(b.price_monthly)
  );
  if (paid.length === 0) return null;
  if (paid.length === 1) return paid[0].id;
  return paid[Math.floor((paid.length - 1) / 2)].id;
}

export const PRODUCT_TYPE_META: Record<ProductType, { label: string; icon: LucideIcon }> = {
  logistics: { label: 'Logjistika', icon: Briefcase },
  accounting: { label: 'Kontabiliteti', icon: Calculator },
};
