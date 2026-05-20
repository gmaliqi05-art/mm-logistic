import { useState, useEffect } from 'react';
import { Clock, Plus, Loader2, ChevronLeft, ChevronRight, Save } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import BackButton from '../../components/BackButton';

interface WorkHourEntry {
  id: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  break_minutes: number;
  total_hours: number | null;
  overtime_hours: number | null;
  notes: string | null;
}

const STANDARD_HOURS = 8;

export default function MyWorkHours() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [entries, setEntries] = useState<WorkHourEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [newEntry, setNewEntry] = useState({ date: '', start_time: '', end_time: '', break_minutes: 30, notes: '' });
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile?.id) fetchEntries();
  }, [profile?.id, currentMonth]);

  async function fetchEntries() {
    setLoading(true);
    const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).toISOString().split('T')[0];
    const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).toISOString().split('T')[0];

    const { data } = await supabase
      .from('work_hours_log')
      .select('*')
      .eq('user_id', profile!.id)
      .gte('date', startOfMonth)
      .lte('date', endOfMonth)
      .order('date', { ascending: false });

    if (data) setEntries(data);
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
    if (!newEntry.date || !newEntry.start_time || !newEntry.end_time) return;
    setSaving(true);

    const { total, overtime } = calculateHours(newEntry.start_time, newEntry.end_time, newEntry.break_minutes);

    await supabase.from('work_hours_log').upsert({
      user_id: profile!.id,
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
    setNewEntry({ date: '', start_time: '', end_time: '', break_minutes: 30, notes: '' });
    setSaving(false);
    fetchEntries();
  }

  const monthLabel = currentMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const totalMonthHours = entries.reduce((sum, e) => sum + (e.total_hours || 0), 0);
  const totalOvertime = entries.reduce((sum, e) => sum + (e.overtime_hours || 0), 0);
  const workDays = entries.filter(e => e.total_hours && e.total_hours > 0).length;

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
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('hr.attendance.title')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('hr.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => { setShowAdd(true); setNewEntry(n => ({ ...n, date: new Date().toISOString().split('T')[0] })); }}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white rounded-xl font-medium hover:bg-teal-700 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          {t('hr.attendance.manualEntry')}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{workDays}</p>
          <p className="text-xs text-gray-500">{t('hr.attendance.present')}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{totalMonthHours.toFixed(1)}h</p>
          <p className="text-xs text-gray-500">{t('hr.attendance.totalHours')}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-teal-700">{totalOvertime.toFixed(1)}h</p>
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

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        {entries.length === 0 ? (
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
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Start</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">End</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">{t('hr.attendance.breakMinutes')}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">{t('hr.attendance.totalHours')}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">{t('hr.attendance.overtime')}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Notes</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-medium text-gray-900">{entry.date}</td>
                    <td className="px-4 py-3 text-gray-600">{entry.start_time?.slice(0, 5) || '-'}</td>
                    <td className="px-4 py-3 text-gray-600">{entry.end_time?.slice(0, 5) || '-'}</td>
                    <td className="px-4 py-3 text-gray-600">{entry.break_minutes}min</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{entry.total_hours ? `${entry.total_hours}h` : '-'}</td>
                    <td className="px-4 py-3">
                      {entry.overtime_hours && entry.overtime_hours > 0 ? (
                        <span className="text-teal-700 font-medium">+{entry.overtime_hours}h</span>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs truncate max-w-[120px]">{entry.notes || '-'}</td>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.date')}</label>
              <input
                type="date"
                value={newEntry.date}
                onChange={(e) => setNewEntry(n => ({ ...n, date: e.target.value }))}
                required
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start</label>
                <input
                  type="time"
                  value={newEntry.start_time}
                  onChange={(e) => setNewEntry(n => ({ ...n, start_time: e.target.value }))}
                  required
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End</label>
                <input
                  type="time"
                  value={newEntry.end_time}
                  onChange={(e) => setNewEntry(n => ({ ...n, end_time: e.target.value }))}
                  required
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('hr.attendance.breakMinutes')}</label>
              <input
                type="number"
                value={newEntry.break_minutes}
                onChange={(e) => setNewEntry(n => ({ ...n, break_minutes: Number(e.target.value) }))}
                min={0}
                max={180}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm"
              />
            </div>

            {newEntry.start_time && newEntry.end_time && (
              <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl text-sm">
                <span className="text-teal-800 font-medium">
                  {t('hr.attendance.totalHours')}: {calculateHours(newEntry.start_time, newEntry.end_time, newEntry.break_minutes).total}h
                  {calculateHours(newEntry.start_time, newEntry.end_time, newEntry.break_minutes).overtime > 0 && (
                    <span className="ml-2">({t('hr.attendance.overtime')}: +{calculateHours(newEntry.start_time, newEntry.end_time, newEntry.break_minutes).overtime}h)</span>
                  )}
                </span>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <input
                type="text"
                value={newEntry.notes}
                onChange={(e) => setNewEntry(n => ({ ...n, notes: e.target.value }))}
                placeholder="..."
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-gray-700 font-medium hover:bg-gray-50"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-xl font-medium hover:bg-teal-700 disabled:opacity-50"
              >
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
