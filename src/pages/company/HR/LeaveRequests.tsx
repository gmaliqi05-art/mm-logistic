import { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, Clock, Loader2, Search, Filter, Plus } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { useTranslation } from '../../../i18n';
import LeaveRequestModal from '../../../components/hr/LeaveRequestModal';
import { notifyUsers } from '../../../utils/notifications';

interface LeaveRequest {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  total_days: number;
  status: string;
  reason: string | null;
  rejection_reason: string | null;
  created_at: string;
  user: { full_name: string; email: string } | null;
  leave_type: { code: string; name_en: string; name_sq: string; name_de: string; name_fr: string; color: string } | null;
}

export default function LeaveRequests() {
  const { profile } = useAuth();
  const { t, language } = useTranslation();
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('pending');
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<{ id: string; name: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    if (profile?.company_id) fetchRequests();
  }, [profile?.company_id, filterStatus]);

  async function fetchRequests() {
    setLoading(true);
    let query = supabase
      .from('leave_requests')
      .select('id, user_id, start_date, end_date, total_days, status, reason, rejection_reason, created_at, user:profiles!leave_requests_user_id_fkey(full_name, email), leave_type:leave_types(code, name_en, name_sq, name_de, name_fr, color)')
      .eq('company_id', profile!.company_id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (filterStatus !== 'all') {
      query = query.eq('status', filterStatus);
    }

    const { data } = await query;
    if (data) setRequests(data as unknown as LeaveRequest[]);
    setLoading(false);
  }

  async function handleApprove(id: string) {
    setActionLoading(id);
    const req = requests.find((r) => r.id === id);
    await supabase.from('leave_requests').update({
      status: 'approved',
      approver_id: profile!.id,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', id);
    if (req?.user_id) {
      const dateLabel = `${req.start_date} - ${req.end_date}`;
      await notifyUsers({
        userIds: [req.user_id],
        type: 'system',
        titleKey: 'notifications.templates.leaveApproved.title',
        messageKey: 'notifications.templates.leaveApproved.body',
        params: { dates: dateLabel },
        referenceId: id,
        fallbackTitle: 'Pushimi u aprovua',
        fallbackMessage: `Kerkesa jote per pushim (${dateLabel}) u aprovua.`,
      });
    }
    await fetchRequests();
    setActionLoading(null);
  }

  async function handleReject() {
    if (!rejectModal) return;
    setActionLoading(rejectModal.id);
    const req = requests.find((r) => r.id === rejectModal.id);
    const reason = rejectReason.trim();
    await supabase.from('leave_requests').update({
      status: 'rejected',
      approver_id: profile!.id,
      rejection_reason: reason || null,
      updated_at: new Date().toISOString(),
    }).eq('id', rejectModal.id);
    if (req?.user_id) {
      const dateLabel = `${req.start_date} - ${req.end_date}`;
      await notifyUsers({
        userIds: [req.user_id],
        type: 'system',
        titleKey: 'notifications.templates.leaveRejected.title',
        messageKey: 'notifications.templates.leaveRejected.body',
        params: { dates: dateLabel, reason: reason || '—' },
        referenceId: rejectModal.id,
        fallbackTitle: 'Pushimi u refuzua',
        fallbackMessage: reason
          ? `Kerkesa jote per pushim (${dateLabel}) u refuzua: ${reason}`
          : `Kerkesa jote per pushim (${dateLabel}) u refuzua.`,
      });
    }
    setRejectModal(null);
    setRejectReason('');
    await fetchRequests();
    setActionLoading(null);
  }

  function getTypeName(lt: LeaveRequest['leave_type']) {
    if (!lt) return '';
    const key = `name_${language}` as keyof typeof lt;
    return (lt[key] as string) || lt.name_en;
  }

  const filtered = search
    ? requests.filter(r => r.user?.full_name?.toLowerCase().includes(search.toLowerCase()))
    : requests;

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('nav.hrRequests')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('hr.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white rounded-xl font-medium hover:bg-teal-700 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          {t('hr.leave.requestLeave')}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('common.search') + '...'}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
          />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <Filter className="w-4 h-4 text-gray-400 flex-shrink-0" />
          {['all', 'pending', 'approved', 'rejected', 'cancelled'].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilterStatus(s)}
              className={`px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                filterStatus === s ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {s === 'all' ? t('common.all') : t(`hr.leave.${s}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <Clock className="w-10 h-10 mx-auto mb-2 text-gray-300" />
            <p>{t('hr.leave.noRequests')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Employee</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">{t('hr.leave.leaveType')}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">{t('common.date')}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">{t('hr.leave.totalDays')}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">{t('common.status')}</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((req) => (
                  <tr key={req.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{req.user?.full_name || '-'}</p>
                      <p className="text-xs text-gray-500">{req.user?.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: req.leave_type?.color || '#999' }} />
                        <span className="text-gray-700">{getTypeName(req.leave_type)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {req.start_date} &mdash; {req.end_date}
                    </td>
                    <td className="px-4 py-3 text-gray-700 font-medium">{req.total_days}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        req.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                        req.status === 'approved' ? 'bg-green-100 text-green-700' :
                        req.status === 'rejected' ? 'bg-red-100 text-red-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {t(`hr.leave.${req.status}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {req.status === 'pending' && (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleApprove(req.id)}
                            disabled={actionLoading === req.id}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-xs font-medium hover:bg-green-100 transition-colors disabled:opacity-50"
                          >
                            {actionLoading === req.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                            {t('hr.leave.approve')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setRejectModal({ id: req.id, name: req.user?.full_name || '' })}
                            disabled={actionLoading === req.id}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-700 rounded-lg text-xs font-medium hover:bg-red-100 transition-colors disabled:opacity-50"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            {t('hr.leave.reject')}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reject Modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">{t('hr.leave.reject')} - {rejectModal.name}</h3>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder={t('hr.leave.rejectionReason') + '...'}
              rows={3}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 text-sm resize-none mb-4"
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setRejectModal(null); setRejectReason(''); }}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-gray-700 font-medium hover:bg-gray-50"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleReject}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700"
              >
                {t('hr.leave.reject')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreateModal && (
        <LeaveRequestModal
          adminMode
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => { setShowCreateModal(false); fetchRequests(); }}
        />
      )}
    </div>
  );
}
