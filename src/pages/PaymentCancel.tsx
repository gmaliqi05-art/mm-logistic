import { useNavigate } from 'react-router-dom';
import { XCircle, ArrowRight, RotateCcw } from 'lucide-react';
import { useTranslation } from '../i18n';

export default function PaymentCancel() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 mb-6">
          <XCircle className="w-8 h-8 text-amber-600" />
        </div>
        <h1 className="text-2xl font-bold text-slate-800">{t('payment.cancelTitle')}</h1>
        <p className="mt-3 text-slate-500 leading-relaxed">
          {t('payment.cancelMessage')}
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => navigate('/register')}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-teal-600 text-white font-semibold hover:bg-teal-700 transition-all"
          >
            <RotateCcw className="w-4 h-4" />
            {t('payment.tryAgain')}
          </button>
          <button
            onClick={() => navigate('/login')}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-slate-50 transition-all"
          >
            {t('payment.goToLogin')}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
