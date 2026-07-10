import { useState } from 'react';
import { Clock, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import AttendancePanel from '../../components/depot/AttendancePanel';
import SortingSessionPanel from '../../components/depot/SortingSessionPanel';
import WorkerTimeReport, { type ReportSubmission } from '../../components/depot/WorkerTimeReport';

export default function DepotTimeTracking() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [refreshKey, setRefreshKey] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const companyId = profile?.company_id ?? null;
  const depotId = profile?.depot_id ?? null;

  async function handleSend(s: ReportSubmission) {
    if (!companyId) return;
    try {
      const { error: insErr } = await supabase.from('depot_time_report_submissions').insert({
        company_id: companyId,
        depot_id: depotId,
        submitted_by: profile!.id,
        period_type: s.period_type,
        from_date: s.from,
        to_date: s.to,
        worker_id: s.worker_id,
        payload: {
          totals: s.totals,
          workers: s.workers.map((w) => ({
            worker_id: w.worker_id,
            full_name: w.full_name,
            repair_min: w.repair_min,
            sorting_min: w.sorting_min,
            repaired_pallets: w.repaired_pallets,
            sorted_pallets: w.sorted_pallets,
            scrapped_pallets: w.scrapped_pallets,
            leave_days: w.leave_days,
            days: w.days,
          })),
        },
      });
      if (insErr) throw insErr;

      // Notify company admins that a new report arrived.
      const { data: admins } = await supabase
        .from('profiles')
        .select('id')
        .eq('company_id', companyId)
        .eq('role', 'company_admin')
        .eq('is_active', true);
      if (admins && admins.length > 0) {
        await supabase.from('notifications').insert(
          admins.map((a) => ({
            user_id: a.id,
            type: 'report',
            title: t('depot.timeTracking.companyReportsTitle'),
            message: `${s.from} → ${s.to}`,
            data: JSON.stringify({ url: '/company/depot-time-reports' }),
            is_read: false,
            push_sent: false,
          })),
        );
      }

      setToast(t('depot.timeTracking.reportSent'));
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Clock className="w-6 h-6 text-teal-600" />
          {t('depot.timeTracking.workHoursTitle')}
        </h1>
        <p className="text-gray-500 text-sm mt-0.5">{t('depot.timeTracking.workHoursSubtitle')}</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-red-700 text-sm flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {toast && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
          <p className="text-green-800 text-sm flex-1">{toast}</p>
        </div>
      )}

      <AttendancePanel onChange={() => setRefreshKey((k) => k + 1)} />

      <SortingSessionPanel />

      <WorkerTimeReport
        key={refreshKey}
        companyId={companyId}
        depotId={depotId}
        variant="company"
        allowCustomRange
        allowWorkerFilter
        onSend={handleSend}
      />
    </div>
  );
}
