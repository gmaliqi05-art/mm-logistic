import { useState, useEffect } from 'react';
import { BarChart3, Download, Loader2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { useTranslation } from '../../../i18n';

interface EmployeeLeaveRow {
  user_name: string;
  allocated: number;
  used: number;
  pending: number;
  remaining: number;
  leave_type_name: string;
  color: string;
}

interface WorkHoursSummary {
  user_name: string;
  total_hours: number;
  overtime_hours: number;
  days_worked: number;
}

export default function HRReports() {
  const { profile } = useAuth();
  const { t, language } = useTranslation();
  const [rows, setRows] = useState<EmployeeLeaveRow[]>([]);
  const [workRows, setWorkRows] = useState<WorkHoursSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [reportType, setReportType] = useState<'leave' | 'hours'>('leave');

  useEffect(() => {
    if (profile?.company_id) fetchReport();
  }, [profile?.company_id, year, month, reportType]);

  async function fetchReport() {
    setLoading(true);
    if (reportType === 'leave') {
      const { data } = await supabase
        .from('employee_leave_balances')
        .select(`
          allocated_days, used_days, pending_days, carried_over_days,
          user:profiles!employee_leave_balances_user_id_fkey(full_name),
          leave_type:leave_types(name_en, name_sq, name_de, name_fr, color, code)
        `)
        .eq('company_id', profile!.company_id)
        .eq('year', year);

      if (data) {
        const mapped: EmployeeLeaveRow[] = (data as any[]).map((d) => {
          const nameKey = `name_${language}`;
          return {
            user_name: d.user?.full_name || '-',
            allocated: d.allocated_days + d.carried_over_days,
            used: d.used_days,
            pending: d.pending_days,
            remaining: d.allocated_days + d.carried_over_days - d.used_days - d.pending_days,
            leave_type_name: d.leave_type?.[nameKey] || d.leave_type?.name_en || '',
            color: d.leave_type?.color || '#999',
          };
        });
        setRows(mapped.sort((a, b) => a.user_name.localeCompare(b.user_name)));
      }
    } else {
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const endDate = new Date(year, month, 0).toISOString().split('T')[0];
      const { data } = await supabase
        .from('work_hours_log')
        .select('total_hours, overtime_hours, user:profiles!work_hours_log_user_id_fkey(full_name)')
        .eq('company_id', profile!.company_id)
        .gte('date', startDate)
        .lte('date', endDate);

      if (data) {
        const grouped: Record<string, WorkHoursSummary> = {};
        (data as any[]).forEach(d => {
          const name = d.user?.full_name || '-';
          if (!grouped[name]) grouped[name] = { user_name: name, total_hours: 0, overtime_hours: 0, days_worked: 0 };
          grouped[name].total_hours += d.total_hours || 0;
          grouped[name].overtime_hours += d.overtime_hours || 0;
          grouped[name].days_worked += 1;
        });
        setWorkRows(Object.values(grouped).sort((a, b) => a.user_name.localeCompare(b.user_name)));
      }
    }
    setLoading(false);
  }

  function exportCSV() {
    let csvContent = '';
    if (reportType === 'leave') {
      const headers = ['Employee', 'Leave Type', 'Allocated', 'Used', 'Pending', 'Remaining'];
      csvContent = [headers.join(','), ...rows.map(r => [r.user_name, r.leave_type_name, r.allocated, r.used, r.pending, r.remaining].join(','))].join('\n');
    } else {
      const headers = ['Employee', 'Days Worked', 'Total Hours', 'Overtime Hours'];
      csvContent = [headers.join(','), ...workRows.map(r => [r.user_name, r.days_worked, r.total_hours.toFixed(1), r.overtime_hours.toFixed(1)].join(','))].join('\n');
    }
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hr-report-${reportType}-${year}-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('hr.reports.title')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('hr.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={exportCSV}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-xl font-medium hover:bg-teal-700 transition-colors text-sm"
        >
          <Download className="w-4 h-4" />
          {t('hr.reports.exportExcel')}
        </button>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
        >
          {[2024, 2025, 2026, 2027].map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        {reportType === 'hours' && (
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {new Date(2026, i).toLocaleDateString(undefined, { month: 'long' })}
              </option>
            ))}
          </select>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setReportType('leave')}
            className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
              reportType === 'leave' ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {t('hr.reports.annualLeave')}
          </button>
          <button
            type="button"
            onClick={() => setReportType('hours')}
            className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
              reportType === 'hours' ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {t('hr.reports.overtimeReport')}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
          </div>
        ) : reportType === 'leave' ? (
          rows.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <BarChart3 className="w-10 h-10 mx-auto mb-2 text-gray-300" />
              <p>{t('common.noData')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Employee</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">{t('hr.leave.leaveType')}</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">{t('hr.leave.allocated')}</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">{t('hr.leave.used')}</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">{t('hr.leave.pending')}</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">{t('hr.leave.remaining')}</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-medium text-gray-900">{r.user_name}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: r.color }} />
                          <span className="text-gray-700">{r.leave_type_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">{r.allocated}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{r.used}</td>
                      <td className="px-4 py-3 text-right text-amber-600 font-medium">{r.pending}</td>
                      <td className="px-4 py-3 text-right font-bold text-gray-900">{r.remaining}</td>
                      <td className="px-4 py-3">
                        <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${Math.min(((r.used + r.pending) / Math.max(r.allocated, 1)) * 100, 100)}%`, backgroundColor: r.color }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          workRows.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <BarChart3 className="w-10 h-10 mx-auto mb-2 text-gray-300" />
              <p>{t('common.noData')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Employee</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">{t('hr.attendance.present')}</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">{t('hr.attendance.totalHours')}</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">{t('hr.attendance.overtime')}</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {workRows.map((r, i) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-medium text-gray-900">{r.user_name}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{r.days_worked} days</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">{r.total_hours.toFixed(1)}h</td>
                      <td className="px-4 py-3 text-right">
                        {r.overtime_hours > 0 ? (
                          <span className="text-teal-700 font-bold">+{r.overtime_hours.toFixed(1)}h</span>
                        ) : (
                          <span className="text-gray-400">0h</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-teal-500"
                            style={{ width: `${Math.min((r.overtime_hours / Math.max(r.total_hours, 1)) * 100, 100)}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  );
}
