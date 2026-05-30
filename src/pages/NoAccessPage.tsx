import { LogOut, ShieldAlert } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../i18n';

export default function NoAccessPage() {
  const { t } = useTranslation();
  const { profile, signOut } = useAuth();
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
        <div className="mx-auto w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mb-4">
          <ShieldAlert className="w-7 h-7 text-amber-600" />
        </div>
        <h1 className="text-xl font-semibold text-slate-900">Llogaria juaj nuk ka qasje ne dashboard</h1>
        <p className="text-sm text-slate-600 mt-2">
          {profile?.full_name ? `${profile.full_name}, ` : ''}
          llogaria juaj sherben vetem per gjurmimin e punes ne raporte. Depoisti i depo-s tuaj e regjistron prodhimin tuaj te perditshem.
        </p>
        <p className="text-xs text-slate-400 mt-3">{t('common.neseMendoniQeKyEshteGabim')}</p>
        <button
          onClick={() => signOut()}
          className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800"
        >
          <LogOut className="w-4 h-4" /> Dilni
        </button>
      </div>
    </div>
  );
}
