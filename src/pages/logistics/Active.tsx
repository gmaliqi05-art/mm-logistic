import { useEffect, useState } from 'react';
import { Truck, MapPin, User, Clock, Package } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PageSkeleton } from '../../components/ui/Skeleton';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';

interface ActiveDelivery {
  id: string;
  note_number: string;
  status: string;
  delivery_address: string | null;
  created_at: string;
  partner_name: string | null;
  driver?: { full_name: string; phone: string } | null;
}

const STATUS_TONE: Record<string, string> = {
  sent: 'bg-sky-100 text-sky-700',
  in_transit: 'bg-blue-100 text-blue-700',
  delivered: 'bg-emerald-100 text-emerald-700',
  confirmed: 'bg-emerald-100 text-emerald-700',
  completed: 'bg-emerald-100 text-emerald-700',
};

export default function LogisticsActive() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [rows, setRows] = useState<ActiveDelivery[]>([]);
  const [filter, setFilter] = useState<'all' | 'sent' | 'in_transit' | 'delivered'>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.company_id) return;
    load();

    const channel = supabase
      .channel(`logistics-active-${profile.company_id}`)
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
      const { data } = await supabase
        .from('delivery_notes')
        .select(
          'id, note_number, status, delivery_address, created_at, partner_name, driver:profiles!delivery_notes_assigned_driver_id_fkey(full_name, phone)',
        )
        .eq('company_id', companyId)
        .in('status', ['sent', 'in_transit', 'delivered', 'confirmed', 'completed'])
        .not('assigned_driver_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(100);
      setRows((data as unknown as ActiveDelivery[]) ?? []);
    } finally {
      setLoading(false);
    }
  }

  const statusLabel = (s: string) => t(`logistics.status.${s}`) || s;
  const filtered = filter === 'all' ? rows : rows.filter((r) => r.status === filter);

  if (loading) {
    return <PageSkeleton rows={8} cols={6} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('logistics.active.title')}</h1>
        <p className="text-gray-500 mt-1">{t('logistics.active.subtitle')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 pb-2">
        {(['all', 'sent', 'in_transit', 'delivered'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f ? 'bg-teal-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            {f === 'all' ? `${t('common.all')} (${rows.length})` : statusLabel(f)}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-16 text-center">
          <Truck className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <p className="text-gray-500 text-sm">{t('logistics.active.empty')}</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {t('logistics.active.columnNote')}
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {t('logistics.active.columnClient')}
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {t('logistics.active.columnDriver')}
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">
                    {t('logistics.active.columnAddress')}
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {t('common.status')}
                  </th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {t('common.date')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-gray-400" />
                        <p className="text-sm font-bold text-gray-900">{r.note_number}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">{r.partner_name ?? '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      <div className="inline-flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-gray-400" />
                        {r.driver?.full_name ?? '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 hidden md:table-cell max-w-[260px] truncate">
                      <div className="inline-flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-gray-400" />
                        {r.delivery_address || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          STATUS_TONE[r.status] ?? 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {statusLabel(r.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center gap-1 text-xs text-gray-400">
                        <Clock className="w-3.5 h-3.5" />
                        {new Date(r.created_at).toLocaleDateString()}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
