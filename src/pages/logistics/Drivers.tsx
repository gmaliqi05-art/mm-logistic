import { useEffect, useState } from 'react';
import { Truck, Phone, Mail, Activity } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PageSkeleton } from '../../components/ui/Skeleton';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';

interface DriverRow {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  is_active: boolean;
  active_count: number;
  delivered_count: number;
}

export default function LogisticsDrivers() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile?.company_id) load();
  }, [profile?.company_id]);

  async function load() {
    try {
      setLoading(true);
      const companyId = profile!.company_id!;
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email, phone, is_active')
        .eq('company_id', companyId)
        .eq('role', 'driver')
        .order('full_name');

      const driverIds = (profiles ?? []).map((p) => p.id);
      if (driverIds.length === 0) {
        setDrivers([]);
        return;
      }

      const [activeRes, deliveredRes] = await Promise.all([
        supabase
          .from('acc_delivery_notes')
          .select('assigned_driver_id')
          .eq('company_id', companyId)
          .in('status', ['assigned', 'in_transit'])
          .in('assigned_driver_id', driverIds),
        supabase
          .from('acc_delivery_notes')
          .select('assigned_driver_id')
          .eq('company_id', companyId)
          .in('status', ['delivered', 'confirmed'])
          .in('assigned_driver_id', driverIds),
      ]);

      const activeMap = new Map<string, number>();
      for (const r of activeRes.data ?? []) {
        const id = (r as { assigned_driver_id: string }).assigned_driver_id;
        activeMap.set(id, (activeMap.get(id) ?? 0) + 1);
      }
      const deliveredMap = new Map<string, number>();
      for (const r of deliveredRes.data ?? []) {
        const id = (r as { assigned_driver_id: string }).assigned_driver_id;
        deliveredMap.set(id, (deliveredMap.get(id) ?? 0) + 1);
      }

      setDrivers(
        (profiles ?? []).map((p) => ({
          id: p.id,
          full_name: p.full_name,
          email: p.email,
          phone: p.phone,
          is_active: p.is_active,
          active_count: activeMap.get(p.id) ?? 0,
          delivered_count: deliveredMap.get(p.id) ?? 0,
        })),
      );
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <PageSkeleton rows={8} cols={4} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('common.shoferet2')}</h1>
        <p className="text-gray-500 mt-1">Ngarkesa aktuale dhe historiku i dergesave</p>
      </div>

      {drivers.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-16 text-center">
          <Truck className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <p className="text-gray-500 text-sm">{t('common.nukKaShofereTeRegjistruar')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {drivers.map((d) => (
            <div
              key={d.id}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center font-bold">
                  {d.full_name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{d.full_name}</p>
                  <span
                    className={`inline-flex items-center gap-1 text-xs ${
                      d.is_active ? 'text-emerald-600' : 'text-gray-400'
                    }`}
                  >
                    <Activity className="w-3 h-3" />
                    {d.is_active ? 'Aktiv' : 'Joaktiv'}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5 mb-4">
                {d.email && (
                  <p className="text-xs text-gray-500 inline-flex items-center gap-1.5">
                    <Mail className="w-3 h-3" />
                    {d.email}
                  </p>
                )}
                {d.phone && (
                  <p className="text-xs text-gray-500 inline-flex items-center gap-1.5">
                    <Phone className="w-3 h-3" />
                    {d.phone}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 pt-3 border-t border-gray-100">
                <div className="text-center">
                  <p className="text-xs text-gray-500">Aktive</p>
                  <p className="text-xl font-bold text-amber-600">{d.active_count}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-500">Te dorezuara</p>
                  <p className="text-xl font-bold text-emerald-600">{d.delivered_count}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
