import { useState, useEffect } from 'react';
import { Clock, Search, Loader2, ChevronLeft, ChevronRight, Download, Plus, Save } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { useTranslation } from '../../../i18n';

interface WorkHourRow {
  id: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  break_minutes: number;
  total_hours: number | null;
  overtime_hours: number | null;
  notes: string | null;
  user: { full_name: string } | null;
}

interface Employee {
  id: string;
  full_name: string;
}

const STANDARD_HOURS = 8;

export default function HRWorkHours() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [records, setRecords] = useState<WorkHourRow[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newEntry, setNewEntry] = useState({ user_id: '', date: '', start_time: '', end_time: '', break_minutes: 30, notes: '' });

  useEffect(() => {
    if (profile?.company_id) {
      fetchRecords();
      fetchEmployees();
    }
  }, [profile?.company_id, currentMonth]);

  async function fetchEmployees() {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('company_id', profile!.company_id)
      .eq('is_active', true)
      .order('full_name');
    if (data) setEmployees(data);
  }

  async function fetchRecords() {
    setLoading(true);
    const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).toISOString().split('T')[0];
    const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).toISOString().split('T')[0];

    const { data } = await supabase
      .from('work_hours_log')
      .select('id, date, start_time, end_time, break_minutes, total_hours, overtime_hours, notes, user:profiles!work_hours_log_user_id_fkey(full_name)')
      .eq('company_id', profile!.company_id)
      .gte('date', startOfMonth)
      .lte('date', endOfMonth)
      .order('date', { ascending: false });

    if (data) setRecords(data as unknown as WorkHourRow[]);
    setLoading(false);
  }

  function calculateHours(start: string, end: string, breakMin: number): { total: number; overtime: number } {
    if (!start || !end) return { total: 0, overtime: 0 };
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    const totalMinutes = (eh * 60 + em) - (sh * 60 + sm) - breakMin;
    const total = Math.max(0, Math.round((totalMinutes / 60) * 100) / 100);
    const overtime = Math.max(0, Math.round((total - STANDARD_HOURS) * 100) / 100);
    return { total, overtime };
  }

  async function handleAddEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!newEntry.user_id || !newEntry.date || !newEntry.start_time || !newEntry.end_time) return;
    setSaving(true);

    const { total, overtime } = calculateHours(newEntry.start_time, newEntry.end_time, newEntry.break_minutes);

    await supabase.from('work_hours_log').upsert({
      user_id: newEntry.user_id,
      company_id: profile!.company_id,
      date: newEntry.date,
      start_time: newEntry.start_time,
      end_time: newEntry.end_time,
      break_minutes: newEntry.break_minutes,
      total_hours: total,
      overtime_hours: overtime,
      notes: newEntry.notes.trim() || null,
      created_by: profile!.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,date' });

    setShowAdd(false);
    setNewEntry({ user_id: '', date: '', start_time: '', end_time: '', break_minutes: 30, notes: '' });
    setSaving(false);
    fetchRecords();
  }

  function exportCSV() {
    const headers = ['Date', 'Employee', 'Start', 'End', 'Break (min)', 'Total Hours', 'Overtime', 'Notes'];
    const csvRows = [headers.join(',')];
    filtered.forEach(r => {
      csvRows.push([r.date, r.user?.full_name || '', r.start_time || '', r.end_time || '', r.break_minutes, r.total_hours || 0, r.overtime_hours || 0, `"${r.notes || ''}"`].join(','));
    });
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `work-hours-${currentMonth.toISOString().slice(0, 7)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const filtered = search
    ? records.filter(r => r.user?.full_name?.toLowerCase().includes(search.toLowerCase()))
    : records;

  const monthLabel = currentMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const totalHours = filtered.reduce((s, r) => s + (r.total_hours || 0), 0);
  const totalOvertime = filtered.reduce((s, r) => s + (r.overtime_hours || 0), 0);

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('hr.attendance.totalHours')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('hr.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={exportCSV}
            className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-xl font-medium text-gray-700 hover:bg-gray-50 text-sm"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
          <button
            type="button"
            onClick={() => { setShowAdd(true); setNewEntry(n => ({ ...n, date: new Date().toISOString().split('T')[0] })); }}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-xl font-medium hover:bg-teal-700 text-sm"
          >
            <Plus className="w-4 h-4" />
            {t('hr.attendance.manualEntry')}
          </button>
        </div>
      </div>

      {/* Stats + Controls */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))} className="p-2 rounded-lg hover:bg-gray-100 border border-gray-200">
            <ChevronLeft className="w-4 h-4 text-gray-600" />
          </button>
          <span className="text-sm font-medium text-gray-900 min-w-[140px] text-center">{monthLabel}</span>
          <button type="button" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))} className="p-2 rounded-lg hover:bg-gray-100 border border-gray-200">
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
        <div className="flex gap-4 items-center ml-auto">
          <span className="text-sm text-gray-600">Total: <strong>{totalHours.toFixed(1)}h</strong></span>
          <span className="text-sm text-teal-700">{t('hr.attendance.overtime')}: <strong>+{totalOvertime.toFixed(1)}h</strong></span>
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
            <p>{t('hr.attendance.noRecords')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">{t('common.date')}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Employee</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Start</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">End</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">{t('hr.attendance.breakMinutes')}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">{t('hr.attendance.totalHours')}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">{t('hr.attendance.overtime')}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Notes</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-medium text-gray-900">{r.date}</td>
                    <td className="px-4 py-3 text-gray-700">{r.user?.full_name || '-'}</td>
                    <td className="px-4 py-3 text-gray-600">{r.start_time?.slice(0, 5) || '-'}</td>
                    <td className="px-4 py-3 text-gray-600">{r.end_time?.slice(0, 5) || '-'}</td>
                    <td className="px-4 py-3 text-gray-600">{r.break_minutes}min</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{r.total_hours ? `${r.total_hours}h` : '-'}</td>
                    <td className="px-4 py-3">
                      {r.overtime_hours && r.overtime_hours > 0 ? (
                        <span className="text-teal-700 font-medium">+{r.overtime_hours}h</span>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs truncate max-w-[120px]">{r.notes || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Entry Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <form onSubmit={handleAddEntry} className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-gray-900">{t('hr.attendance.manualEntry')}</h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Employee</label>
              <select
                value={newEntry.user_id}
                onChange={(e) => setNewEntry(n => ({ ...n, user_id: e.target.value }))}
                required
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm"
              >
                <option value="">-- Select --</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.full_name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.date')}</label>
              <input type="date" value={newEntry.date} onChange={(e) => setNewEntry(n => ({ ...n, date: e.target.value }))} required className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start</label>
                <input type="time" value={newEntry.start_time} onChange={(e) => setNewEntry(n => ({ ...n, start_time: e.target.value }))} required className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End</label>
                <input type="time" value={newEntry.end_time} onChange={(e) => setNewEntry(n => ({ ...n, end_time: e.target.value }))} required className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('hr.attendance.breakMinutes')}</label>
              <input type="number" value={newEntry.break_minutes} onChange={(e) => setNewEntry(n => ({ ...n, break_minutes: Number(e.target.value) }))} min={0} max={180} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm" />
            </div>

            {newEntry.start_time && newEntry.end_time && (
              <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl text-sm text-teal-800 font-medium">
                {t('hr.attendance.totalHours')}: {calculateHours(newEntry.start_time, newEntry.end_time, newEntry.break_minutes).total}h
                {calculateHours(newEntry.start_time, newEntry.end_time, newEntry.break_minutes).overtime > 0 && (
                  <span className="ml-2">({t('hr.attendance.overtime')}: +{calculateHours(newEntry.start_time, newEntry.end_time, newEntry.break_minutes).overtime}h)</span>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <input type="text" value={newEntry.notes} onChange={(e) => setNewEntry(n => ({ ...n, notes: e.target.value }))} placeholder="..." className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm" />
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowAdd(false)} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-gray-700 font-medium hover:bg-gray-50">{t('common.cancel')}</button>
              <button type="submit" disabled={saving} className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-xl font-medium hover:bg-teal-700 disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {t('common.save')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
