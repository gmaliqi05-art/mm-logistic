import { useEffect, useMemo, useState } from 'react';
import { Clock, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { formatCurrency } from '../../types/accounting';
import { useTranslation } from '../../i18n';

type BucketKey = 'current' | '1-30' | '31-60' | '61-90' | '90+';

interface Bucket {
  key: BucketKey;
  label: string;
  count: number;
  total: number;
  color: string;
}

function bucketFor(daysOverdue: number): BucketKey {
  if (daysOverdue <= 0) return 'current';
  if (daysOverdue <= 30) return '1-30';
  if (daysOverdue <= 60) return '31-60';
  if (daysOverdue <= 90) return '61-90';
  return '90+';
}

export default function ArAgeingWidget() {
  const { profile } = useAuth();
  const { t } = useTranslation();

  const initialBuckets = useMemo<Bucket[]>(
    () => [
      { key: 'current', label: t('accounting.arAgeing.current'), count: 0, total: 0, color: 'bg-emerald-500' },
      { key: '1-30', label: t('accounting.arAgeing.days1_30'), count: 0, total: 0, color: 'bg-amber-400' },
      { key: '31-60', label: t('accounting.arAgeing.days31_60'), count: 0, total: 0, color: 'bg-orange-500' },
      { key: '61-90', label: t('accounting.arAgeing.days61_90'), count: 0, total: 0, color: 'bg-red-500' },
      { key: '90+', label: t('accounting.arAgeing.days90plus'), count: 0, total: 0, color: 'bg-red-700' },
    ],
    [t],
  );

  const [buckets, setBuckets] = useState<Bucket[]>(initialBuckets);
  const [loading, setLoading] = useState(true);
  const [grandTotal, setGrandTotal] = useState(0);

  useEffect(() => {
    if (!profile?.company_id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('acc_invoices')
        .select('id, total, due_date, status')
        .eq('company_id', profile.company_id)
        .in('status', ['sent', 'partial', 'overdue']);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const working = initialBuckets.map((b) => ({ ...b }));
      let total = 0;

      (data ?? []).forEach((inv) => {
        if (!inv.due_date) return;
        const due = new Date(inv.due_date);
        const days = Math.floor((today.getTime() - due.getTime()) / 86_400_000);
        const key = bucketFor(days);
        const b = working.find((x) => x.key === key)!;
        b.count += 1;
        b.total += Number(inv.total ?? 0);
        total += Number(inv.total ?? 0);
      });

      if (!cancelled) {
        setBuckets(working);
        setGrandTotal(total);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.company_id, initialBuckets]);

  const max = Math.max(...buckets.map((b) => b.total), 1);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="bg-blue-500 p-2 rounded-lg">
            <Clock className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {t('accounting.arAgeing.title')}
            </p>
            <p className="text-xs text-gray-500">
              {t('accounting.arAgeing.outstanding')}: {formatCurrency(grandTotal)}
            </p>
          </div>
        </div>
        {loading && <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />}
      </div>

      <div className="space-y-2.5">
        {buckets.map((b) => {
          const width = (b.total / max) * 100;
          return (
            <div key={b.key}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-gray-600 font-medium">{b.label}</span>
                <span className="text-gray-900 font-semibold">
                  {formatCurrency(b.total)}
                  <span className="text-gray-400 font-normal ml-2">
                    ({b.count})
                  </span>
                </span>
              </div>
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className={`h-full ${b.color} transition-all duration-500`}
                  style={{ width: `${width}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
