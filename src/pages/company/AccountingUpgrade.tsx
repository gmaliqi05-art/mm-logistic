import { useState } from 'react';
import { Calculator, Check, Sparkles, ArrowLeft } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import AccountingUpgradeModal from '../../components/subscription/AccountingUpgradeModal';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { useTranslation } from '../../i18n';

const BULLETS = [
  'Faturat e skanuara kategorizohen automatikisht dhe bien ne vendet e duhura.',
  'Kompanite e reja njihen nga dokumenti dhe krijohen me nje klik.',
  'Raportet financiare: P&L, TVSH, bilanc, eksport Datev / UStVa.',
  'Menagjim i aseteve fikse dhe amortizim linear.',
  'Lidhje direkte me fletedergesat, shitjet dhe blerjet e kompanise.',
];

export default function AccountingUpgrade() {
  const { t } = useTranslation();
  const [showModal, setShowModal] = useState(false);
  const navigate = useNavigate();
  const { accountingEnabled } = useSubscription();

  if (accountingEnabled) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center">
        <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto mb-4">
          <Check className="w-7 h-7" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">{t('common.kontabilitetiEshteAktiv')}</h1>
        <p className="text-slate-500 mt-2">{t('common.mundTeHyshNeDashboardinE')}</p>
        <button
          onClick={() => navigate('/accounting')}
          className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 text-white font-semibold hover:bg-teal-700"
        >
          <Calculator className="w-4 h-4" /> Hape Kontabilitetin
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <Link to="/company" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="w-4 h-4" />{t('common.kthehuNeDashboard')}</Link>

      <div className="rounded-3xl overflow-hidden shadow-lg border border-teal-200">
        <div className="bg-gradient-to-br from-teal-600 to-emerald-700 text-white p-8 sm:p-10">
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-teal-100 mb-3">
            <Sparkles className="w-4 h-4" /> Oferte 50% ZBRITJE
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold leading-tight">
            Aktivizo Kontabilitetin e integruar
          </h1>
          <p className="mt-3 text-teal-50/90 text-lg max-w-xl">
            Si abonues ekzistues, merr modulin e kontabilitetit me gjysme cmimi dhe lidh
            automatikisht te dhenat e kompanise me librin financiar.
          </p>
        </div>
        <div className="bg-white p-8 sm:p-10 space-y-6">
          <ul className="space-y-3">
            {BULLETS.map((b) => (
              <li key={b} className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Check className="w-3.5 h-3.5" strokeWidth={3} />
                </span>
                <span className="text-slate-700">{b}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
            <button
              onClick={() => setShowModal(true)}
              className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-teal-600 text-white font-bold hover:bg-teal-700 shadow-sm"
            >
              <Calculator className="w-5 h-5" />
              Aktivizo me cmim te pergjysmuar
            </button>
            <Link
              to="/company"
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200"
            >
              Me vone
            </Link>
          </div>
        </div>
      </div>

      {showModal && <AccountingUpgradeModal onClose={() => setShowModal(false)} />}
    </div>
  );
}
