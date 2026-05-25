import { useState, useEffect } from 'react';
import { X, Calendar, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import { notifyRole } from '../../utils/notifications';

interface LeaveType {
  id: string;
  code: string;
  name_sq: string;
  name_en: string;
  name_de: string;
  name_fr: string;
  color: string;
  requires_medical_certificate: boolean;
  max_days_per_year: number | null;
}

interface Props {
  onClose: () => void;
  onSuccess: () => void;
  adminMode?: boolean;
}

export default function LeaveRequestModal({ onClose, onSuccess, adminMode = false }: Props) {
  const { profile } = useAuth();
  const { t, language } = useTranslation();
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [employees, setEmployees] = useState<{ id: string; full_name: string }[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [halfDayStart, setHalfDayStart] = useState(false);
  const [halfDayEnd, setHalfDayEnd] = useState(false);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [autoApprove, setAutoApprove] = useState(true);

  useEffect(() => {
    fetchLeaveTypes();
    if (adminMode) fetchEmployees();
  }, []);

  async function fetchEmployees() {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('company_id', profile!.company_id)
      .eq('is_active', true)
      .order('full_name');
    if (data) setEmployees(data);
  }

  async function fetchLeaveTypes() {
    const { data } = await supabase
      .from('leave_types')
      .select('id, code, name_sq, name_en, name_de, name_fr, color, requires_medical_certificate, max_days_per_year')
      .eq('company_id', profile!.company_id)
      .eq('is_active', true)
      .order('code');
    if (data) {
      setLeaveTypes(data);
      if (data.length > 0) setSelectedType(data[0].id);
    }
  }

  function calculateWorkdays(start: string, end: string): number {
    const s = new Date(start);
    const e = new Date(end);
    let days = 0;
    const cur = new Date(s);
    while (cur <= e) {
      const dow = cur.getDay();
      if (dow === 0) {
        // Sunday = rest day, not counted
      } else if (dow === 6) {
        days += 0.5; // Saturday = half work day
      } else {
        days += 1; // Mon-Fri = full work day
      }
      cur.setDate(cur.getDate() + 1);
    }
    if (halfDayStart && days > 0) days -= 0.5;
    if (halfDayEnd && days > 0) days -= 0.5;
    return Math.max(0, days);
  }

  const totalDays = startDate && endDate ? calculateWorkdays(startDate, endDate) : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedType || !startDate || !endDate) {
      setError(t('common.requiredFields') || 'Please fill all required fields');
      return;
    }
    if (adminMode && !selectedEmployee) {
      setError(t('hr.leaveRequest.pickEmployee') || 'Please select an employee');
      return;
    }
    if (totalDays <= 0) {
      setError(t('hr.leaveRequest.invalidDateRange') || 'Invalid date range');
      return;
    }

    setSaving(true);
    setError('');

    const targetUserId = adminMode ? selectedEmployee : profile!.id;
    const status = adminMode && autoApprove ? 'approved' : 'pending';

    const { error: err } = await supabase.from('leave_requests').insert({
      company_id: profile!.company_id,
      user_id: targetUserId,
      leave_type_id: selectedType,
      start_date: startDate,
      end_date: endDate,
      total_days: totalDays,
      half_day_start: halfDayStart,
      half_day_end: halfDayEnd,
      reason: reason.trim() || null,
      status,
      ...(status === 'approved' ? { approver_id: profile!.id, approved_at: new Date().toISOString() } : {}),
    });

    if (err) {
      setError(err.message);
      setSaving(false);
    } else {
      // Notify company admins if the request was filed by an employee and is
      // still pending review (admin-filed auto-approved entries don't need a
      // notification — the admin is the one who created them).
      if (status === 'pending' && profile?.company_id) {
        const dateLabel = `${startDate} - ${endDate}`;
        await notifyRole({
          companyId: profile.company_id,
          role: 'company_admin',
          type: 'system',
          titleKey: 'notifications.templates.leaveRequested.title',
          messageKey: 'notifications.templates.leaveRequested.body',
          params: { name: profile.full_name || profile.email || '', dates: dateLabel },
          fallbackTitle: 'Kerkese e re per pushim',
          fallbackMessage: `${profile.full_name || profile.email || ''} ka kerkuar pushim ${dateLabel}.`,
        });
      }
      onSuccess();
    }
  }

  function getTypeName(lt: LeaveType) {
    const key = `name_${language}` as keyof LeaveType;
    return (lt[key] as string) || lt.name_en;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-100 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-teal-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">{t('hr.leave.requestLeave')}</h2>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
          )}

          {adminMode && (
            <div>
              <label htmlFor="leave-employee" className="block text-sm font-medium text-gray-700 mb-1.5">{t('hr.leave.employee')}</label>
              <select
                id="leave-employee"
                value={selectedEmployee}
                onChange={(e) => setSelectedEmployee(e.target.value)}
                required
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
              >
                <option value="">{t('hr.leave.selectEmployee')}</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.full_name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('hr.leave.leaveType')}</label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
            >
              {leaveTypes.map((lt) => (
                <option key={lt.id} value={lt.id}>{getTypeName(lt)}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('hr.leave.startDate')}</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('hr.leave.endDate')}</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                required
              />
            </div>
          </div>

          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={halfDayStart}
                onChange={(e) => setHalfDayStart(e.target.checked)}
                className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
              />
              {t('hr.leave.halfDayStart')}
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={halfDayEnd}
                onChange={(e) => setHalfDayEnd(e.target.checked)}
                className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
              />
              {t('hr.leave.halfDayEnd')}
            </label>
          </div>

          {totalDays > 0 && (
            <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl">
              <span className="text-sm font-medium text-teal-800">
                {t('hr.leave.totalDays')}: <strong>{totalDays}</strong> {totalDays === 1 ? t('common.day') : t('common.days')}
              </span>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('hr.leave.reason')}</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder={t('hr.leave.reasonPlaceholder')}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm resize-none"
            />
          </div>

          {adminMode && (
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={autoApprove}
                onChange={(e) => setAutoApprove(e.target.checked)}
                className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
              />
              {t('hr.leave.approve')} ({t('hr.leave.approved').toLowerCase()})
            </label>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-gray-700 font-medium hover:bg-gray-50 transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={saving || totalDays <= 0}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-xl font-medium hover:bg-teal-700 transition-colors disabled:opacity-50"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? t('common.processing') : t('common.send')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
