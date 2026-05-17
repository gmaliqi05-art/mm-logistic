import { useState } from 'react';
import { Truck, Container, ScanLine } from 'lucide-react';
import { useTranslation } from '../../i18n';
import CompanyVehicles from './Vehicles';
import CompanyTrailersPage from './Trailers';
import CompanyFleetScans from './FleetScans';

type Tab = 'flota' | 'rimorkio' | 'skanimi';

const TABS: { key: Tab; icon: typeof Truck; labelKey: string }[] = [
  { key: 'flota', icon: Truck, labelKey: 'nav.fleet' },
  { key: 'rimorkio', icon: Container, labelKey: 'nav.trailers' },
  { key: 'skanimi', icon: ScanLine, labelKey: 'nav.fleetScans' },
];

export default function Automjetet() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>('flota');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('nav.automjetet')}</h1>
        <p className="text-slate-500 mt-1">{t('automjetet.subtitle')}</p>
      </div>

      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto">
        {TABS.map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {t(tab.labelKey)}
            </button>
          );
        })}
      </div>

      <div>
        {activeTab === 'flota' && <CompanyVehicles />}
        {activeTab === 'rimorkio' && <CompanyTrailersPage />}
        {activeTab === 'skanimi' && <CompanyFleetScans />}
      </div>
    </div>
  );
}
