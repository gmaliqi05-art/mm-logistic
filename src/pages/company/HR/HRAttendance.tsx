import { useState, useEffect } from 'react';
import { Clock, Search, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { useTranslation } from '../../../i18n';

interface AttendanceRow {
  id: string;
  date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  total_hours: number | null;
  overtime_hours: number | null;
  status: string;
  user: { full_name: string } | null;
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

export default function HRAttendance() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [records, setRecords] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [currentDate, setCurrentDate] = useState(new Date());

  useEffect(() => {
    if (profile?.company_id) fetchRecords();
  }, [profile?.company_id, currentDate]);

  async function fetchRecords() {
    setLoading(true);
    const dateStr = currentDate.toISOString().split('T')[0];

    const { data } = await supabase
      .from('attendance_records')
      .select('id, date, check_in_time, check_out_time, total_hours, overtime_hours, status, user:profiles!attendance_records_user_id_fkey(full_name)')
      .eq('company_id', profile!.company_id)
      .eq('date', dateStr)
      .order('check_in_time', { ascending: true });

    if (data) setRecords(data as unknown as AttendanceRow[]);
    setLoading(false);
  }

  function formatTime(ts: string | null) {
    if (!ts) return '--:--';
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  const filtered = search
    ? records.filter(r => r.user?.full_name?.toLowerCase().includes(search.toLowerCase()))
    : records;

  const dateLabel = currentDate.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('hr.attendance.title')}</h1>
        <p className="text-sm text-gray-500 mt-1">{t('hr.subtitle')}</p>
      </div>

      {/* Date Navigation + Search */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCurrentDate(new Date(currentDate.getTime() - 86400000))}
            className="p-2 rounded-lg hover:bg-gray-100 border border-gray-200"
          >
            <ChevronLeft className="w-4 h-4 text-gray-600" />
          </button>
          <input
            type="date"
            value={currentDate.toISOString().split('T')[0]}
            onChange={(e) => setCurrentDate(new Date(e.target.value))}
            className="px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
          />
          <button
            type="button"
            onClick={() => setCurrentDate(new Date(currentDate.getTime() + 86400000))}
            className="p-2 rounded-lg hover:bg-gray-100 border border-gray-200"
          >
            <ChevronRight className="w-4 h-4 text-gray-600" />
          </button>
        </div>
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
      </div>

      <p className="text-sm text-gray-500 mb-4">{dateLabel}</p>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <Clock className="w-10 h-10 mx-auto mb-2 text-gray-300" />
            <p>{t('hr.attendance.noRecords')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Employee</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">{t('hr.attendance.checkIn')}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">{t('hr.attendance.checkOut')}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">{t('hr.attendance.totalHours')}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">{t('hr.attendance.overtime')}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">{t('common.status')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-medium text-gray-900">{r.user?.full_name || '-'}</td>
                    <td className="px-4 py-3 text-gray-600">{formatTime(r.check_in_time)}</td>
                    <td className="px-4 py-3 text-gray-600">{formatTime(r.check_out_time)}</td>
                    <td className="px-4 py-3 text-gray-700">{r.total_hours ? `${r.total_hours}h` : '-'}</td>
                    <td className="px-4 py-3 text-gray-700">{r.overtime_hours ? `${r.overtime_hours}h` : '-'}</td>
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
