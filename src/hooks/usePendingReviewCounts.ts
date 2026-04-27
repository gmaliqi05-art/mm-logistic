import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface PendingReviewCounts {
  deliveries: number;
  pickups: number;
  repairs: number;
  total: number;
  loading: boolean;
}

export function usePendingReviewCounts(companyId?: string | null): PendingReviewCounts {
  const [counts, setCounts] = useState<PendingReviewCounts>({
    deliveries: 0,
    pickups: 0,
    repairs: 0,
    total: 0,
    loading: true,
  });

  useEffect(() => {
    if (!companyId) {
      setCounts({ deliveries: 0, pickups: 0, repairs: 0, total: 0, loading: false });
      return;
    }

    let active = true;

    async function fetchCounts() {
      const [delRes, pickRes, repRes] = await Promise.all([
        supabase
          .from('delivery_notes')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .eq('type', 'delivery')
          .eq('status', 'pending_company_review'),
        supabase
          .from('delivery_notes')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .eq('type', 'pickup')
          .eq('status', 'pending_company_review'),
        supabase
          .from('depot_repair_reports')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .eq('review_status', 'pending_company_review'),
      ]);
      if (!active) return;
      const deliveries = delRes.count ?? 0;
      const pickups = pickRes.count ?? 0;
      const repairs = repRes.count ?? 0;
      setCounts({
        deliveries,
        pickups,
        repairs,
        total: deliveries + pickups + repairs,
        loading: false,
      });
    }

    fetchCounts();

    const ch = supabase
      .channel(`pending-review-counts-${companyId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'delivery_notes', filter: `company_id=eq.${companyId}` },
        () => fetchCounts(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'depot_repair_reports', filter: `company_id=eq.${companyId}` },
        () => fetchCounts(),
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(ch);
    };
  }, [companyId]);

  return counts;
}
