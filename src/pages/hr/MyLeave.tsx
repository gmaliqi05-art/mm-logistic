import { useState, useEffect } from 'react';
import { Calendar, Plus, Clock, CheckCircle2, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import LeaveRequestModal from '../../components/hr/LeaveRequestModal';
import BackButton from '../../components/BackButton';

interface LeaveBalance {
  id: string;
  leave_type_id: string;
  year: number;
  allocated_days: number;
  used_days: number;
  pending_days: number;
  carried_over_days: number;
  leave_type: { code: string; name_sq: string; name_en: string; name_de: string; name_fr: string; color: string };
}

interface LeaveRequest {
  id: string;
  start_date: string;
  end_date: string;
  total_days: number;
  status: string;
  reason: string | null;
  rejection_reason: string | null;
  created_at: string;
  leave_type: { code: string; name_sq: string; name_en: string; name_de: string; name_fr: string; color: string };
}

export default function MyLeave() {
  const { profile } = useAuth();
  const { t, language } = useTranslation();
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    if (profile?.id) fetchData();
  }, [profile?.id]);

  async function fetchData() {
    setLoading(true);
    const [balRes, reqRes] = await Promise.all([
      supabase
        .from('employee_leave_balances')
        .select('*, leave_type:leave_types(code, name_sq, name_en, name_de, name_fr, color)')
        .eq('user_id', profile!.id)
        .eq('year', currentYear),
      supabase
        .from('leave_requests')
        .select('*, leave_type:leave_types(code, name_sq, name_en, name_de, name_fr, color)')
        .eq('user_id', profile!.id)
        .order('created_at', { ascending: false })
        .limit(50),
    ]);
    if (balRes.data) setBalances(balRes.data as LeaveBalance[]);
    if (reqRes.data) setRequests(reqRes.data as LeaveRequest[]);
    setLoading(false);
  }

  function getLeaveTypeName(lt: LeaveBalance['leave_type'] | LeaveRequest['leave_type']) {
    const key = `name_${language}` as keyof typeof lt;
    return (lt[key] as string) || lt.name_en;
  }

  const filteredRequests = filterStatus === 'all'
    ? requests
    : requests.filter(r => r.status === filterStatus);

  const statusConfig: Record<string, { icon: typeof CheckCircle2; color: string; bg: string }> = {
    pending: { icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
    approved: { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50 border-green-200' },
    rejected: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50 border-red-200' },
    cancelled: { icon: AlertCircle, color: 'text-gray-500', bg: 'bg-gray-50 border-gray-200' },
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto">
      <BackButton />
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('hr.leave.myLeave')}</h1>
          <p className="text-sm text-gray-500 mt-1">{currentYear}</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white rounded-xl font-medium hover:bg-teal-700 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          {t('hr.leave.requestLeave')}
        </button>
      </div>

      {/* Balances */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {balances.map((b) => {
          const remaining = b.allocated_days + b.carried_over_days - b.used_days - b.pending_days;
          const usedPct = b.allocated_days > 0 ? ((b.used_days + b.pending_days) / (b.allocated_days + b.carried_over_days)) * 100 : 0;
          return (
            <div key={b.id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: b.leave_type.color }} />
                <h3 className="font-semibold text-gray-900 text-sm">{getLeaveTypeName(b.leave_type)}</h3>
              </div>
              <div className="flex items-baseline gap-1 mb-3">
                <span className="text-3xl font-bold text-gray-900">{remaining}</span>
                <span className="text-sm text-gray-500">/ {b.allocated_days + b.carried_over_days} {t('hr.leave.daysRemaining')}</span>
              </div>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${Math.min(usedPct, 100)}%`, backgroundColor: b.leave_type.color }}
                />
              </div>
              <div className="flex justify-between mt-2 text-xs text-gray-500">
                <span>{t('hr.leave.used')}: {b.used_days}</span>
                {b.pending_days > 0 && <span>{t('hr.leave.pending')}: {b.pending_days}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2">
        {['all', 'pending', 'approved', 'rejected', 'cancelled'].map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              filterStatus === s
                ? 'bg-teal-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {s === 'all' ? t('common.all') : t(`hr.leave.${s}`)}
          </button>
        ))}
      </div>

      {/* Requests List */}
      <div className="space-y-3">
        {filteredRequests.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Calendar className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>{t('hr.leave.noRequests')}</p>
          </div>
        ) : (
          filteredRequests.map((req) => {
            const cfg = statusConfig[req.status] || statusConfig.pending;
            const Icon = cfg.icon;
            return (
              <div key={req.id} className={`border rounded-xl p-4 ${cfg.bg} transition-all`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: req.leave_type.color }} />
                      <span className="font-medium text-gray-900 text-sm">{getLeaveTypeName(req.leave_type)}</span>
                    </div>
                    <p className="text-sm text-gray-600">
                      {req.start_date} &mdash; {req.end_date} ({req.total_days} {t('hr.leave.totalDays').toLowerCase()})
                    </p>
                    {req.reason && <p className="text-xs text-gray-500 mt-1 truncate">{req.reason}</p>}
                    {req.rejection_reason && (
                      <p className="text-xs text-red-600 mt-1">{t('hr.leave.rejectionReason')}: {req.rejection_reason}</p>
                    )}
                  </div>
                  <div className={`flex items-center gap-1.5 ${cfg.color}`}>
                    <Icon className="w-4 h-4" />
                    <span className="text-xs font-medium">{t(`hr.leave.${req.status}`)}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {showModal && (
        <LeaveRequestModal
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); fetchData(); }}
        />
      )}
    </div>
  );
}
