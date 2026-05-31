import { useState, useEffect } from 'react';
import { Settings as SettingsIcon, User, Bell, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import PushNotificationSettings from '../../components/PushNotificationSettings';
import { useTranslation } from '../../i18n';

export default function DepotSettings() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [companyName, setCompanyName] = useState('');
  const [depotName, setDepotName] = useState('');

  useEffect(() => {
    if (!profile) return;
    if (profile.company_id) {
      supabase
        .from('companies')
        .select('name')
        .eq('id', profile.company_id)
        .maybeSingle()
        .then(({ data }) => setCompanyName(data?.name ?? ''));
    }
    if (profile.depot_id) {
      supabase
        .from('depots')
        .select('name')
        .eq('id', profile.depot_id)
        .maybeSingle()
        .then(({ data }) => setDepotName(data?.name ?? ''));
    }
  }, [profile]);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-teal-100 rounded-xl">
          <SettingsIcon className="w-6 h-6 text-teal-700" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Cilesimet</h1>
          <p className="text-sm text-gray-500">{t('common.profileAndNotifications')}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
          <User className="w-5 h-5 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-900">Profili</h2>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Emri</span>
            <span className="text-sm font-medium text-gray-900">{profile?.full_name ?? '-'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Email</span>
            <span className="text-sm font-medium text-gray-900">{profile?.email ?? '-'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">{t('common.company')}</span>
            <span className="text-sm font-medium text-gray-900">{companyName || '-'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Depo</span>
            <span className="text-sm font-medium text-gray-900">{depotName || '-'}</span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
          <Bell className="w-5 h-5 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-900">Njoftimet Push</h2>
        </div>
        <div className="px-5 py-4">
          <PushNotificationSettings />
        </div>
      </div>

      <div className="pt-4 border-t border-gray-200">
        <a
          href="/settings/account"
          className="inline-flex items-center gap-2 text-sm text-red-600 hover:text-red-700 font-medium transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          Fshi llogarine
        </a>
        <p className="text-xs text-gray-400 mt-1 ml-6">
          Fshini llogarine tuaj dhe te dhenat personale
        </p>
      </div>
    </div>
  );
}
