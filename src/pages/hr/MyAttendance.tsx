import { useState, useEffect } from 'react';
import { Clock, MapPin, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import BackButton from '../../components/BackButton';

interface AttendanceRecord {
  id: string;
  date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  break_minutes: number;
  total_hours: number | null;
  overtime_hours: number | null;
  status: string;
  notes: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  present: 'bg-green-100 text-green-800',
  absent: 'bg-red-100 text-red-800',
  late: 'bg-amber-100 text-amber-800',
  leave: 'bg-blue-100 text-blue-800',
  holiday: 'bg-teal-100 text-teal-800',
  weekend: 'bg-gray-100 text-gray-600',
  sick: 'bg-red-100 text-red-800',
};

export default function MyAttendance() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);

  useEffect(() => {
    if (profile?.id) fetchRecords();
  }, [profile?.id, currentMonth]);

  async function fetchRecords() {
    setLoading(true);
    const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).toISOString().split('T')[0];
    const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).toISOString().split('T')[0];

    const { data } = await supabase
      .from('attendance_records')
      .select('*')
      .eq('user_id', profile!.id)
      .gte('date', startOfMonth)
      .lte('date', endOfMonth)
      .order('date', { ascending: false });

    if (data) {
      setRecords(data);
      const today = new Date().toISOString().split('T')[0];
      setTodayRecord(data.find(r => r.date === today) || null);
    }
    setLoading(false);
  }

  async function handleCheckIn() {
    setCheckingIn(true);
    let location: { lat: number; lng: number } | null = null;

    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 })
      );
      location = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch { /* geolocation unavailable */ }

    const today = new Date().toISOString().split('T')[0];
    const now = new Date().toISOString();

    if (!todayRecord) {
      await supabase.from('attendance_records').insert({
        user_id: profile!.id,
        company_id: profile!.company_id,
        date: today,
        check_in_time: now,
        status: 'present',
        location_check_in: location,
      });
    } else if (!todayRecord.check_out_time) {
      const checkIn = new Date(todayRecord.check_in_time!);
      const checkOut = new Date(now);
      const totalHours = Math.round(((checkOut.getTime() - checkIn.getTime()) / 3600000 - (todayRecord.break_minutes / 60)) * 100) / 100;

      await supabase.from('attendance_records').update({
        check_out_time: now,
        total_hours: Math.max(0, totalHours),
        location_check_out: location,
        updated_at: now,
      }).eq('id', todayRecord.id);
    }

    await fetchRecords();
    setCheckingIn(false);
  }

  function formatTime(ts: string | null) {
    if (!ts) return '--:--';
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  const monthLabel = currentMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const totalWorkedHours = records.reduce((sum, r) => sum + (r.total_hours || 0), 0);
  const totalOvertimeHours = records.reduce((sum, r) => sum + (r.overtime_hours || 0), 0);
  const presentDays = records.filter(r => r.status === 'present' || r.status === 'late').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto">
      <BackButton />
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <h1 className="text-2xl font-bold text-gray-900">{t('hr.attendance.title')}</h1>

        {/* Check In/Out Button */}
        <button
          onClick={handleCheckIn}
          disabled={checkingIn || (todayRecord?.check_out_time != null)}
          className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium shadow-sm transition-all disabled:opacity-50 ${
            !todayRecord
              ? 'bg-green-600 text-white hover:bg-green-700'
              : !todayRecord.check_out_time
              ? 'bg-red-600 text-white hover:bg-red-700'
              : 'bg-gray-200 text-gray-500'
          }`}
        >
          {checkingIn ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <MapPin className="w-4 h-4" />
          )}
          {!todayRecord ? t('hr.attendance.checkIn') : !todayRecord.check_out_time ? t('hr.attendance.checkOut') : t('hr.attendance.checkedOut')}
        </button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{presentDays}</p>
          <p className="text-xs text-gray-500">{t('hr.attendance.present')}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{totalWorkedHours.toFixed(1)}h</p>
          <p className="text-xs text-gray-500">{t('hr.attendance.totalHours')}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{totalOvertimeHours.toFixed(1)}h</p>
          <p className="text-xs text-gray-500">{t('hr.attendance.overtime')}</p>
        </div>
      </div>

      {/* Month Navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
          className="p-2 rounded-lg hover:bg-gray-100"
        >
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h2 className="font-semibold text-gray-900">{monthLabel}</h2>
        <button
          type="button"
          onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
          className="p-2 rounded-lg hover:bg-gray-100"
        >
          <ChevronRight className="w-5 h-5 text-gray-600" />
        </button>
      </div>

      {/* Records Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {records.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Clock className="w-10 h-10 mx-auto mb-2 text-gray-300" />
            <p>{t('hr.attendance.noRecords')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">{t('common.date')}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">{t('hr.attendance.checkIn')}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">{t('hr.attendance.checkOut')}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">{t('hr.attendance.totalHours')}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">{t('common.status')}</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-medium text-gray-900">{r.date}</td>
                    <td className="px-4 py-3 text-gray-600">{formatTime(r.check_in_time)}</td>
                    <td className="px-4 py-3 text-gray-600">{formatTime(r.check_out_time)}</td>
                    <td className="px-4 py-3 text-gray-600">{r.total_hours ? `${r.total_hours}h` : '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[r.status] || STATUS_COLORS.present}`}>
                        {t(`hr.attendance.${r.status}`)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
