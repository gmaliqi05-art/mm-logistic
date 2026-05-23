import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Truck,
  ClipboardList,
  Users,
  CheckCircle2,
  ArrowRight,
  Clock,
  MapPin,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PageSkeleton } from '../../components/ui/Skeleton';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';

interface DashboardStats {
  pending: number;
  assigned: number;
  inTransit: number;
  delivered: number;
  drivers: number;
}

interface PendingNote {
  id: string;
  note_number: string;
  created_at: string;
  delivery_address: string | null;
  status: string;
  partner_name: string | null;
}

export default function LogisticsDashboard() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [stats, setStats] = useState<DashboardStats>({
    pending: 0,
    assigned: 0,
    inTransit: 0,
    delivered: 0,
    drivers: 0,
  });
  const [recentPending, setRecentPending] = useState<PendingNote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.company_id) return;
    load();

    const channel = supabase
      .channel(`logistics-dashboard-${profile.company_id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'delivery_notes', filter: `company_id=eq.${profile.company_id}` },
        () => load(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.company_id]);

  async function load() {
    try {
      setLoading(true);
      const companyId = profile!.company_id!;

      const [pendingRes, assignedRes, inTransitRes, deliveredRes, driversRes, listRes] = await Promise.all([
        supabase
          .from('delivery_notes')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .in('status', ['draft', 'sent'])
          .is('assigned_driver_id', null),
        supabase
          .from('delivery_notes')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .eq('status', 'sent')
          .not('assigned_driver_id', 'is', null),
        supabase
          .from('delivery_notes')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .eq('status', 'in_transit'),
        supabase
          .from('delivery_notes')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .in('status', ['delivered', 'confirmed', 'completed']),
        supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .eq('role', 'driver')
          .eq('is_active', true),
        supabase
          .from('delivery_notes')
          .select('id, note_number, created_at, delivery_address, status, partner_name')
          .eq('company_id', companyId)
          .in('status', ['draft', 'sent'])
          .is('assigned_driver_id', null)
          .order('created_at', { ascending: false })
          .limit(5),
      ]);

      setStats({
        pending: pendingRes.count ?? 0,
        assigned: assignedRes.count ?? 0,
        inTransit: inTransitRes.count ?? 0,
        delivered: deliveredRes.count ?? 0,
        drivers: driversRes.count ?? 0,
      });
      setRecentPending((listRes.data as PendingNote[]) ?? []);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <PageSkeleton rows={6} cols={4} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('logistics.dashboard.title')}</h1>
        <p className="text-gray-500 mt-1">{t('logistics.dashboard.subtitle')}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label={t('logistics.dashboard.pending')} value={stats.pending} tone="amber" icon={<ClipboardList className="w-5 h-5" />} />
        <StatCard label={t('logistics.dashboard.assigned')} value={stats.assigned} tone="sky" icon={<Users className="w-5 h-5" />} />
        <StatCard label={t('logistics.dashboard.inTransit')} value={stats.inTransit} tone="blue" icon={<Truck className="w-5 h-5" />} />
        <StatCard label={t('logistics.dashboard.delivered')} value={stats.delivered} tone="emerald" icon={<CheckCircle2 className="w-5 h-5" />} />
        <StatCard label={t('logistics.dashboard.drivers')} value={stats.drivers} tone="slate" icon={<Users className="w-5 h-5" />} />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-amber-600" />
          <h3 className="text-sm font-semibold text-gray-900">{t('logistics.dashboard.pendingListTitle')}</h3>
          <Link
            to="/logistics/dispatch"
            className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800"
          >
            {t('logistics.dashboard.seeAll')}
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        {recentPending.length === 0 ? (
          <div className="p-12 text-center">
            <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-emerald-300" />
            <p className="text-sm text-gray-500">{t('logistics.dashboard.emptyPending')}</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {recentPending.map((n) => (
              <li key={n.id} className="px-5 py-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-gray-900">{n.note_number}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{n.partner_name ?? t('logistics.dashboard.noClient')}</p>
                    {n.delivery_address && (
                      <p className="text-xs text-gray-400 mt-1 inline-flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {n.delivery_address}
                      </p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-gray-400 inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(n.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const TONES: Record<string, string> = {
  amber: 'bg-amber-100 text-amber-700',
  sky: 'bg-sky-100 text-sky-700',
  blue: 'bg-blue-100 text-blue-700',
  emerald: 'bg-emerald-100 text-emerald-700',
  slate: 'bg-slate-100 text-slate-700',
};

function StatCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-gray-500 truncate">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
        <div className={`p-2 rounded-lg flex-shrink-0 ${TONES[tone] ?? TONES.slate}`}>{icon}</div>
      </div>
    </div>
  );
}
