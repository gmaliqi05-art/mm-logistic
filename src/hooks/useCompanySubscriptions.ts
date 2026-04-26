import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface Result {
  loading: boolean;
  hasLogistics: boolean;
  hasAccounting: boolean;
}

export function useCompanySubscriptions(): Result {
  const { profile } = useAuth();
  const [hasLogistics, setHasLogistics] = useState(false);
  const [hasAccounting, setHasAccounting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.company_id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('company_subscriptions')
        .select('status, plan:subscription_plans(product_type)')
        .eq('company_id', profile.company_id)
        .in('status', ['trial', 'active']);

      if (cancelled) return;
      const rows = (data ?? []) as unknown as Array<{ status: string; plan: { product_type: string } | { product_type: string }[] | null }>;
      const productTypes = rows.flatMap((r) => {
        if (!r.plan) return [];
        return Array.isArray(r.plan) ? r.plan.map((p) => p.product_type) : [r.plan.product_type];
      });
      setHasLogistics(productTypes.includes('logistics'));
      setHasAccounting(productTypes.includes('accounting'));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [profile?.company_id]);

  return { loading, hasLogistics, hasAccounting };
}
