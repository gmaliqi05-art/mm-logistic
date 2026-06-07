import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Wrench, BarChart3 } from 'lucide-react';
import { useTranslation } from '../../i18n';
import CompanyRepairReports from './RepairReports';
import WorkerRepairStats from './WorkerRepairStats';

type Tab = 'reports' | 'workers';

/**
 * Repair hub — consolidates the former /company/repair-reports and
 * /company/worker-repair-stats pages into one tabbed view. Both showed
 * different lenses on the same depot_repairs data; merging them removes a
 * sidebar item and an entire duplicate navigation target. The legacy
 * worker-repair-stats route redirects here with ?tab=workers.
 */
export default function RepairHub() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const initial: Tab = params.get('tab') === 'workers' ? 'workers' : 'reports';
  const [tab, setTab] = useState<Tab>(initial);

  const selectTab = (next: Tab) => {
    setTab(next);
    const p = new URLSearchParams(params);
    if (next === 'workers') p.set('tab', 'workers');
    else p.delete('tab');
    setParams(p, { replace: true });
  };

  const tabs: { key: Tab; label: string; icon: typeof Wrench }[] = [
    { key: 'reports', label: t('company.repairReports.title'), icon: Wrench },
    { key: 'workers', label: t('company.workerRepairStats.title'), icon: BarChart3 },
  ];

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-200">
        <nav className="flex gap-1 -mb-px" aria-label="Repair views">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => selectTab(key)}
              className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
                tab === key
                  ? 'border-teal-600 text-teal-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
              aria-current={tab === key ? 'page' : undefined}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'reports' ? <CompanyRepairReports embedded /> : <WorkerRepairStats embedded />}
    </div>
  );
}
