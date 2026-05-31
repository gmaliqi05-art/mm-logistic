import { useAuth } from '../../contexts/AuthContext';
import LiveFleetMap from '../../components/fleet/LiveFleetMap';
import { useTranslation } from '../../i18n';

export default function LogisticsLiveMap() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  if (!profile?.company_id) return null;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Live Fleet Map</h1>
        <p className="text-sm text-slate-600 mt-1">{t('common.realTimePositionsOfDriversOnRoad')}</p>
      </div>
      <LiveFleetMap companyId={profile.company_id} height="calc(100dvh - 260px)" />
    </div>
  );
}
