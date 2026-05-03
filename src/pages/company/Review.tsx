import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Loader2,
  Package,
  Truck,
  Undo2,
  User,
  Wrench,
  X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import { usePendingReviewCounts } from '../../hooks/usePendingReviewCounts';
import DeliveryReviewPanel from '../../components/delivery/DeliveryReviewPanel';

type TabKey = 'deliveries' | 'pickups' | 'repairs';

interface RepairReport {
  id: string;
  company_id: string;
  depot_id: string | null;
  worker_id: string | null;
  scope: string;
  report_date: string;
  total_quantity: number;
  entry_count: number;
  details: any;
  created_by: string | null;
  created_at: string;
  review_status: string;
  worker?: { full_name: string } | null;
  depot?: { name: string } | null;
}

export default function CompanyReview() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const counts = usePendingReviewCounts(profile?.company_id);
  const [searchParams, setSearchParams] = useSearchParams();

  const initialTab = (searchParams.get('tab') as TabKey) || 'deliveries';
  const [tab, setTab] = useState<TabKey>(
    ['deliveries', 'pickups', 'repairs'].includes(initialTab) ? initialTab : 'deliveries',
  );

  useEffect(() => {
    const current = searchParams.get('tab');
    if (current !== tab) {
      const next = new URLSearchParams(searchParams);
      next.set('tab', tab);
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const tabs: { key: TabKey; labelKey: string; icon: typeof ClipboardList; count: number; tone: string }[] = [
    { key: 'deliveries', labelKey: 'review.tabs.deliveries', icon: Truck, count: counts.deliveries, tone: 'sky' },
    { key: 'pickups', labelKey: 'review.tabs.pickups', icon: Package, count: counts.pickups, tone: 'orange' },
    { key: 'repairs', labelKey: 'review.tabs.repairs', icon: Wrench, count: counts.repairs, tone: 'amber' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-sky-600" />
            {t('review.title')}
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">{t('review.subtitle')}</p>
        </div>
        <div className="hidden sm:flex items-center gap-2 bg-white border border-gray-100 rounded-xl px-3 py-2 shadow-sm">
          <span className="text-xs text-gray-500">{t('review.totalPending')}</span>
          <span className="text-lg font-bold text-sky-700">{counts.total}</span>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="grid grid-cols-3 border-b border-gray-100">
          {tabs.map((tb) => {
            const Icon = tb.icon;
            const active = tab === tb.key;
            return (
              <button
                key={tb.key}
                onClick={() => setTab(tb.key)}
                className={`flex items-center justify-center gap-2 px-3 py-3 text-sm font-semibold transition-colors relative ${
                  active
                    ? 'text-sky-700 bg-sky-50'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{t(tb.labelKey)}</span>
                {tb.count > 0 && (
                  <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[11px] font-bold rounded-full ${
                    active ? 'bg-sky-600 text-white' : 'bg-red-500 text-white'
                  }`}>
                    {tb.count}
                  </span>
                )}
                {active && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-sky-600" />}
              </button>
            );
          })}
        </div>

        <div className="p-4">
          {tab === 'deliveries' && (
            <DeliveryReviewPanel
              role="company_admin"
              typeFilter="delivery"
              hideChrome
              emptyMessage={t('review.empty.deliveries')}
            />
          )}
          {tab === 'pickups' && (
            <DeliveryReviewPanel
              role="company_admin"
              typeFilter="pickup"
              hideChrome
              emptyMessage={t('review.empty.pickups')}
            />
          )}
          {tab === 'repairs' && <RepairReviewList companyId={profile?.company_id} />}
        </div>
      </div>
    </div>
  );
}

function RepairReviewList({ companyId }: { companyId?: string | null }) {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [reports, setReports] = useState<RepairReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<RepairReport | null>(null);

  useEffect(() => {
    if (!companyId) return;
    fetchReports();
    const ch = supabase
      .channel(`repair-review-${companyId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'depot_repair_reports', filter: `company_id=eq.${companyId}` },
        () => fetchReports(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  async function fetchReports() {
    if (!companyId) return;
    setLoading(true);
    const { data } = await supabase
      .from('depot_repair_reports')
      .select('*, worker:profiles!depot_repair_reports_worker_id_fkey(full_name), depot:depots!depot_repair_reports_depot_id_fkey(name)')
      .eq('company_id', companyId)
      .eq('review_status', 'pending_company_review')
      .order('created_at', { ascending: false })
      .limit(100);
    setReports((data as RepairReport[]) ?? []);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-white py-10 text-center">
        <CheckCircle2 className="w-9 h-9 text-emerald-300 mx-auto mb-2" />
        <p className="text-sm font-medium text-gray-700">{t('review.empty.repairs')}</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {reports.map((r) => (
          <button
            key={r.id}
            onClick={() => setSelected(r)}
            className="w-full text-left bg-white rounded-xl shadow-sm border border-gray-100 border-l-4 border-l-amber-400 p-3.5 active:scale-[0.99] hover:shadow-md transition-all"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-amber-50 flex-shrink-0">
                <Wrench className="w-4 h-4 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-gray-900">
                    {t('review.repair.titlePrefix')} {new Date(r.report_date).toLocaleDateString()}
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800">
                    {r.scope === 'worker' ? t('review.repair.scopeWorker') : t('review.repair.scopeCompany')}
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-700">
                    {r.total_quantity} {t('common.pieces')}
                  </span>
                </div>
                {r.worker?.full_name && (
                  <p className="text-sm font-medium text-gray-800 mt-1 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-gray-400" /> {r.worker.full_name}
                  </p>
                )}
                {r.depot?.name && (
                  <p className="text-xs text-gray-500 mt-0.5">{r.depot.name}</p>
                )}
              </div>
              <ArrowRight className="w-4 h-4 text-gray-300 flex-shrink-0 mt-1" />
            </div>
          </button>
        ))}
      </div>

      {selected && (
        <RepairReviewModal
          report={selected}
          reviewerId={profile!.id}
          onClose={() => setSelected(null)}
          onDone={async () => { setSelected(null); await fetchReports(); }}
        />
      )}
    </>
  );
}

function RepairReviewModal({
  report, reviewerId, onClose, onDone,
}: {
  report: RepairReport;
  reviewerId: string;
  onClose: () => void;
  onDone: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState<'approve' | 'reject' | null>(null);
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const details = report.details || {};
  const byCategory: { name: string; quantity: number }[] = useMemo(() => {
    if (Array.isArray(details.by_category)) return details.by_category;
    if (Array.isArray(details.workers)) {
      const map = new Map<string, number>();
      for (const w of details.workers) {
        for (const c of w.by_category || []) {
          map.set(c.name, (map.get(c.name) ?? 0) + (c.quantity || 0));
        }
      }
      return Array.from(map.entries()).map(([name, quantity]) => ({ name, quantity }));
    }
    return [];
  }, [details]);

  async function handleApprove() {
    setSaving('approve');
    setError(null);
    try {
      const { error: upErr } = await supabase
        .from('depot_repair_reports')
        .update({
          review_status: 'approved',
          company_reviewed_at: new Date().toISOString(),
          company_reviewed_by: reviewerId,
        })
        .eq('id', report.id);
      if (upErr) throw upErr;
      if (report.created_by) {
        await supabase.from('notifications').insert({
          user_id: report.created_by,
          title: t('review.repair.notifyApprovedTitle'),
          message: `${new Date(report.report_date).toLocaleDateString()} - ${report.total_quantity} ${t('common.pieces')}`,
          type: 'document',
          reference_id: report.id,
        });
      }
      await onDone();
    } catch (err: any) {
      setError(err.message || 'Error');
    } finally {
      setSaving(null);
    }
  }

  async function handleReject() {
    if (!reason.trim()) {
      setShowReject(true);
      return;
    }
    setSaving('reject');
    setError(null);
    try {
      const { error: upErr } = await supabase
        .from('depot_repair_reports')
        .update({
          review_status: 'rejected',
          company_reviewed_at: new Date().toISOString(),
          company_reviewed_by: reviewerId,
          rejection_reason: reason.trim(),
        })
        .eq('id', report.id);
      if (upErr) throw upErr;
      if (report.created_by) {
        await supabase.from('notifications').insert({
          user_id: report.created_by,
          title: t('review.repair.notifyRejectedTitle'),
          message: reason.trim(),
          type: 'document',
          reference_id: report.id,
        });
      }
      await onDone();
    } catch (err: any) {
      setError(err.message || 'Error');
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl lg:rounded-2xl w-full lg:max-w-2xl max-h-[94vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between z-10">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-gray-900">
              {t('review.repair.titlePrefix')} {new Date(report.report_date).toLocaleDateString()}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {report.scope === 'worker' ? t('review.repair.scopeWorker') : t('review.repair.scopeCompany')}
              {report.worker?.full_name ? ` - ${report.worker.full_name}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="p-2 -mr-2 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <StatBox label={t('review.repair.totalQty')} value={report.total_quantity} />
            <StatBox label={t('review.repair.entryCount')} value={report.entry_count} />
          </div>

          {byCategory.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
                {t('review.repair.byCategory')}
              </p>
              <div className="space-y-1.5">
                {byCategory.map((c, i) => (
                  <div key={i} className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                    <span className="text-sm text-gray-800">{c.name}</span>
                    <span className="text-sm font-bold text-gray-900">{c.quantity}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {showReject && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <p className="text-xs font-semibold text-amber-900 mb-2">{t('review.repair.rejectionReason')}</p>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                className="w-full bg-white border border-amber-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                placeholder={t('review.repair.rejectionPlaceholder')}
              />
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-5 py-3 flex items-center justify-end gap-2">
          <button
            onClick={() => setShowReject(true)}
            disabled={!!saving}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 disabled:opacity-50"
          >
            <Undo2 className="w-4 h-4" /> {t('review.repair.reject')}
          </button>
          {showReject && (
            <button
              onClick={handleReject}
              disabled={saving === 'reject' || !reason.trim()}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50"
            >
              {saving === 'reject' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Undo2 className="w-4 h-4" />}
              {t('review.repair.confirmReject')}
            </button>
          )}
          {!showReject && (
            <button
              onClick={handleApprove}
              disabled={!!saving}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving === 'approve' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {t('review.repair.approve')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-xl font-bold text-gray-900 mt-1">{value}</p>
    </div>
  );
}
