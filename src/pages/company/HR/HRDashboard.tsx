import { useState, useEffect } from 'react';
import { Users, Calendar, Clock, AlertTriangle, Loader2, ArrowRight, Timer } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { useTranslation } from '../../../i18n';
import {
  isoWeekStart,
  isoWeekEnd,
  pickWeeklyBreaches,
  summarizeWeeklyHours,
  type UserWeeklyTotal,
  type WorkHourRow,
} from '../../../utils/weeklyHours';

interface Stats {
  totalEmployees: number;
  onLeaveToday: number;
  pendingRequests: number;
  lateThisMonth: number;
}

interface RecentRequest {
  id: string;
  start_date: string;
  end_date: string;
  total_days: number;
  status: string;
  created_at: string;
  user: { full_name: string } | null;
  leave_type: { name_en: string; name_sq: string; name_de: string; name_fr: string; color: string } | null;
}

interface Holiday {
  id: string;
  date: string;
  name: string;
}

export default function HRDashboard() {
  const { profile } = useAuth();
  const { t, language } = useTranslation();
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats>({ totalEmployees: 0, onLeaveToday: 0, pendingRequests: 0, lateThisMonth: 0 });
  const [recentRequests, setRecentRequests] = useState<RecentRequest[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [weeklyBreaches, setWeeklyBreaches] = useState<(UserWeeklyTotal & { fullName?: string })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile?.company_id) fetchDashboard();
  }, [profile?.company_id]);

  async function fetchDashboard() {
    const companyId = profile!.company_id;
    const today = new Date().toISOString().split('T')[0];
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

    const now = new Date();
    const weekStart = isoWeekStart(now);
    const weekEnd = isoWeekEnd(now);

    const [empRes, leaveRes, pendRes, lateRes, reqRes, holRes, hoursRes] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('is_active', true),
      supabase.from('attendance_records').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('date', today).eq('status', 'leave'),
      supabase.from('leave_requests').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'pending'),
      supabase.from('attendance_records').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'late').gte('date', monthStart),
      supabase.from('leave_requests').select('id, start_date, end_date, total_days, status, created_at, user:profiles!leave_requests_user_id_fkey(full_name), leave_type:leave_types(name_en, name_sq, name_de, name_fr, color)').eq('company_id', companyId).order('created_at', { ascending: false }).limit(8),
      supabase.from('public_holidays').select('id, date, name').eq('company_id', companyId).gte('date', today).order('date').limit(5),
      supabase.from('work_hours_log')
        .select('user_id, date, total_hours, user:profiles!work_hours_log_user_id_fkey(full_name)')
        .eq('company_id', companyId)
        .gte('date', weekStart)
        .lte('date', weekEnd),
    ]);

    setStats({
      totalEmployees: empRes.count || 0,
      onLeaveToday: leaveRes.count || 0,
      pendingRequests: pendRes.count || 0,
      lateThisMonth: lateRes.count || 0,
    });
    if (reqRes.data) setRecentRequests(reqRes.data as unknown as RecentRequest[]);
    if (holRes.data) setHolidays(holRes.data);

    const hoursRows = (hoursRes.data ?? []) as Array<WorkHourRow & { user?: { full_name?: string } | { full_name?: string }[] | null }>;
    const summary = summarizeWeeklyHours(hoursRows.map(({ user_id, date, total_hours }) => ({ user_id, date, total_hours })), now);
    const breaches = pickWeeklyBreaches(summary);
    // Re-attach full_name from the joined profile rows (Supabase types these
    // as either single object or array depending on cardinality)
    const nameByUser = new Map<string, string>();
    for (const r of hoursRows) {
      const u = Array.isArray(r.user) ? r.user[0] : r.user;
      if (u?.full_name) nameByUser.set(r.user_id, u.full_name);
    }
    setWeeklyBreaches(breaches.map((b) => ({ ...b, fullName: nameByUser.get(b.userId) })));
    setLoading(false);
  }

  function getTypeName(lt: RecentRequest['leave_type']) {
    if (!lt) return '';
    const key = `name_${language}` as keyof typeof lt;
    return (lt[key] as string) || lt.name_en;
  }

  const statCards = [
    { label: t('hr.dashboard.totalEmployees'), value: stats.totalEmployees, icon: Users, color: 'bg-blue-50 text-blue-600' },
    { label: t('hr.dashboard.onLeaveToday'), value: stats.onLeaveToday, icon: Calendar, color: 'bg-amber-50 text-amber-600' },
    { label: t('hr.dashboard.pendingRequests'), value: stats.pendingRequests, icon: Clock, color: 'bg-teal-50 text-teal-600' },
    { label: t('hr.dashboard.lateThisMonth'), value: stats.lateThisMonth, icon: AlertTriangle, color: 'bg-red-50 text-red-600' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">{t('hr.dashboard.title')}</h1>
        <p className="text-sm text-gray-500 mt-1">{t('hr.subtitle')}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <div className={`w-10 h-10 rounded-lg ${s.color} flex items-center justify-center mb-3`}>
                <Icon className="w-5 h-5" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{s.value}</p>
              <p className="text-xs text-gray-500 mt-1">{s.label}</p>
            </div>
          );
        })}
      </div>

      {weeklyBreaches.length > 0 && (
        <Link
          to="/company/hr/work-hours"
          className={`block rounded-xl border p-4 transition-colors ${
            weeklyBreaches.some((b) => b.level === 'hard_over')
              ? 'bg-red-50 border-red-200 hover:border-red-300'
              : 'bg-amber-50 border-amber-200 hover:border-amber-300'
          }`}
        >
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-lg flex-shrink-0 ${
              weeklyBreaches.some((b) => b.level === 'hard_over') ? 'bg-red-100' : 'bg-amber-100'
            }`}>
              <Timer className={`w-5 h-5 ${
                weeklyBreaches.some((b) => b.level === 'hard_over') ? 'text-red-700' : 'text-amber-700'
              }`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">
                {weeklyBreaches.length === 1
                  ? '1 punonjes ka kaluar limitin javor (EU Working Time Directive)'
                  : `${weeklyBreaches.length} punonjes kane kaluar limitin javor (EU Working Time Directive)`}
              </p>
              <ul className="mt-1.5 space-y-0.5 text-xs">
                {weeklyBreaches.slice(0, 5).map((b) => (
                  <li key={b.userId} className={b.level === 'hard_over' ? 'text-red-800' : 'text-amber-800'}>
                    <span className="font-medium">{b.fullName ?? b.userId}</span>
                    {' — '}
                    <strong>{b.totalHours}h</strong>
                    {' '}
                    {b.level === 'hard_over' ? '(mbi limitin absolut prej 60h)' : '(mbi mesataren e lejuar prej 48h)'}
                  </li>
                ))}
                {weeklyBreaches.length > 5 && (
                  <li className="font-medium text-gray-700">+{weeklyBreaches.length - 5} te tjere</li>
                )}
              </ul>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-500 flex-shrink-0 mt-1" />
          </div>
        </Link>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Requests */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between p-5 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">{t('hr.dashboard.recentRequests')}</h2>
            <button
              type="button"
              onClick={() => navigate('/company/hr/requests')}
              className="text-sm text-teal-600 hover:text-teal-700 font-medium inline-flex items-center gap-1"
            >
              {t('common.all')} <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="divide-y divide-gray-50">
            {recentRequests.length === 0 ? (
              <p className="p-5 text-sm text-gray-500">{t('hr.leave.noRequests')}</p>
            ) : (
              recentRequests.map((req) => (
                <div key={req.id} className="px-5 py-3 flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: req.leave_type?.color || '#999' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{req.user?.full_name}</p>
                    <p className="text-xs text-gray-500">{getTypeName(req.leave_type)} &middot; {req.start_date} &mdash; {req.end_date}</p>
                  </div>
                  <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${
                    req.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                    req.status === 'approved' ? 'bg-green-100 text-green-700' :
                    req.status === 'rejected' ? 'bg-red-100 text-red-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {t(`hr.leave.${req.status}`)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Upcoming Holidays */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="p-5 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">{t('hr.dashboard.upcomingHolidays')}</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {holidays.length === 0 ? (
              <p className="p-5 text-sm text-gray-500">{t('common.noData')}</p>
            ) : (
              holidays.map((h) => (
                <div key={h.id} className="px-5 py-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-teal-50 flex items-center justify-center">
                    <Calendar className="w-4 h-4 text-teal-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{h.name}</p>
                    <p className="text-xs text-gray-500">{h.date}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
