import { useState } from 'react';
import { MapPin, Route } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import LiveFleetMap from '../../components/fleet/LiveFleetMap';
import CompanyRoutePlanner from './RoutePlanner';

type Tab = 'map' | 'planner';

export default function LiveMapWithPlanner() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>('map');

  if (!profile?.company_id) return null;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('nav.liveMap')}</h1>
          <p className="text-slate-500 mt-1">{t('liveMap.subtitle')}</p>
        </div>
      </div>

      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('map')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'map' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <MapPin className="w-4 h-4" />
          {t('liveMap.liveTab')}
        </button>
        <button
          onClick={() => setActiveTab('planner')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'planner' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Route className="w-4 h-4" />
          {t('nav.routePlanner')}
        </button>
      </div>

      {activeTab === 'map' && (
        <LiveFleetMap companyId={profile.company_id} height="calc(100dvh - 380px)" />
      )}
      {activeTab === 'planner' && (
        <CompanyRoutePlanner />
      )}
    </div>
  );
}
